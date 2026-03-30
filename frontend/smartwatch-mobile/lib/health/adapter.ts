/**
 * Adapter: maps Health Connect record types to the app's LocalVital format.
 *
 * Health Connect records come in different shapes per type:
 * - HeartRate: { startTime, endTime, samples: [{ time, beatsPerMinute }] }
 * - OxygenSaturation: { time, percentage }
 * - Steps: { startTime, endTime, count }
 *
 * This adapter merges them into unified vitals aligned by timestamp.
 */

export interface MergedReading {
  heartRate: number;
  spo2: number;
  steps: number;
  timestamp: string;
  sourceApp: string | null; // e.g. "com.samsung.shealth"
}

/** Map Health Connect package names to friendly display names */
const SOURCE_NAMES: Record<string, string> = {
  'com.samsung.shealth': 'Samsung Health',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.huami.watch.hmwatchmanager': 'Amazfit (Zepp)',
  'com.xiaomi.wearable': 'Xiaomi Mi Fitness',
  'com.xiaomi.hm.health': 'Zepp Life (Xiaomi)',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.ouraring.oura': 'Oura Ring',
  'com.oneplus.health': 'OnePlus Health',
};

/** Get a friendly name from a Health Connect data origin package */
export function getSourceDisplayName(packageName: string | null): string {
  if (!packageName) return 'Unknown';
  return SOURCE_NAMES[packageName] ?? packageName.split('.').pop() ?? 'Unknown';
}

/** Extract the source package name from a Health Connect record */
function extractSource(record: any): string | null {
  return record?.metadata?.dataOrigin?.packageName
    ?? record?.metadata?.dataOrigin
    ?? null;
}

/**
 * Merge HR, SpO2, and Steps records into unified vitals.
 * Aligns by nearest timestamp (within 60-second windows).
 */
export function mergeReadings(
  hrRecords: any[],
  spo2Records: any[],
  stepsRecords: any[],
): MergedReading[] {
  // Extract individual HR samples + source info
  const hrSamples: { time: number; bpm: number; source: string | null }[] = [];
  for (const record of hrRecords) {
    const source = extractSource(record);
    if (record.samples) {
      for (const sample of record.samples) {
        hrSamples.push({
          time: new Date(sample.time).getTime(),
          bpm: sample.beatsPerMinute,
          source,
        });
      }
    } else if (record.time && record.beatsPerMinute) {
      hrSamples.push({
        time: new Date(record.time).getTime(),
        bpm: record.beatsPerMinute,
        source,
      });
    }
  }

  // Extract SpO2 samples
  const spo2Samples: { time: number; pct: number }[] = [];
  for (const record of spo2Records) {
    const time = record.time ? new Date(record.time).getTime() :
      record.startTime ? new Date(record.startTime).getTime() : null;
    const pct = record.percentage ?? record.value;
    if (time && pct) {
      spo2Samples.push({ time, pct });
    }
  }

  // Extract step counts (interval records)
  const stepsSamples: { time: number; count: number }[] = [];
  let cumulativeSteps = 0;
  for (const record of stepsRecords) {
    const time = record.endTime ? new Date(record.endTime).getTime() :
      record.startTime ? new Date(record.startTime).getTime() : null;
    const count = record.count ?? 0;
    if (time) {
      cumulativeSteps += count;
      stepsSamples.push({ time, count: cumulativeSteps });
    }
  }

  if (hrSamples.length === 0) return [];

  // Sort HR by time
  hrSamples.sort((a, b) => a.time - b.time);

  // For each HR sample, find nearest SpO2 and Steps within 60s
  const merged: MergedReading[] = [];
  const WINDOW_MS = 60000;

  for (const hr of hrSamples) {
    // Find nearest SpO2
    let nearestSpo2 = 98; // default
    let minDist = Infinity;
    for (const s of spo2Samples) {
      const dist = Math.abs(s.time - hr.time);
      if (dist < minDist && dist < WINDOW_MS) {
        minDist = dist;
        nearestSpo2 = Math.round(s.pct);
      }
    }

    // Find nearest steps
    let nearestSteps = 0;
    minDist = Infinity;
    for (const s of stepsSamples) {
      const dist = Math.abs(s.time - hr.time);
      if (dist < minDist) {
        minDist = dist;
        nearestSteps = s.count;
      }
    }

    merged.push({
      heartRate: Math.round(hr.bpm),
      spo2: nearestSpo2,
      steps: nearestSteps,
      timestamp: new Date(hr.time).toISOString(),
      sourceApp: hr.source,
    });
  }

  // Deduplicate: keep one reading per 5-second window
  const deduped: MergedReading[] = [];
  let lastTime = 0;
  for (const m of merged) {
    const t = new Date(m.timestamp).getTime();
    if (t - lastTime >= 5000) {
      deduped.push(m);
      lastTime = t;
    }
  }

  return deduped;
}
