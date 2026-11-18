import { cookies } from 'next/headers';
import { backend, errorResponse, sessionCookie } from '@/lib/server';

/**
 * Session endpoints for the website.
 * The backend token is kept in an httpOnly cookie, so browser JavaScript never sees it.
 *
 *   GET    /api/session   -> current user (or 401)
 *   POST   /api/session   -> sign in { email, password, scope?: 'admin' }
 *   DELETE /api/session   -> sign out
 */

export async function GET() {
  const store = await cookies();
  const token = store.get(sessionCookie.name)?.value;
  if (!token) return errorResponse(401, 'Not signed in', 'UNAUTHENTICATED');

  const res = await backend('auth/me', { token }).catch(() => null);
  if (!res) return errorResponse(502, 'Cannot reach the server', 'BAD_GATEWAY');
  if (res.status === 401 || res.status === 403) store.delete(sessionCookie.name);
  return Response.json(await res.json(), { status: res.status });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Malformed request', 'BAD_JSON');
  }
  const { email, password, scope } = body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') return errorResponse(400, 'Email and password are required', 'VALIDATION');

  const res = await backend('auth/login', { method: 'POST', body: { email, password } }).catch(() => null);
  if (!res) return errorResponse(502, 'Cannot reach the server. Is the backend running?', 'BAD_GATEWAY');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json(data, { status: res.status });

  if (scope === 'admin' && !data.user?.isAdmin) return errorResponse(403, 'This account does not have admin access', 'FORBIDDEN');

  (await cookies()).set(sessionCookie.name, data.token, sessionCookie.options);
  return Response.json({ user: data.user });
}

export async function DELETE() {
  (await cookies()).delete(sessionCookie.name);
  return new Response(null, { status: 204 });
}
