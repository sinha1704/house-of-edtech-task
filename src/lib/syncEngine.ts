import { 
  localDb, 
  getPendingMutations, 
  updateMutationStatus, 
  deleteMutation, 
  saveLocalDocument, 
  getLocalDocument,
  type LocalDocument,
  type OfflineMutation
} from './indexedDb';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private currentState: SyncState = 'idle';
  private syncTimeout: NodeJS.Timeout | null = null;
  private activeDocumentId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentState = navigator.onLine ? 'idle' : 'offline';
      
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network online. Triggering sync.');
        this.setState('idle');
        this.triggerSync();
      });
      
      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Network offline.');
        this.setState('offline');
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: SyncState) {
    this.currentState = state;
    this.listeners.forEach(listener => listener(state));
  }

  public getStatus(): SyncState {
    return this.currentState;
  }

  public setActiveDocument(documentId: string) {
    this.activeDocumentId = documentId;
    this.triggerSync();
  }

  public triggerSync() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    
    this.syncTimeout = setTimeout(async () => {
      if (this.currentState === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        this.setState('offline');
        return;
      }
      
      if (!this.activeDocumentId) return;
      
      try {
        await this.runSyncLoop(this.activeDocumentId);
      } catch (err) {
        console.error('[SyncEngine] Sync failed:', err);
        this.setState('error');
      }
    }, 500); // Debounce sync triggers slightly
  }

  private async runSyncLoop(documentId: string) {
    if (this.currentState === 'syncing') return;
    this.setState('syncing');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('[SyncEngine] No auth token found. Deferring sync.');
        this.setState('idle');
        return;
      }

      // 1. Gather all local pending mutations for this document
      const pending = await getPendingMutations();
      const docMutations = pending.filter(m => m.documentId === documentId);
      
      // Get the local document state
      const localDoc = await getLocalDocument(documentId);
      const clientVersion = localDoc ? localDoc.version : 0;

      console.log(`[SyncEngine] Syncing document ${documentId}. Pending mutations: ${docMutations.length}, clientVersion: ${clientVersion}`);

      // Mark local mutations as syncing
      for (const mut of docMutations) {
        await updateMutationStatus(mut.id, 'syncing');
      }

      // 2. Perform the fetch request
      const response = await fetch(`/api/documents/${documentId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          mutations: docMutations.map(m => ({
            id: m.id,
            action: m.action,
            payload: m.payload,
            timestamp: m.timestamp,
          })),
          clientVersion,
        }),
      });

      if (!response.ok) {
        // Revert status to pending so they can retry later
        for (const mut of docMutations) {
          await updateMutationStatus(mut.id, 'pending');
        }
        
        if (response.status === 403) {
          console.error('[SyncEngine] Forbidden: Viewer is not allowed to write updates.');
          this.setState('error');
          return;
        }
        
        throw new Error(`Sync API returned status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // 3. Delete successfully synchronized mutations from the queue
        for (const mut of docMutations) {
          await deleteMutation(mut.id);
        }

        const serverDoc = data.document;
        const serverVersion = serverDoc.version;
        const serverUpdatedAt = new Date(serverDoc.updatedAt).getTime();

        // 4. Resolve local state with remote state using Deterministic LWW
        const currentLocal = await getLocalDocument(documentId);
        
        if (currentLocal) {
          // Check if there were new local edits made *during* the sync request
          const postSyncPending = await getPendingMutations();
          const hasNewLocalEdits = postSyncPending.some(m => m.documentId === documentId);

          if (!hasNewLocalEdits) {
            // No new edits during sync, simply apply server document state
            await saveLocalDocument({
              id: documentId,
              title: serverDoc.title,
              content: serverDoc.content,
              version: serverVersion,
              updatedAt: serverUpdatedAt,
              isDirty: 0,
            });
          } else {
            // New local edits exist. Resolve based on Last-Write-Wins timestamps.
            if (currentLocal.updatedAt > serverUpdatedAt) {
              // Local edits are newer than the remote state. 
              // Keep local edits, keep isDirty = 1, increment version based on server feedback.
              await saveLocalDocument({
                ...currentLocal,
                version: Math.max(currentLocal.version, serverVersion) + 1,
              });
              // Trigger sync again to upload the new changes
              this.triggerSync();
            } else {
              // Remote is newer (e.g. modified by another owner/editor). Merge or overwrite.
              // We'll perform a text merge.
              const mergedContent = this.mergeContent(currentLocal.content, serverDoc.content);
              await saveLocalDocument({
                id: documentId,
                title: serverDoc.title, // Overwrite title with server
                content: mergedContent,
                version: serverVersion,
                updatedAt: serverUpdatedAt,
                isDirty: 1, // Marked dirty since we merged local edits
              });
              
              this.triggerSync();
            }
          }
        } else {
          // Document didn't exist locally, initialize it with server state
          await saveLocalDocument({
            id: documentId,
            title: serverDoc.title,
            content: serverDoc.content,
            version: serverVersion,
            updatedAt: serverUpdatedAt,
            isDirty: 0,
          });
        }

        this.setState('idle');
      } else {
        throw new Error(data.message || 'Sync failed on server');
      }
    } catch (err) {
      console.error('[SyncEngine] Error in sync process:', err);
      this.setState('error');
    }
  }

  /**
   * Deterministic line-by-line merge to resolve conflicts
   */
  private mergeContent(local: string, remote: string): string {
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');
    const merged: string[] = [];
    
    let i = 0;
    let j = 0;
    
    while (i < localLines.length || j < remoteLines.length) {
      const localLine = localLines[i];
      const remoteLine = remoteLines[j];
      
      if (localLine === remoteLine) {
        if (localLine !== undefined) merged.push(localLine);
        i++;
        j++;
      } else {
        // Line mismatch: insert remote first then local, or vice versa.
        // We will insert remote, then append local line to avoid losing local data.
        if (remoteLine !== undefined) {
          merged.push(remoteLine);
          j++;
        }
        if (localLine !== undefined) {
          merged.push(localLine);
          i++;
        }
      }
    }
    
    return merged.join('\n');
  }
}

// Export a singleton sync engine
export const syncEngine = new SyncEngine();
