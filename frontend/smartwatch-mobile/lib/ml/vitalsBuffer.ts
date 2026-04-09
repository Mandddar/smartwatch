/**
 * In-memory vitals buffer for ML inference.
 * Populated from local SQLite on app launch, then updated on each poll.
 * Keeps last 360 readings (30 min at 5-second intervals) in memory
 * for fast access by ML models.
 */
import type { VitalReading } from './types';
import { getRecentVitals, isDbAvailable } from '../sync/localDb';

const MAX_BUFFER_SIZE = 360;

let buffer: VitalReading[] = [];

/** Initialize buffer from local SQLite */
export function initBuffer(): void {
  if (!isDbAvailable()) return;
  try {
    const vitals = getRecentVitals(MAX_BUFFER_SIZE);
    buffer = vitals.map((v) => ({
      heartRate: v.heartRate,
      spo2: v.spo2,
      steps: v.steps,
      timestamp: new Date(v.timestamp).getTime(),
    }));
  } catch {}
}

/** Add a new reading to the buffer */
export function pushReading(reading: VitalReading): void {
  buffer.push(reading);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(-MAX_BUFFER_SIZE);
  }
}

/** Get the last N readings from the buffer */
export function getWindow(size: number = 60): VitalReading[] {
  return buffer.slice(-size);
}

/** Get full buffer */
export function getFullBuffer(): VitalReading[] {
  return [...buffer];
}

/** Get buffer size */
export function getBufferSize(): number {
  return buffer.length;
}

/** Check if we have enough data for inference (at least 15 readings = ~75s) */
export function hasEnoughData(): boolean {
  return buffer.length >= 15;
}
