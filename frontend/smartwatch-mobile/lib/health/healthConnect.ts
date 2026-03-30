/**
 * Google Health Connect integration.
 * Reads real smartwatch data (HR, SpO2, Steps, Sleep) from Health Connect.
 *
 * Flow: Smartwatch → Companion App (Samsung Health/Google Fit) → Health Connect → This module → insertVital() → SQLite → ML
 *
 * Gracefully degrades: if Health Connect is unavailable (web, Expo Go, no HC app),
 * all functions return empty/false and the app falls back to the simulator.
 */
import { Platform } from 'react-native';
import { insertVital } from '../sync/localDb';
import { addReading } from '../ml';
import { mergeReadings, getSourceDisplayName } from './adapter';

let HC: any = null;
let available = false;
let initialized = false;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let lastSourceApp: string | null = null;
let lastSourceDisplayName: string = 'Unknown';

/** Try to load the Health Connect module (fails gracefully on web/Expo Go) */
function loadModule(): boolean {
  if (HC) return true;
  if (Platform.OS !== 'android') return false;
  try {
    HC = require('react-native-health-connect');
    return true;
  } catch {
    return false;
  }
}

/** Initialize Health Connect SDK */
export async function initHealthConnect(): Promise<boolean> {
  if (initialized) return available;
  if (!loadModule()) { initialized = true; return false; }

  try {
    const result = await HC.initialize();
    available = result;
    initialized = true;
    console.log('[HealthConnect] Initialized:', available);
    return available;
  } catch (e) {
    console.warn('[HealthConnect] Init failed:', e);
    initialized = true;
    available = false;
    return false;
  }
}

/** Check if Health Connect is available on this device */
export function isHealthConnectAvailable(): boolean {
  return available;
}

/** Request read permissions for all vital types */
export async function requestPermissions(): Promise<boolean> {
  if (!available || !HC) return false;

  try {
    const granted = await HC.requestPermission([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' },
    ]);

    const hasPermissions = granted && granted.length > 0;
    console.log('[HealthConnect] Permissions:', hasPermissions, granted);
    return hasPermissions;
  } catch (e) {
    console.warn('[HealthConnect] Permission request failed:', e);
    return false;
  }
}

/** Read heart rate records in a time range */
export async function readHeartRate(startTime: string, endTime: string): Promise<any[]> {
  if (!available || !HC) return [];
  try {
    const result = await HC.readRecords('HeartRate', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });
    return result.records ?? result ?? [];
  } catch {
    return [];
  }
}

/** Read oxygen saturation (SpO2) records */
export async function readSpO2(startTime: string, endTime: string): Promise<any[]> {
  if (!available || !HC) return [];
  try {
    const result = await HC.readRecords('OxygenSaturation', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });
    return result.records ?? result ?? [];
  } catch {
    return [];
  }
}

/** Read step records */
export async function readSteps(startTime: string, endTime: string): Promise<any[]> {
  if (!available || !HC) return [];
  try {
    const result = await HC.readRecords('Steps', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });
    return result.records ?? result ?? [];
  } catch {
    return [];
  }
}

/** Read sleep session records */
export async function readSleep(startTime: string, endTime: string): Promise<any[]> {
  if (!available || !HC) return [];
  try {
    const result = await HC.readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });
    return result.records ?? result ?? [];
  } catch {
    return [];
  }
}

/**
 * Poll Health Connect for latest data and insert into local DB.
 * Reads the last 5 minutes of data on each poll to catch new readings.
 */
export async function pollLatestData(): Promise<{ count: number }> {
  if (!available) return { count: 0 };

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const startTime = fiveMinAgo.toISOString();
  const endTime = now.toISOString();

  try {
    const [hrRecords, spo2Records, stepsRecords] = await Promise.all([
      readHeartRate(startTime, endTime),
      readSpO2(startTime, endTime),
      readSteps(startTime, endTime),
    ]);

    const merged = mergeReadings(hrRecords, spo2Records, stepsRecords);

    // Track data source for UI display
    if (merged.length > 0 && merged[0].sourceApp) {
      lastSourceApp = merged[0].sourceApp;
      lastSourceDisplayName = getSourceDisplayName(merged[0].sourceApp);
    }

    for (const reading of merged) {
      // Save to local SQLite
      insertVital(reading.heartRate, reading.spo2, reading.steps, reading.timestamp);

      // Push to ML buffer
      addReading({
        heartRate: reading.heartRate,
        spo2: reading.spo2,
        steps: reading.steps,
        timestamp: new Date(reading.timestamp).getTime(),
      });
    }

    return { count: merged.length };
  } catch (e) {
    console.warn('[HealthConnect] Poll failed:', e);
    return { count: 0 };
  }
}

/** Get the detected source app package name (e.g. "com.samsung.shealth") */
export function getSourcePackage(): string | null {
  return lastSourceApp;
}

/** Get the friendly display name of the data source (e.g. "Samsung Health") */
export function getSourceName(): string {
  return lastSourceDisplayName;
}

/** Start periodic polling (default: every 60 seconds) */
export function startPolling(intervalMs: number = 60000): void {
  stopPolling();
  // Poll immediately, then on interval
  pollLatestData();
  pollingTimer = setInterval(pollLatestData, intervalMs);
  console.log('[HealthConnect] Polling started, interval:', intervalMs);
}

/** Stop periodic polling */
export function stopPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[HealthConnect] Polling stopped');
  }
}

/** Check if currently polling */
export function isPolling(): boolean {
  return pollingTimer !== null;
}
