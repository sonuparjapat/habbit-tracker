import { cookies } from 'next/headers';
import { backend, errorResponse, sessionCookie } from '@/lib/server';

/**
 * Forwards browser calls to the backend API, attaching the session token from the
 * httpOnly cookie. Used by the admin panel today and the user web app later.
 *
 * Safety:
 *  - only these top-level backend areas can be reached (no arbitrary paths)
 *  - path segments are validated (no "..", no encoded slashes)
 *  - only Content-Type and our own Authorization header are sent upstream
 *  - redirects are never followed
 *  - authorisation itself is always enforced by the backend
 */
const ALLOWED_ROOTS = new Set(['admin', 'auth', 'dashboard', 'trackers', 'trades', 'expenses', 'templates', 'meta']);
const SEGMENT = /^[A-Za-z0-9._-]+$/;

async function forward(request, { params }) {
  const { path } = await params;
  if (!path?.length || !ALLOWED_ROOTS.has(path[0]) || !path.every((s) => SEGMENT.test(s) && s !== '..' && s !== '.'))
    return errorResponse(404, 'Not found', 'NOT_FOUND');
  // Sign-in/out goes through /api/session so the token never reaches the browser
  if (path[0] === 'auth' && ['login', 'register', 'reset-password', 'change-password'].includes(path[1]))
    return errorResponse(404, 'Not found', 'NOT_FOUND');

  const store = await cookies();
  const token = store.get(sessionCookie.name)?.value;
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  let upstream;
  try {
    upstream = await backend(path.join('/'), {
      method: request.method,
      token,
      body: body || undefined,
      search: new URL(request.url).search,
    });
  } catch {
    return errorResponse(502, 'Cannot reach the server', 'BAD_GATEWAY');
  }

  if (upstream.status === 401 || (upstream.status === 403 && path[0] !== 'admin')) store.delete(sessionCookie.name);
  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
