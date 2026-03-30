/**
 * On-device adaptive baselines — computes "Your Normal" from local SQLite data.
 * Provides instant baselines without waiting for backend sync.
 * Backend baselines take precedence once synced.
 */
import { getRecentVitals, isDbAvailable } from '../sync/localDb';
import { computeStats } from './preprocessing';

export interface Baseline {
  metric: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  lowerBound: number; // mean - 2*std
  upperBound: number; // mean + 2*std
  sampleCount: number;
  personalized: boolean; // true when sampleCount >= 1008 (~7 days)
}

export interface AllBaselines {
  hrResting: Baseline | null;
  hrActive: Baseline | null;
  spo2: Baseline | null;
  stepsDaily: Baseline | null;
  learningProgress: number; // 0-100, percentage toward personalization
  isPersonalized: boolean;
}

const MIN_SAMPLES = 1008; // ~7 days at 12 readings/hour * 12 waking hours

/** Compute baselines from local SQLite data */
export function computeLocalBaselines(): AllBaselines {
  if (!isDbAvailable()) {
    return emptyBaselines();
  }

  // Get up to 14 days of local data (max we keep)
  const vitals = getRecentVitals(20000); // get as much as possible
  if (vitals.length < 30) {
    return emptyBaselines();
  }

  // HR Resting: readings where HR < 90
  const restingHR = vitals
    .filter((v) => v.heartRate < 90)
    .map((v) => v.heartRate);

  // HR Active: readings where HR >= 90
  const activeHR = vitals
    .filter((v) => v.heartRate >= 90)
    .map((v) => v.heartRate);

  // SpO2
  const spo2Values = vitals.map((v) => v.spo2);

  // Compute baselines
  const hrRestingBaseline = restingHR.length > 10 ? makeBaseline('hr_resting', restingHR) : null;
  const hrActiveBaseline = activeHR.length > 10 ? makeBaseline('hr_active', activeHR) : null;
  const spo2Baseline = spo2Values.length > 10 ? makeBaseline('spo2', spo2Values) : null;

  const maxSamples = Math.max(restingHR.length, activeHR.length, spo2Values.length);
  const progress = Math.min(100, Math.round((maxSamples / MIN_SAMPLES) * 100));

  return {
    hrResting: hrRestingBaseline,
    hrActive: hrActiveBaseline,
    spo2: spo2Baseline,
    stepsDaily: null, // needs daily aggregation, better from backend
    learningProgress: progress,
    isPersonalized: maxSamples >= MIN_SAMPLES,
  };
}

/** Check if a current value is outside the user's normal range */
export function isOutsideBaseline(value: number, baseline: Baseline | null, sigma: number = 2): boolean {
  if (!baseline || !baseline.personalized) return false;
  return value < (baseline.mean - sigma * baseline.std) || value > (baseline.mean + sigma * baseline.std);
}

/** Get the deviation from baseline as a percentage */
export function getDeviationPercent(value: number, baseline: Baseline | null): number | null {
  if (!baseline || baseline.mean === 0) return null;
  return Math.round(((value - baseline.mean) / baseline.mean) * 100);
}

/** Get a human-readable description of how a value compares to baseline */
export function describeDeviation(value: number, baseline: Baseline | null, metricName: string): string | null {
  if (!baseline || !baseline.personalized) return null;
  const pct = getDeviationPercent(value, baseline);
  if (pct === null) return null;

  if (Math.abs(pct) < 5) return null; // within normal, no message
  const direction = pct > 0 ? 'above' : 'below';
  return `${metricName} is ${Math.abs(pct)}% ${direction} your personal baseline (${baseline.mean})`;
}

function makeBaseline(metric: string, values: number[]): Baseline {
  const stats = computeStats(values);
  const lower = Math.round((stats.mean - 2 * stats.std) * 10) / 10;
  const upper = Math.round((stats.mean + 2 * stats.std) * 10) / 10;

  return {
    metric,
    mean: Math.round(stats.mean * 10) / 10,
    std: Math.round(stats.std * 10) / 10,
    min: stats.min,
    max: stats.max,
    lowerBound: lower,
    upperBound: upper,
    sampleCount: values.length,
    personalized: values.length >= MIN_SAMPLES,
  };
}

function emptyBaselines(): AllBaselines {
  return {
    hrResting: null,
    hrActive: null,
    spo2: null,
    stepsDaily: null,
    learningProgress: 0,
    isPersonalized: false,
  };
}
