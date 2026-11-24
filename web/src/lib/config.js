// All values are public (inlined into the site at build time)

/** Backend API, including /api — e.g. https://habbit-tracker-sefr.onrender.com/api */
const rawApi = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').trim().replace(/\/+$/, '');
export const API_URL = rawApi.endsWith('/api') ? rawApi : `${rawApi}/api`;

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Holdfast';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || '';
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@yourdomain.com';
