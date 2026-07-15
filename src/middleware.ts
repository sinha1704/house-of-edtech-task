import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function decodeJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Protect document editor page routes
  if (pathname.startsWith('/documents')) {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  // 2. State Isolation: Block VIEWERS from sync and snapshot writes at the Middleware layer
  const isWriteRequest = request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE';
  if (isWriteRequest && (pathname.includes('/api/documents/') && (pathname.endsWith('/sync') || pathname.endsWith('/snapshot')))) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : request.cookies.get('token')?.value;

    if (token) {
      const decoded = decodeJwt(token);
      if (decoded && decoded.role === 'VIEWER') {
        return new NextResponse(
          JSON.stringify({ success: false, message: 'Forbidden: Viewers strictly blocked from writing/syncing data at middleware layer' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/documents/:path*',
    '/api/documents/:path*',
  ],
};

