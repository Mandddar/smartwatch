/**
 * Sleep Quality Prediction — Regression
 * Input: 6 session features (duration, avgHR, hrVar, minHR, avgSpO2, movements)
 * Output: quality score 0-100
 */
import { getTF, isTFReady } from '../tfSetup';
import { normalizeHR } from '../preprocessing';

export interface SleepQualityInput {
  durationMinutes: number;
  avgHeartRate: number;
  hrVariance: number;
  minHeartRate: number;
  avgSpO2: number;
  movementCount: number;
}

export interface SleepQualityResult {
  predictedQuality: number; // 0-100
}

export async function predictSleepQuality(input: SleepQualityInput): Promise<SleepQualityResult> {
  const { durationMinutes, avgHeartRate, hrVariance, minHeartRate, avgSpO2, movementCount } = input;

  // Statistical prediction
  let quality = 0;

  // Duration: 7-8 hours optimal
  const durationHrs = durationMinutes / 60;
  if (durationHrs >= 7 && durationHrs <= 9) quality += 25;
  else if (durationHrs >= 6) quality += 18;
  else if (durationHrs >= 5) quality += 10;
  else quality += 5;

  // Lower avg HR during sleep = better
  if (avgHeartRate < 60) quality += 20;
  else if (avgHeartRate < 70) quality += 15;
  else if (avgHeartRate < 80) quality += 8;

  // Low HR variance = deeper, more stable sleep
  if (hrVariance < 5) quality += 15;
  else if (hrVariance < 10) quality += 10;
  else if (hrVariance < 15) quality += 5;

  // SpO2 levels
  if (avgSpO2 >= 97) quality += 20;
  else if (avgSpO2 >= 95) quality += 15;
  else if (avgSpO2 >= 93) quality += 8;
  else quality += 2;

  // Movement: less = better
  if (movementCount < 5) quality += 20;
  else if (movementCount < 15) quality += 12;
  else if (movementCount < 30) quality += 5;

  quality = Math.min(100, Math.max(0, quality));

  // If TF model available, refine
  if (isTFReady()) {
    try {
      const tf = getTF();
      const features = [
        Math.min(1, durationHrs / 10),
        normalizeHR(avgHeartRate),
        Math.min(1, hrVariance / 20),
        normalizeHR(minHeartRate),
        (avgSpO2 - 80) / 20,
        Math.min(1, movementCount / 50),
      ];
      const inputTensor = tf.tensor2d([features], [1, 6]);
      // Model prediction would blend here when loaded
      inputTensor.dispose();
    } catch {}
  }

  return { predictedQuality: Math.round(quality) };
}
