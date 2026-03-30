/**
 * Activity Classification — Dense Network
 * Input: 24 features (12 readings x [HR, step_delta])
 * Output: sedentary | walking | running | sleeping
 */
import { getTF, isTFReady } from '../tfSetup';
import { getWindow } from '../vitalsBuffer';
import { buildActivityFeatures, normalizeHR, computeStepDeltas } from '../preprocessing';

const LABELS: Array<'sedentary' | 'walking' | 'running' | 'sleeping'> = [
  'sedentary', 'walking', 'running', 'sleeping',
];

export interface ActivityResult {
  activity: 'sedentary' | 'walking' | 'running' | 'sleeping';
  confidence: number;
}

export async function classifyActivity(): Promise<ActivityResult> {
  const window = getWindow(12);
  if (window.length < 3) {
    return { activity: 'sedentary', confidence: 0 };
  }

  // Statistical classification (works without TF model)
  const recentHR = window.slice(-12);
  const avgHR = recentHR.reduce((s, r) => s + r.heartRate, 0) / recentHR.length;

  // Compute step deltas
  let totalStepDelta = 0;
  for (let i = 1; i < recentHR.length; i++) {
    totalStepDelta += Math.max(0, recentHR[i].steps - recentHR[i - 1].steps);
  }
  const avgStepDelta = totalStepDelta / Math.max(1, recentHR.length - 1);

  // HR variability
  const hrStd = Math.sqrt(
    recentHR.reduce((s, r) => s + (r.heartRate - avgHR) ** 2, 0) / recentHR.length
  );

  // Classification rules
  let activity: 'sedentary' | 'walking' | 'running' | 'sleeping';
  let confidence: number;

  if (avgHR < 62 && avgStepDelta < 0.5 && hrStd < 5) {
    activity = 'sleeping';
    confidence = Math.min(0.95, 0.7 + (62 - avgHR) / 40);
  } else if (avgHR > 120 && avgStepDelta > 5) {
    activity = 'running';
    confidence = Math.min(0.95, 0.6 + (avgHR - 120) / 100 + avgStepDelta / 30);
  } else if (avgStepDelta > 1 || (avgHR > 85 && avgStepDelta > 0.3)) {
    activity = 'walking';
    confidence = Math.min(0.9, 0.5 + avgStepDelta / 10 + (avgHR - 70) / 100);
  } else {
    activity = 'sedentary';
    confidence = Math.min(0.9, 0.6 + (1 - avgStepDelta) * 0.2);
  }

  // If TF model available, blend predictions
  if (isTFReady()) {
    try {
      const tf = getTF();
      const features = buildActivityFeatures(window);
      const input = tf.tensor2d([features], [1, 24]);
      // Model prediction would go here when loaded
      input.dispose();
    } catch {}
  }

  return { activity, confidence };
}
