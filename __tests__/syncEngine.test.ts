import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto'; // Mock IndexedDB globally for Dexie inside Vitest
import { 
  localDb, 
  saveLocalDocument, 
  getLocalDocument, 
  queueMutation, 
  getPendingMutations,
  clearSyncedMutationsForDoc
} from '../src/lib/indexedDb';
import { syncEngine } from '../src/lib/syncEngine';

describe('Local-First Dexie Database & Sync Engine Unit Tests', () => {
  beforeEach(async () => {
    // Clear IndexedDB tables before each test to ensure isolation
    await localDb.documents.clear();
    await localDb.mutationQueue.clear();
  });

  describe('IndexedDB Transaction Safety', () => {
    it('should save and retrieve a document from local storage', async () => {
      const doc = {
        id: 'test-doc-123',
        title: 'Initial Title',
        content: 'Hello World from offline cache',
        version: 1,
        updatedAt: Date.now(),
        isDirty: 0,
      };

      await saveLocalDocument(doc);
      
      const retrieved = await getLocalDocument('test-doc-123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Initial Title');
      expect(retrieved?.content).toBe('Hello World from offline cache');
      expect(retrieved?.version).toBe(1);
    });

    it('should queue mutations transactionally when editing offline', async () => {
      const docId = 'test-doc-456';
      
      // Perform local edit write
      await queueMutation(docId, 'update', {
        title: 'New Offline Title',
        content: 'New offline body text content',
        version: 2,
        updatedAt: Date.now(),
      });

      // Assert document state was updated locally
      const doc = await getLocalDocument(docId);
      expect(doc).toBeDefined();
      expect(doc?.title).toBe('New Offline Title');
      expect(doc?.isDirty).toBe(1); // Should be marked dirty

      // Assert mutation was added to the queue
      const pending = await getPendingMutations();
      expect(pending.length).toBe(1);
      expect(pending[0].documentId).toBe(docId);
      expect(pending[0].action).toBe('update');
      expect(pending[0].payload.title).toBe('New Offline Title');
      expect(pending[0].status).toBe('pending');
    });

    it('should retrieve pending mutations in chronological order', async () => {
      const docId = 'test-doc-456';
      
      await queueMutation(docId, 'update', {
        title: 'Title Edit 1',
        content: 'Content 1',
        version: 2,
        updatedAt: Date.now() - 2000,
      });

      await queueMutation(docId, 'update', {
        title: 'Title Edit 2',
        content: 'Content 2',
        version: 3,
        updatedAt: Date.now() - 1000,
      });

      const pending = await getPendingMutations();
      expect(pending.length).toBe(2);
      expect(pending[0].payload.title).toBe('Title Edit 1');
      expect(pending[1].payload.title).toBe('Title Edit 2');
    });

    it('should cleanly remove synced mutations from queue', async () => {
      const docId = 'doc-to-clear';
      const timestamp = Date.now();
      
      await queueMutation(docId, 'update', {
        title: 'Will Sync',
        content: 'Test content',
        version: 2,
        updatedAt: timestamp,
      });

      // Mark the queued mutation as syncing to simulate push phase
      const pendingBefore = await getPendingMutations();
      expect(pendingBefore.length).toBe(1);
      
      const mutId = pendingBefore[0].id;
      await localDb.mutationQueue.update(mutId, { status: 'syncing' });

      // Clean up synced items
      await clearSyncedMutationsForDoc(docId, timestamp + 1000);
      
      const pendingAfter = await getPendingMutations();
      expect(pendingAfter.length).toBe(0);
    });
  });

  describe('Deterministic Conflict Resolution Algorithm', () => {
    it('should resolve line-by-line text conflicts cleanly', () => {
      const localText = "Line 1: unchanged\nLine 2: local change\nLine 3: unchanged";
      const remoteText = "Line 1: unchanged\nLine 2: remote change\nLine 3: unchanged";
      
      // Access the private mergeContent algorithm via any-cast to avoid modifying source accessibility
      const mergedResult = (syncEngine as any).mergeContent(localText, remoteText);
      
      // The merge algorithm should reconcile line adjustments deterministically
      expect(mergedResult).toContain('Line 1: unchanged');
      expect(mergedResult).toContain('Line 2: remote change');
      expect(mergedResult).toContain('Line 2: local change');
      expect(mergedResult).toContain('Line 3: unchanged');
    });

    it('should deterministic merge overlapping appends', () => {
      const localText = "Introduction\nOffline local edits";
      const remoteText = "Introduction\nCloud remote edits";
      
      const mergedResult = (syncEngine as any).mergeContent(localText, remoteText);
      
      // Output should combine non-conflicting lines in a reproducible pattern
      expect(mergedResult).toBe("Introduction\nCloud remote edits\nOffline local edits");
    });
  });
});
