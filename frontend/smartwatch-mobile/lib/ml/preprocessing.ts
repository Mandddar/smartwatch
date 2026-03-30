/**
 * Shared preprocessing utilities for ML models.
 * Normalization, feature extraction, windowing.
 */
import type { VitalReading } from './types';

/** Normalize a value to [0, 1] given min/max bounds */
export function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** Normalize heart rate: range 40-200 bpm */
export function normalizeHR(hr: number): number {
  return normalize(hr, 40, 200);
}

/** Normalize SpO2: range 80-100% */
export function normalizeSpO2(spo2: number): number {
  return normalize(spo2, 80, 100);
}

/** Extract HR array from a window of readings */
export function extractHR(window: VitalReading[]): number[] {
  return window.map((r) => r.heartRate);
}

/** Compute step deltas between consecutive readings */
export function computeStepDeltas(window: VitalReading[]): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < window.length; i++) {
    deltas.push(Math.max(0, window[i].steps - window[i - 1].steps));
  }
  return deltas;
}

/** Compute statistical features from an array of numbers */
export function computeStats(values: number[]): {
  mean: number;
  std: number;
  min: number;
  max: number;
  range: number;
  rmssd: number;
  skewness: number;
} {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0, range: 0, rmssd: 0, skewness: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  // RMSSD - root mean square of successive differences (HRV proxy)
  let sumSqDiff = 0;
  for (let i = 1; i < n; i++) {
    sumSqDiff += (values[i] - values[i - 1]) ** 2;
  }
  const rmssd = n > 1 ? Math.sqrt(sumSqDiff / (n - 1)) : 0;

  // Skewness
  const skewness = std > 0
    ? values.reduce((sum, v) => sum + ((v - mean) / std) ** 3, 0) / n
    : 0;

  return { mean, std, min, max, range, rmssd, skewness };
}

/**
 * Build the 12-feature vector for stress estimation.
 * Input: 60 HR readings (5 minutes at 5-second intervals)
 */
export function buildStressFeatures(hrValues: number[]): number[] {
  const stats = computeStats(hrValues);
  const normalized = hrValues.map(normalizeHR);
  const normStats = computeStats(normalized);

  return [
    normalizeHR(stats.mean),      // normalized mean HR
    stats.std / 40,               // normalized std (max ~40 bpm spread)
    stats.rmssd / 50,             // normalized RMSSD
    stats.range / 100,            // normalized range
    normStats.skewness,           // skewness of normalized HR
    // Frequency-domain proxies (using successive difference patterns)
    stats.rmssd / (stats.std + 0.001), // ratio of RMSSD to STD
    normalize(stats.min, 40, 200),
    normalize(stats.max, 40, 200),
    // Trend features
    hrValues.length > 1 ? normalizeHR(hrValues[hrValues.length - 1]) - normalizeHR(hrValues[0]) : 0,
    // Activity proxy
    stats.std > 15 ? 1 : 0,      // high variability flag
    stats.mean > 100 ? 1 : 0,    // elevated HR flag
    stats.rmssd < 10 ? 1 : 0,    // low HRV flag (stress indicator)
  ];
}

/**
 * Build input for activity classifier.
 * 12 readings x 2 features (HR + step delta) = 24 features
 */
export function buildActivityFeatures(window: VitalReading[]): number[] {
  // Take last 12 readings
  const recent = window.slice(-12);
  if (recent.length < 12) {
    // Pad with zeros if not enough data
    const padded = Array(12 - recent.length).fill(null).map(() => ({
      heartRate: 70, spo2: 98, steps: 0, timestamp: 0,
    }));
    recent.unshift(...padded);
  }

  const features: number[] = [];
  for (let i = 0; i < 12; i++) {
    features.push(normalizeHR(recent[i].heartRate));
    const stepDelta = i > 0 ? Math.max(0, recent[i].steps - recent[i - 1].steps) : 0;
    features.push(Math.min(1, stepDelta / 20)); // normalize step delta (max ~20 per 5s)
  }
  return features;
}
