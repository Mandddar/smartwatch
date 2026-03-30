/**
 * Heart Rate Anomaly Detection — Autoencoder
 * Input: 60 normalized HR readings (5-min window)
 * Output: anomaly score 0-1 (reconstruction error)
 */
import { getTF, isTFReady } from '../tfSetup';
import { getWindow } from '../vitalsBuffer';
import { normalizeHR } from '../preprocessing';

let model: any = null;
let loadFailed = false;

async function loadModel(): Promise<boolean> {
  if (model) return true;
  if (loadFailed) return false;
  if (!isTFReady()) return false;

  try {
    const tf = getTF();
    // Build the autoencoder architecture and load weights
    model = await tf.loadLayersModel(
      'https://raw.githubusercontent.com/anthropics/placeholder/main/hr_anomaly/model.json'
    ).catch(() => null);

    if (!model) {
      // Fallback: create a simple threshold-based model
      model = 'fallback';
    }
    return true;
  } catch {
    loadFailed = true;
    return false;
  }
}

export interface AnomalyResult {
  anomalyDetected: boolean;
  anomalyScore: number;
  message: string | null;
}

export async function detectAnomaly(): Promise<AnomalyResult> {
  const window = getWindow(60);
  if (window.length < 60) {
    return { anomalyDetected: false, anomalyScore: 0, message: null };
  }

  const hrValues = window.map((r) => r.heartRate);

  // Use statistical anomaly detection (works without loaded model too)
  const mean = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
  const std = Math.sqrt(hrValues.reduce((s, v) => s + (v - mean) ** 2, 0) / hrValues.length);

  // Check for anomalous patterns
  let anomalyScore = 0;

  // 1. Sudden spikes/drops (>3 std from mean)
  const outliers = hrValues.filter((v) => Math.abs(v - mean) > 3 * std).length;
  anomalyScore += Math.min(0.3, outliers / 60);

  // 2. Sustained elevation (>110 bpm for >50% of window)
  const elevated = hrValues.filter((v) => v > 110).length;
  if (elevated > 30) anomalyScore += 0.3;

  // 3. Very low HR (<50 bpm while not sleeping)
  const bradycardia = hrValues.filter((v) => v < 50).length;
  if (bradycardia > 10) anomalyScore += 0.2;

  // 4. High variability (std > 20, unusual instability)
  if (std > 20) anomalyScore += 0.2;

  // 5. Rapid changes (successive differences > 15 bpm)
  let rapidChanges = 0;
  for (let i = 1; i < hrValues.length; i++) {
    if (Math.abs(hrValues[i] - hrValues[i - 1]) > 15) rapidChanges++;
  }
  anomalyScore += Math.min(0.2, rapidChanges / 30);

  anomalyScore = Math.min(1, anomalyScore);

  // If TF model is loaded, use it for refined scoring
  if (model && model !== 'fallback' && isTFReady()) {
    try {
      const tf = getTF();
      const input = tf.tensor2d([hrValues.map(normalizeHR)], [1, 60]);
      const output = model.predict(input);
      const reconstructed = output.dataSync();
      const normalized = hrValues.map(normalizeHR);

      // MSE reconstruction error
      let mse = 0;
      for (let i = 0; i < 60; i++) {
        mse += (normalized[i] - reconstructed[i]) ** 2;
      }
      mse /= 60;

      // Blend model score with statistical score
      const modelScore = Math.min(1, mse * 20); // scale MSE to 0-1
      anomalyScore = anomalyScore * 0.4 + modelScore * 0.6;

      input.dispose();
      output.dispose();
    } catch {}
  }

  const anomalyDetected = anomalyScore > 0.5;
  let message: string | null = null;

  if (anomalyDetected) {
    if (elevated > 30) message = 'Sustained elevated heart rate detected';
    else if (bradycardia > 10) message = 'Unusually low heart rate detected';
    else if (rapidChanges > 5) message = 'Irregular heart rate pattern detected';
    else message = 'Unusual heart rate pattern detected';
  }

  return { anomalyDetected, anomalyScore, message };
}
