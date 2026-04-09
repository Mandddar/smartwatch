/**
 * Background sync — registers a periodic background task that uploads
 * un-synced local vitals to the backend every 2-4 hours.
 *
 * Uses expo-background-fetch + expo-task-manager.
 * Gracefully degrades: on web or Expo Go, registration silently no-ops.
 */
import { Platform } from 'react-native';
import { syncNow } from './syncService';

const BACKGROUND_SYNC_TASK = 'VITALWATCH_BACKGROUND_SYNC';

let registered = false;

/**
 * Register the background sync task. Call once at app startup.
 * The token is fetched from SecureStore at sync time (not captured here)
 * so it stays fresh even if the user re-authenticates.
 */
export async function registerBackgroundSync(): Promise<void> {
  if (registered || Platform.OS === 'web') return;

  try {
    const TaskManager = require('expo-task-manager');
    const BackgroundFetch = require('expo-background-fetch');

    // Define the task
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        // Read token from SecureStore directly (background tasks don't have React context)
        const SecureStore = require('expo-secure-store');
        const token = await SecureStore.getItemAsync('jwt_token');
        if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

        const result = await syncNow(token);
        return result.uploaded > 0
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Register with 2-hour minimum interval
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 2 * 60 * 60, // 2 hours in seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });

    registered = true;
    console.log('[BackgroundSync] Registered periodic sync task');
  } catch (e) {
    // expo-background-fetch not available (Expo Go, web, etc.)
    console.log('[BackgroundSync] Not available:', (e as Error).message);
  }
}

/** Unregister the background sync task */
export async function unregisterBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const BackgroundFetch = require('expo-background-fetch');
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    registered = false;
  } catch {}
}

/** Check if background sync is registered */
export async function isBackgroundSyncRegistered(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const TaskManager = require('expo-task-manager');
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  } catch {
    return false;
  }
}
