import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Mock DB access layer completely inline to support Vitest hoisting
vi.mock('@/lib/db', () => {
  const mockDocRepo = {
    findFirst: vi.fn().mockImplementation(() => Promise.resolve(null)),
    update: vi.fn().mockImplementation(() => Promise.resolve({} as any)),
    create: vi.fn().mockImplementation(() => Promise.resolve({} as any)),
  };
  return {
    db: {
      document: mockDocRepo,
      syncLog: {
        create: vi.fn().mockImplementation(() => Promise.resolve({} as any)),
      },
      $transaction: vi.fn((cb) => cb(mockDocRepo)),
    },
  };
});

// 2. Mock JWT Auth layer completely inline
vi.mock('@/lib/jwt', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@/lib/jwt';
import { db } from '@/lib/db';
import { POST } from '../../src/app/api/documents/[id]/sync/route';

describe('Document Sync Endpoint Security & Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Re-apply default mock implementations cleared by resetAllMocks
    vi.mocked(db.syncLog.create).mockResolvedValue({} as any);
    vi.mocked(db.document.findFirst).mockResolvedValue(null as any);
    vi.mocked(db.document.update).mockResolvedValue({} as any);
    vi.mocked(db.document.create).mockResolvedValue({} as any);
  });

  const mockParams = Promise.resolve({ id: 'test-document-uuid' });

  describe('OOM Payload Protection', () => {
    it('should immediately reject sync payloads with Content-Length larger than 1MB', async () => {
      // Setup a mock request with standard size headers set to > 1MB
      const req = new NextRequest('http://localhost/api/documents/doc-id/sync', {
        method: 'POST',
        headers: {
          'Content-Length': '1048577', // 1MB + 1 byte
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const response = await POST(req, { params: mockParams });
      expect(response.status).toBe(413); // 413 Payload Too Large
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Payload Too Large');
    });

    it('should block stream inputs that exceed 1MB during reading even if Content-Length header is missing', async () => {
      // Authorize this request first so it reaches the streaming body validation
      vi.mocked(verifyToken).mockReturnValue({
        id: 'editor-user-456',
        email: 'editor@edtech.com',
        name: 'Jane Editor',
        role: 'EDITOR',
      });

      // Generate a mock stream exceeding 1MB
      const largeData = new Uint8Array(1024 * 1024 + 100); // 1.01MB
      
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(largeData);
          controller.close();
        }
      });

      const req = new NextRequest('http://localhost/api/documents/doc-id/sync', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
        body: readableStream,
        // @ts-ignore - duplex is required for custom body streams in newer fetch API specs
        duplex: 'half'
      });

      const response = await POST(req, { params: mockParams });
      expect(response.status).toBe(413); // Payload too large
      const body = await response.json();
      expect(body.message).toContain('Payload size limit exceeded');
    });
  });

  describe('Zod Schema Validation Constraints', () => {
    it('should return 400 Bad Request if clientVersion is missing or malformed', async () => {
      const invalidPayload = {
        mutations: [],
        // clientVersion is missing
      };

      vi.mocked(verifyToken).mockReturnValue({
        id: 'user-1',
        email: 'user@edtech.com',
        name: 'User One',
        role: 'EDITOR',
      });

      const req = new NextRequest('http://localhost/api/documents/doc-id/sync', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidPayload),
      });

      const response = await POST(req, { params: mockParams });
      expect(response.status).toBe(400); // Bad Request
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid request schema');
    });
  });

  describe('RBAC Authorization Rules', () => {
    it('should reject write mutations submitted by a VIEWER with 403 Forbidden', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        id: 'viewer-user-123',
        email: 'viewer@edtech.com',
        name: 'John Viewer',
        role: 'VIEWER', // Read-only role
      });

      const payload = {
        clientVersion: 1,
        mutations: [
          {
            id: 'mutation-abc',
            action: 'update',
            payload: {
              title: 'Attempted hack title',
              content: 'Attempted body modification',
              version: 2,
              updatedAt: Date.now(),
            },
            timestamp: Date.now(),
          }
        ],
      };

      const req = new NextRequest('http://localhost/api/documents/doc-id/sync', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(req, { params: mockParams });
      expect(response.status).toBe(403); // Forbidden
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Forbidden: Viewers cannot modify documents');
    });

    it('should allow write mutations submitted by an OWNER or EDITOR', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        id: 'editor-user-456',
        email: 'editor@edtech.com',
        name: 'Jane Editor',
        role: 'EDITOR', // Authorized role
      });

      // Stub database finds with sequential resolution to simulate transaction updates
      const mockDoc = {
        id: 'test-document-uuid',
        title: 'Original Title',
        content: 'Original Content',
        version: 2,
        updatedAt: new Date(Date.now() - 10000),
      };
      
      const updatedDoc = {
        ...mockDoc,
        title: 'New Editor Title',
        version: 3,
        updatedAt: new Date(),
      };

      vi.mocked(db.document.findFirst)
        .mockResolvedValueOnce(mockDoc as any) // Initial check
        .mockResolvedValueOnce(updatedDoc as any); // Re-fetch query
      
      vi.mocked(db.document.update).mockResolvedValue(updatedDoc as any);

      const payload = {
        clientVersion: 2,
        mutations: [
          {
            id: 'mutation-xyz',
            action: 'update',
            payload: {
              title: 'New Editor Title',
              content: 'Original Content',
              version: 3,
              updatedAt: Date.now(), // Newer timestamp
            },
            timestamp: Date.now(),
          }
        ],
      };

      const req = new NextRequest('http://localhost/api/documents/doc-id/sync', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(req, { params: mockParams });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.document.title).toBe('New Editor Title');
    });
  });
});
