// Public values (inlined at build time)
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Anchor';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || '';

// Cookie name is also read by src/proxy.js, so it lives here (not in server.js)
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'anchor_session';
