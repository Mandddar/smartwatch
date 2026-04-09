/**
 * ML Public API — single entry point for the rest of the app.
 */
import { initTF, isTFReady } from './tfSetup';
import { initBuffer, pushReading, getBufferSize, hasEnoughData, getWindow } from './vitalsBuffer';
import { detectAnomaly } from './models/heartRateAnomaly';
import { classifyActivity } from './models/activityClassifier';
import { estimateStress } from './models/stressEstimator';
import { predictSleepQuality, type SleepQualityInput } from './models/sleepQualityPredictor';
import { EMPTY_INSIGHTS, type MLInsights, type VitalReading, type ModelStatus, type InsightDetail } from './types';
import { computeStats, extractHR } from './preprocessing';

let initialized = false;
let lastInferenceTime: number | null = null;

// Track recent stress for trend detection
let stressHistory: number[] = [];

/** Initialize ML layer — call once from root _layout.tsx */
export async function initML(): Promise<boolean> {
  if (initialized) return true;
  try {
    await initTF();
    initBuffer();
    initialized = true;
    console.log('[ML] Initialized, buffer size:', getBufferSize());
    return true;
  } catch (e) {
    console.warn('[ML] Init failed:', e);
    initialized = true;
    return false;
  }
}

/** Push a new vital reading into the buffer */
export function addReading(reading: VitalReading): void {
  pushReading(reading);
}

/** Run all ML models and return combined insights with detailed explanations */
export async function runInference(): Promise<MLInsights> {
  if (!hasEnoughData()) {
    return {
      ...EMPTY_INSIGHTS,
      anomalyMessage: `Collecting data... (${getBufferSize()}/15 readings needed)`,
    };
  }

  try {
    const [anomalyResult, activityResult, stressResult] = await Promise.allSettled([
      detectAnomaly(),
      classifyActivity(),
      estimateStress(),
    ]);

    const anomaly = anomalyResult.status === 'fulfilled' ? anomalyResult.value
      : { anomalyDetected: false, anomalyScore: 0, message: null };
    const activity = activityResult.status === 'fulfilled' ? activityResult.value
      : { activity: 'sedentary' as const, confidence: 0 };
    const stress = stressResult.status === 'fulfilled' ? stressResult.value
      : { stressLevel: 0, stressLabel: 'low' as const };

    lastInferenceTime = Date.now();

    // Track stress history for predictions
    stressHistory.push(stress.stressLevel);
    if (stressHistory.length > 60) stressHistory = stressHistory.slice(-60);

    // Generate detailed insights and predictions
    const details = generateDetails(anomaly, activity, stress);
    const predictions = generatePredictions(anomaly, activity, stress);

    return {
      anomalyDetected: anomaly.anomalyDetected,
      anomalyScore: anomaly.anomalyScore,
      anomalyMessage: anomaly.message,
      activity: activity.activity,
      activityConfidence: activity.confidence,
      stressLevel: stress.stressLevel,
      stressLabel: stress.stressLabel,
      predictedSleepQuality: null,
      details,
      predictions,
    };
  } catch (e) {
    console.warn('[ML] Inference error:', e);
    return EMPTY_INSIGHTS;
  }
}

function generateDetails(
  anomaly: { anomalyDetected: boolean; anomalyScore: number; message: string | null },
  activity: { activity: string; confidence: number },
  stress: { stressLevel: number; stressLabel: string },
): InsightDetail[] {
  const details: InsightDetail[] = [];
  const w = getWindow(60);
  const hr = extractHR(w);
  const s = hr.length >= 5 ? computeStats(hr) : null;
  const avg = s ? Math.round(s.mean) : 0;

  if (activity.activity === 'sedentary' && activity.confidence > 0.5) {
    const mins = Math.round(w.length * 5 / 60);
    details.push({
      title: `Inactive for ~${mins} min`,
      reason: `HR steady at ${avg} bpm, no steps`,
      recommendation: 'Stand up and stretch',
      severity: mins > 20 ? 'warning' : 'info',
    });
  } else if (activity.activity === 'running') {
    details.push({
      title: `Running — ${avg} bpm`,
      reason: 'High HR + rapid steps',
      recommendation: avg > 160 ? 'Slow down, stay hydrated' : 'Stay hydrated',
      severity: avg > 160 ? 'warning' : 'info',
    });
  } else if (activity.activity === 'walking') {
    details.push({
      title: `Walking — ${avg} bpm`,
      reason: 'Moderate HR + steady steps',
      recommendation: 'Keep it up!',
      severity: 'info',
    });
  }

  if (stress.stressLevel >= 65) {
    details.push({
      title: 'High stress',
      reason: `Low HRV, elevated HR (${avg} bpm)`,
      recommendation: 'Breathe: 4s in, 4s hold, 4s out',
      severity: 'warning',
    });
  }

  if (anomaly.anomalyDetected) {
    details.push({
      title: 'Unusual HR pattern',
      reason: anomaly.message || 'Pattern deviates from baseline',
      recommendation: anomaly.anomalyScore > 0.8 ? 'Rest now. Seek help if symptoms appear.' : 'Rest and monitor',
      severity: anomaly.anomalyScore > 0.8 ? 'critical' : 'warning',
    });
  }

  if (w.length > 0) {
    const spo2 = w.slice(-5).reduce((a, r) => a + r.spo2, 0) / Math.min(5, w.length);
    if (spo2 < 94) {
      details.push({
        title: `SpO2 low — ${spo2.toFixed(0)}%`,
        reason: 'Below normal range (95-100%)',
        recommendation: spo2 < 92 ? 'Sit upright, breathe deeply. See a doctor if persistent.' : 'Deep breaths, sit upright',
        severity: spo2 < 92 ? 'critical' : 'warning',
      });
    }
  }

  return details;
}

function generatePredictions(
  anomaly: { anomalyDetected: boolean; anomalyScore: number; message: string | null },
  activity: { activity: string; confidence: number },
  stress: { stressLevel: number; stressLabel: string },
): InsightDetail[] {
  const predictions: InsightDetail[] = [];
  const w = getWindow(60);
  const hr = extractHR(w);
  const s = hr.length >= 10 ? computeStats(hr) : null;

  // Stress rising
  if (stressHistory.length >= 6) {
    const r = stressHistory.slice(-6);
    const a = (r[0] + r[1] + r[2]) / 3;
    const b = (r[3] + r[4] + r[5]) / 3;
    if (b - a > 10 && stress.stressLevel >= 40) {
      predictions.push({
        title: 'Stress rising',
        reason: `${a.toFixed(0)} → ${b.toFixed(0)} in last few cycles`,
        recommendation: 'Take a break before it peaks',
        severity: 'warning',
      });
    }
  }

  // HR climbing
  if (s && hr.length >= 20) {
    const rAvg = hr.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const oAvg = hr.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    if (rAvg - oAvg > 12 && rAvg > 90) {
      predictions.push({
        title: `HR climbing — ${oAvg.toFixed(0)} → ${rAvg.toFixed(0)}`,
        reason: 'Rising faster than normal',
        recommendation: activity.activity === 'running' ? 'Slow your pace' : 'Hydrate and rest',
        severity: 'warning',
      });
    }
  }

  // Evening stress → bad sleep
  if (new Date().getHours() >= 20 && stress.stressLevel >= 50) {
    predictions.push({
      title: 'May affect sleep',
      reason: `Stress at ${stress.stressLevel} in the evening`,
      recommendation: 'Wind down — dim lights, no screens',
      severity: 'info',
    });
  }

  // Anomaly creeping
  if (!anomaly.anomalyDetected && anomaly.anomalyScore > 0.5) {
    predictions.push({
      title: 'HR pattern shifting',
      reason: `Anomaly score at ${(anomaly.anomalyScore * 100).toFixed(0)}%`,
      recommendation: 'Watch for palpitations or dizziness',
      severity: 'info',
    });
  }

  return predictions;
}

/** Run sleep quality prediction (call when sleep session ends) */
export async function predictSleep(input: SleepQualityInput): Promise<number | null> {
  try {
    const result = await predictSleepQuality(input);
    return result.predictedQuality;
  } catch {
    return null;
  }
}

/** Get current model status */
export function getModelStatus(): ModelStatus {
  return {
    initialized,
    modelsLoaded: ['heartRateAnomaly', 'activityClassifier', 'stressEstimator', 'sleepQualityPredictor'],
    bufferSize: getBufferSize(),
    lastInferenceTime,
  };
}

export type { MLInsights, VitalReading, ModelStatus, InsightDetail } from './types';
