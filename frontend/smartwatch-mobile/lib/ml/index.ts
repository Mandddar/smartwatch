/**
 * ML Public API — single entry point for the rest of the app.
 *
 * Usage:
 *   import { initML, runInference, addReading, getModelStatus } from '@/lib/ml';
 *
 *   await initML();                    // call once on app start
 *   addReading({ heartRate, spo2, steps, timestamp });  // on each poll
 *   const insights = await runInference();              // get ML insights
 */
import { initTF, isTFReady } from './tfSetup';
import { initBuffer, pushReading, getBufferSize, hasEnoughData } from './vitalsBuffer';
import { detectAnomaly } from './models/heartRateAnomaly';
import { classifyActivity } from './models/activityClassifier';
import { estimateStress } from './models/stressEstimator';
import { predictSleepQuality, type SleepQualityInput } from './models/sleepQualityPredictor';
import { EMPTY_INSIGHTS, type MLInsights, type VitalReading, type ModelStatus } from './types';

let initialized = false;
let lastInferenceTime: number | null = null;

/** Initialize ML layer — call once from root _layout.tsx */
export async function initML(): Promise<boolean> {
  if (initialized) return true;

  try {
    // Init TF.js (may fail on web/Expo Go — that's fine)
    await initTF();

    // Load recent data from local SQLite into in-memory buffer
    initBuffer();

    initialized = true;
    console.log('[ML] Initialized, buffer size:', getBufferSize());
    return true;
  } catch (e) {
    console.warn('[ML] Init failed:', e);
    initialized = true; // still mark as init'd so statistical models work
    return false;
  }
}

/** Push a new vital reading into the buffer */
export function addReading(reading: VitalReading): void {
  pushReading(reading);
}

/** Run all ML models and return combined insights */
export async function runInference(): Promise<MLInsights> {
  if (!hasEnoughData()) {
    return {
      ...EMPTY_INSIGHTS,
      anomalyMessage: `Collecting data... (${getBufferSize()}/60 readings)`,
    };
  }

  try {
    const [anomaly, activity, stress] = await Promise.all([
      detectAnomaly(),
      classifyActivity(),
      estimateStress(),
    ]);

    lastInferenceTime = Date.now();

    return {
      anomalyDetected: anomaly.anomalyDetected,
      anomalyScore: anomaly.anomalyScore,
      anomalyMessage: anomaly.message,
      activity: activity.activity,
      activityConfidence: activity.confidence,
      stressLevel: stress.stressLevel,
      stressLabel: stress.stressLabel,
      predictedSleepQuality: null, // only set when sleep session data provided
    };
  } catch (e) {
    console.warn('[ML] Inference error:', e);
    return EMPTY_INSIGHTS;
  }
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
    modelsLoaded: [
      'heartRateAnomaly',
      'activityClassifier',
      'stressEstimator',
      'sleepQualityPredictor',
    ],
    bufferSize: getBufferSize(),
    lastInferenceTime,
  };
}

// Re-export types
export type { MLInsights, VitalReading, ModelStatus } from './types';
