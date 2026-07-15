import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

const MAX_PAYLOAD_SIZE = 1024 * 1024; 

const syncSchema = z.object({
  clientVersion: z.number().int().nonnegative(),
  mutations: z.array(
    z.object({
      id: z.string().min(1),
      action: z.enum(['create', 'update', 'restore']),
      payload: z.object({
        title: z.string().max(250),
        content: z.string().max(100000), // Max 100k characters to prevent DB exhaustion
        version: z.number().int().nonnegative(),
        updatedAt: z.number(),
      }),
      timestamp: z.number(),
    })
  ),
});

// Fallback in-memory store when DB is offline
const mockDb = new Map<string, { id: string; title: string; content: string; version: number; updatedAt: Date }>();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  
  try {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({ success: false, message: 'Payload Too Large' }, { status: 413 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.split(' ')[1];
    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Invalid token session' }, { status: 401 });
    }

    const reader = req.body?.getReader();
    if (!reader) {
      return NextResponse.json({ success: false, message: 'Bad request stream' }, { status: 400 });
    }

    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > MAX_PAYLOAD_SIZE) {
          reader.releaseLock();
          return NextResponse.json({ success: false, message: 'Payload size limit exceeded' }, { status: 413 });
        }
        chunks.push(value);
      }
    }

    const mergedBuffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      mergedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    const textDecoder = new TextDecoder();
    const rawJson = textDecoder.decode(mergedBuffer);
    const parsedData = JSON.parse(rawJson);

    const validation = syncSchema.safeParse(parsedData);
    if (!validation.success) {
      return NextResponse.json({ success: false, message: 'Invalid request schema', errors: validation.error.format() }, { status: 400 });
    }

    const { clientVersion, mutations } = validation.data;
    const hasWrites = mutations.length > 0;

    if (hasWrites && session.role === 'VIEWER') {
      await db.syncLog.create({
        data: {
          documentId,
          userId: session.id,
          action: 'SYNC_WRITE_ATTEMPT',
          status: 'FORBIDDEN',
          message: 'Viewer attempted to sync write operations.',
        }
      }).catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden: Viewers cannot modify documents' }, { status: 403 });
    }

    let currentDoc: any = null;
    let dbConnected = true;

    try {
      currentDoc = await db.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { ownerId: session.id },
            { id: 'default-doc' }
          ]
        },
        include: { owner: true }
      });
    } catch (dbError) {
      dbConnected = false;
      currentDoc = mockDb.get(documentId) || null;
    }

    if (dbConnected) {
      if (hasWrites) {
        await db.$transaction(async (tx: any) => {
          let doc = await tx.document.findFirst({
            where: {
              id: documentId,
              OR: [
                { ownerId: session.id },
                { id: 'default-doc' }
              ]
            }
          });
          
          for (const mut of mutations) {
            const { action, payload } = mut;
            
            if (!doc) {
              if (action === 'create') {
                doc = await tx.document.create({
                  data: {
                    id: documentId,
                    title: payload.title,
                    content: payload.content,
                    version: 1,
                    ownerId: session.id,
                  },
                });
              }
            } else {
              // LWW conflict resolution
              const incomingUpdatedAt = new Date(payload.updatedAt);
              if (incomingUpdatedAt > doc.updatedAt) {
                doc = await tx.document.update({
                  where: { id: documentId },
                  data: {
                    title: payload.title,
                    content: payload.content,
                    version: { increment: 1 },
                  },
                });
              }
            }
          }
          currentDoc = doc;
        });

        await db.syncLog.create({
          data: {
            documentId,
            userId: session.id,
            action: 'MUTATION_SYNC',
            status: 'SUCCESS',
            message: `Successfully processed ${mutations.length} updates.`,
          }
        }).catch(() => {});
      }

      currentDoc = await db.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { ownerId: session.id },
            { id: 'default-doc' }
          ]
        }
      });
    } else {
      if (hasWrites) {
        for (const mut of mutations) {
          const { action, payload } = mut;
          const existing = mockDb.get(documentId);
          if (!existing) {
            if (action === 'create') {
              mockDb.set(documentId, {
                id: documentId,
                title: payload.title,
                content: payload.content,
                version: 1,
                updatedAt: new Date(payload.updatedAt),
              });
            }
          } else {
            const incomingDate = new Date(payload.updatedAt);
            if (incomingDate > existing.updatedAt) {
              mockDb.set(documentId, {
                id: documentId,
                title: payload.title,
                content: payload.content,
                version: existing.version + 1,
                updatedAt: incomingDate,
              });
            }
          }
        }
      }
      currentDoc = mockDb.get(documentId) || {
        id: documentId,
        title: 'Empty Document',
        content: '',
        version: 1,
        updatedAt: new Date(),
      };
    }

    if (!currentDoc) {
      return NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      document: {
        id: currentDoc.id,
        title: currentDoc.title,
        content: currentDoc.content,
        version: currentDoc.version,
        updatedAt: currentDoc.updatedAt.toISOString(),
      },
    });

  } catch (err: any) {
    console.error('[Sync Route Error]:', err);
    return NextResponse.json({ success: false, message: 'Internal Server Error', error: err.message }, { status: 500 });
  }
}
