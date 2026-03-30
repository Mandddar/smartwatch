/**
 * Local SQLite database for vitals storage.
 * Vitals are stored here until batch-synced to the backend.
 * Also serves as the data source for on-device ML inference.
 *
 * Gracefully degrades: if expo-sqlite is unavailable (e.g. Expo Go / web),
 * all functions become no-ops and the app works without local storage.
 */
import { Platform } from 'react-native';

let SQLite: any = null;
let db: any = null;
let dbAvailable = false;

function initDb(): boolean {
  if (db) return true;
  if (dbAvailable === false && SQLite === null) {
    // Only try once
    try {
      SQLite = require('expo-sqlite');
      db = SQLite.openDatabaseSync('vitalwatch.db');
      db.execSync(`
        CREATE TABLE IF NOT EXISTS local_vitals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          heart_rate INTEGER NOT NULL,
          spo2 INTEGER NOT NULL,
          steps INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_lv_timestamp ON local_vitals(timestamp);
        CREATE INDEX IF NOT EXISTS idx_lv_synced ON local_vitals(synced);
      `);
      dbAvailable = true;
      return true;
    } catch {
      dbAvailable = false;
      return false;
    }
  }
  return dbAvailable;
}

export interface LocalVital {
  id: number;
  heartRate: number;
  spo2: number;
  steps: number;
  timestamp: string;
  synced: boolean;
}

/** Check if local DB is available */
export function isDbAvailable(): boolean {
  return initDb();
}

/** Insert a single vital reading into the local DB */
export function insertVital(heartRate: number, spo2: number, steps: number, timestamp: string): void {
  if (!initDb()) return;
  try {
    db.runSync(
      'INSERT INTO local_vitals (heart_rate, spo2, steps, timestamp) VALUES (?, ?, ?, ?)',
      [heartRate, spo2, steps, timestamp]
    );
  } catch {}
}

/** Get the most recent N readings (for ML inference window) */
export function getRecentVitals(limit: number = 360): LocalVital[] {
  if (!initDb()) return [];
  try {
    const rows = db.getAllSync(
      'SELECT id, heart_rate, spo2, steps, timestamp, synced FROM local_vitals ORDER BY timestamp DESC LIMIT ?',
      [limit]
    ) as any[];
    return rows.map(mapRow).reverse();
  } catch {
    return [];
  }
}

/** Get all un-synced readings (for batch upload) */
export function getUnsyncedVitals(limit: number = 5000): LocalVital[] {
  if (!initDb()) return [];
  try {
    const rows = db.getAllSync(
      'SELECT id, heart_rate, spo2, steps, timestamp, synced FROM local_vitals WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?',
      [limit]
    ) as any[];
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

/** Mark readings as synced by their IDs */
export function markSynced(ids: number[]): void {
  if (!initDb() || ids.length === 0) return;
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.runSync(
      `UPDATE local_vitals SET synced = 1 WHERE id IN (${placeholders})`,
      ids
    );
  } catch {}
}

/** Delete old synced readings to free space (keep last N days) */
export function pruneOldSynced(keepDays: number = 7): void {
  if (!initDb()) return;
  try {
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
    db.runSync(
      'DELETE FROM local_vitals WHERE synced = 1 AND timestamp < ?',
      [cutoff]
    );
  } catch {}
}

/** Get count of un-synced readings */
export function getUnsyncedCount(): number {
  if (!initDb()) return 0;
  try {
    const result = db.getFirstSync(
      'SELECT COUNT(*) as count FROM local_vitals WHERE synced = 0'
    ) as any;
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

/** Get total count of local readings */
export function getTotalCount(): number {
  if (!initDb()) return 0;
  try {
    const result = db.getFirstSync(
      'SELECT COUNT(*) as count FROM local_vitals'
    ) as any;
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

function mapRow(row: any): LocalVital {
  return {
    id: row.id,
    heartRate: row.heart_rate,
    spo2: row.spo2,
    steps: row.steps,
    timestamp: row.timestamp,
    synced: row.synced === 1,
  };
}
