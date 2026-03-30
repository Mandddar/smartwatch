/**
 * Sync service — batch uploads un-synced local vitals to the backend.
 * Call syncNow() manually or on a timer. Background sync can be added later
 * via expo-background-fetch when deploying to production.
 */
import { getUnsyncedVitals, markSynced, pruneOldSynced, getUnsyncedCount } from './localDb';
import { uploadVitalsBatch } from '../api';

const BATCH_SIZE = 500;
const MAX_RETRIES = 3;

let isSyncing = false;

export interface SyncResult {
  success: boolean;
  uploaded: number;
  remaining: number;
  error?: string;
}

/**
 * Upload all un-synced vitals to the backend in batches.
 * Safe to call multiple times — only one sync runs at a time.
 */
export async function syncNow(token: string | null): Promise<SyncResult> {
  if (!token) return { success: false, uploaded: 0, remaining: 0, error: 'No auth token' };
  if (isSyncing) return { success: false, uploaded: 0, remaining: getUnsyncedCount(), error: 'Sync already in progress' };

  isSyncing = true;
  let totalUploaded = 0;

  try {
    while (true) {
      const unsynced = getUnsyncedVitals(BATCH_SIZE);
      if (unsynced.length === 0) break;

      const readings = unsynced.map((v) => ({
        heartRate: v.heartRate,
        spo2: v.spo2,
        steps: v.steps,
        timestamp: v.timestamp,
      }));

      let success = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await uploadVitalsBatch(token, readings);
          success = true;
          break;
        } catch {
          // Wait before retrying (exponential backoff)
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      }

      if (!success) {
        return {
          success: false,
          uploaded: totalUploaded,
          remaining: getUnsyncedCount(),
          error: `Failed to upload batch after ${MAX_RETRIES} retries`,
        };
      }

      const ids = unsynced.map((v) => v.id);
      markSynced(ids);
      totalUploaded += unsynced.length;
    }

    // Clean up old synced data (keep 7 days locally for ML)
    pruneOldSynced(7);

    return {
      success: true,
      uploaded: totalUploaded,
      remaining: 0,
    };
  } finally {
    isSyncing = false;
  }
}

/** Check if there are un-synced vitals waiting */
export function getPendingSyncCount(): number {
  return getUnsyncedCount();
}
