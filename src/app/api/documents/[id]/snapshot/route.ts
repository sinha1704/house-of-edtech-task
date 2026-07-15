import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/jwt';

// Fallback store when Postgres is offline
const mockSnapshots = new Map<string, any[]>();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.split(' ')[1];
    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Invalid token session' }, { status: 401 });
    }

    if (session.role === 'VIEWER') {
      return NextResponse.json({ success: false, message: 'Forbidden: Viewers cannot create snapshots' }, { status: 403 });
    }

    const { title, content, version, comment } = await req.json();

    let snapshot;
    let dbConnected = true;

    try {
      // Retrieve document with authorization check
      const doc = await db.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { ownerId: session.id },
            { id: 'default-doc' }
          ]
        }
      });
      if (!doc) {
        return NextResponse.json({ success: false, message: 'Document not found or access denied' }, { status: 404 });
      }

      let userRecord = await db.user.findUnique({ where: { email: session.email } });
      if (!userRecord) {
        userRecord = await db.user.create({
          data: {
            id: session.id === 'mock-user-id' ? 'mock-user-uuid' : session.id,
            email: session.email,
            name: session.name,
            passwordHash: 'mock-pass-hash',
            role: session.role as any
          }
        });
      }

      snapshot = await db.versionSnapshot.create({
        data: {
          documentId,
          title,
          content,
          version,
          comment: comment || 'Manual Snapshot',
          createdById: userRecord.id,
        },
        include: { createdBy: true }
      });
    } catch (dbErr: any) {
      dbConnected = false;
      console.warn('[Snapshot] Database fallback triggered.', dbErr.message);
      
      const list = mockSnapshots.get(documentId) || [];
      snapshot = {
        id: `mock-snap-${Date.now()}`,
        documentId,
        title,
        content,
        version,
        comment: comment || 'Manual Snapshot (Mock)',
        createdAt: new Date(),
        createdBy: {
          name: session.name,
          email: session.email,
          role: session.role,
        }
      };
      list.push(snapshot);
      mockSnapshots.set(documentId, list);
    }

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        title: snapshot.title,
        content: snapshot.content,
        comment: snapshot.comment,
        createdAt: snapshot.createdAt,
        createdBy: {
          name: snapshot.createdBy.name,
          role: snapshot.createdBy.role,
        }
      }
    });

  } catch (error: any) {
    console.error('[Snapshot Create Error]:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.split(' ')[1];
    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Invalid token session' }, { status: 401 });
    }

    let snapshots = [];
    let dbConnected = true;

    try {
      // Retrieve document with authorization check
      const doc = await db.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { ownerId: session.id },
            { id: 'default-doc' }
          ]
        }
      });
      if (!doc) {
        return NextResponse.json({ success: false, message: 'Forbidden: Document access denied' }, { status: 403 });
      }

      snapshots = await db.versionSnapshot.findMany({
        where: { documentId },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: true }
      });
    } catch (dbErr: any) {
      dbConnected = false;
      snapshots = mockSnapshots.get(documentId) || [];
    }

    return NextResponse.json({
      success: true,
      snapshots: snapshots.map((s: any) => ({
        id: s.id,
        version: s.version,
        title: s.title,
        content: s.content,
        comment: s.comment,
        createdAt: s.createdAt,
        createdBy: {
          name: s.createdBy.name,
          role: s.createdBy.role,
        }
      }))
    });

  } catch (error: any) {
    console.error('[Snapshot Get Error]:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}
