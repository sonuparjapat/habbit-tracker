import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/config';

/**
 * Optimistic route protection for /admin (just checks the session cookie exists).
 * Real authorisation happens on the backend for every API call, so a forged cookie gets nothing.
 */
export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const isLogin = pathname === '/admin/login';

  if (!signedIn && !isLogin) {
    const url = new URL('/admin/login', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isLogin) return NextResponse.redirect(new URL('/admin', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
