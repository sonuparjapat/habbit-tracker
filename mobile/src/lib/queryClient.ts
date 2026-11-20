/**
 * Server data cache — saved on the phone.
 *
 * Every screen's last server data is kept on the phone (for up to 7 days), so when the app opens it
 * shows what the member saw last time *immediately* — even if the server is still waking up — and
 * quietly replaces it with fresh data when that arrives. The cache is wiped on sign-out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep data in memory as long as it may be kept on the phone (otherwise it couldn't be restored)
      gcTime: WEEK,
      retry: (count, err: any) => count < 2 && err?.status !== 401 && err?.status !== 404,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'query_cache_v1',
  throttleTime: 1000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: WEEK,
  // A new app version may change data shapes — start fresh then
  buster: Constants.expoConfig?.version ?? '0',
  dehydrateOptions: {
    // Only keep successful answers (never errors or half-loaded screens)
    shouldDehydrateQuery: (q: { state: { status: string } }) => q.state.status === 'success',
  },
};

/** Sign-out: forget everything this account loaded, in memory and on the phone. */
export async function clearCache() {
  queryClient.clear();
  await queryPersister.removeClient();
}
