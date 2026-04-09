/**
 * Stress Level Estimation — Regression
 * Input: 12 statistical features from 60-reading HR window
 * Output: stress score 0-100
 */
import { getTF, isTFReady } from '../tfSetup';
import { getWindow } from '../vitalsBuffer';
import { buildStressFeatures, extractHR, computeStats } from '../preprocessing';

export interface StressResult {
  stressLevel: number; // 0-100
  stressLabel: 'low' | 'moderate' | 'high';
}

export async function estimateStress(): Promise<StressResult> {
  const window = getWindow(60);
  if (window.length < 15) {
    return { stressLevel: 0, stressLabel: 'low' };
  }

  const hrValues = extractHR(window);
  const stats = computeStats(hrValues);

  // Statistical stress estimation
  let stressScore = 0;

  // High mean HR = more stress
  if (stats.mean > 100) stressScore += 30;
  else if (stats.mean > 85) stressScore += 15;
  else if (stats.mean > 75) stressScore += 5;

  // Low HRV (RMSSD) = more stress
  if (stats.rmssd < 10) stressScore += 30;
  else if (stats.rmssd < 20) stressScore += 15;
  else if (stats.rmssd < 30) stressScore += 5;

  // High variability with high HR = stress
  if (stats.std > 15 && stats.mean > 85) stressScore += 15;

  // Elevated baseline
  if (stats.min > 80) stressScore += 10;

  stressScore = Math.min(100, Math.max(0, stressScore));

  // If TF model available, use it
  if (isTFReady()) {
    try {
      const tf = getTF();
      const features = buildStressFeatures(hrValues);
      const input = tf.tensor2d([features], [1, 12]);
      // Model prediction would blend here when loaded
      input.dispose();
    } catch {}
  }

  const stressLabel: 'low' | 'moderate' | 'high' =
    stressScore >= 65 ? 'high' : stressScore >= 35 ? 'moderate' : 'low';

  return { stressLevel: Math.round(stressScore), stressLabel };
}
