import Dexie, { type Table } from 'dexie';

export interface LocalDocument {
  id: string;
  title: string;
  content: string;
  version: number;
  updatedAt: number;
  isDirty: number;
}

export interface OfflineMutation {
  id: string;
  documentId: string;
  action: 'create' | 'update' | 'restore';
  payload: {
    title: string;
    content: string;
    version: number;
    updatedAt: number;
  };
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
}

class EdtechDatabase extends Dexie {
  documents!: Table<LocalDocument, string>;
  mutationQueue!: Table<OfflineMutation, string>;

  constructor() {
    super('EdtechDocDB');
    this.version(1).stores({
      documents: 'id, title, version, updatedAt, isDirty',
      mutationQueue: 'id, documentId, action, timestamp, status',
    });
  }
}

export const localDb = new EdtechDatabase();

export async function getLocalDocument(id: string): Promise<LocalDocument | undefined> {
  return await localDb.documents.get(id);
}

export async function saveLocalDocument(doc: LocalDocument): Promise<void> {
  await localDb.documents.put(doc);
}

export async function queueMutation(
  documentId: string,
  action: 'create' | 'update' | 'restore',
  payload: { title: string; content: string; version: number; updatedAt: number }
): Promise<void> {
  const mutationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const mutation: OfflineMutation = {
    id: mutationId,
    documentId,
    action,
    payload,
    timestamp: Date.now(),
    status: 'pending',
  };
  
  await localDb.transaction('rw', [localDb.documents, localDb.mutationQueue], async () => {
    await localDb.documents.put({
      id: documentId,
      title: payload.title,
      content: payload.content,
      version: payload.version,
      updatedAt: payload.updatedAt,
      isDirty: 1,
    });
    await localDb.mutationQueue.put(mutation);
  });
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  return await localDb.mutationQueue
    .where('status')
    .equals('pending')
    .sortBy('timestamp');
}

export async function updateMutationStatus(id: string, status: 'pending' | 'syncing' | 'failed'): Promise<void> {
  await localDb.mutationQueue.update(id, { status });
}

export async function deleteMutation(id: string): Promise<void> {
  await localDb.mutationQueue.delete(id);
}

export async function clearSyncedMutationsForDoc(documentId: string, uptoTimestamp: number): Promise<void> {
  const mutationsToDelete = await localDb.mutationQueue
    .where('documentId')
    .equals(documentId)
    .filter(m => m.timestamp <= uptoTimestamp && (m.status === 'syncing' || m.status === 'pending'))
    .toArray();
    
  await localDb.mutationQueue.bulkDelete(mutationsToDelete.map(m => m.id));
}

