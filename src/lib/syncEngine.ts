import { 
  getPendingMutations, 
  updateMutationStatus, 
  deleteMutation, 
  saveLocalDocument, 
  getLocalDocument,
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
        this.setState('idle');
        this.triggerSync();
      });
      
      window.addEventListener('offline', () => {
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
        console.error('Sync failed', err);
        this.setState('error');
      }
    }, 500);
  }

  private async runSyncLoop(documentId: string) {
    if (this.currentState === 'syncing') return;
    this.setState('syncing');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        this.setState('idle');
        return;
      }

      const pending = await getPendingMutations();
      const docMutations = pending.filter(m => m.documentId === documentId);
      
      const localDoc = await getLocalDocument(documentId);
      const clientVersion = localDoc ? localDoc.version : 0;

      for (const mut of docMutations) {
        await updateMutationStatus(mut.id, 'syncing');
      }

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
        for (const mut of docMutations) {
          await updateMutationStatus(mut.id, 'pending');
        }
        
        if (response.status === 403) {
          this.setState('error');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        for (const mut of docMutations) {
          await deleteMutation(mut.id);
        }

        const serverDoc = data.document;
        const serverVersion = serverDoc.version;
        const serverUpdatedAt = new Date(serverDoc.updatedAt).getTime();
        const currentLocal = await getLocalDocument(documentId);
        
        if (currentLocal) {
          const postSyncPending = await getPendingMutations();
          const hasNewLocalEdits = postSyncPending.some(m => m.documentId === documentId);

          if (!hasNewLocalEdits) {
            await saveLocalDocument({
              id: documentId,
              title: serverDoc.title,
              content: serverDoc.content,
              version: serverVersion,
              updatedAt: serverUpdatedAt,
              isDirty: 0,
            });
          } else {
            if (currentLocal.updatedAt > serverUpdatedAt) {
              await saveLocalDocument({
                ...currentLocal,
                version: Math.max(currentLocal.version, serverVersion) + 1,
              });
              this.triggerSync();
            } else {
              const mergedContent = this.mergeContent(currentLocal.content, serverDoc.content);
              await saveLocalDocument({
                id: documentId,
                title: serverDoc.title,
                content: mergedContent,
                version: serverVersion,
                updatedAt: serverUpdatedAt,
                isDirty: 1,
              });
              this.triggerSync();
            }
          }
        } else {
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
        throw new Error(data.message || 'Sync response unsuccessful');
      }
    } catch (err) {
      console.error('Error in sync run', err);
      this.setState('error');
    }
  }

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

export const syncEngine = new SyncEngine();
