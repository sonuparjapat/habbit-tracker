import { router, type Href } from 'expo-router';
import { useAuth } from './auth';

/**
 * Navigate to a screen that needs an account.
 * Guests get the sign-in sheet first, then land on `path` once signed in.
 */
export function goProtected(path: string) {
  if (useAuth.getState().token) router.push(path as Href);
  else router.push({ pathname: '/login', params: { next: path } });
}

export function goSignIn(mode: 'login' | 'register' = 'register') {
  router.push(mode === 'login' ? '/login' : '/register');
}
