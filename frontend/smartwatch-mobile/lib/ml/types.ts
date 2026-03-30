/**
 * TypeScript interfaces for the on-device ML layer.
 */

export interface VitalReading {
  heartRate: number;
  spo2: number;
  steps: number;
  timestamp: number; // epoch ms
}

export interface MLInsights {
  /** Heart rate anomaly detection */
  anomalyDetected: boolean;
  anomalyScore: number; // 0-1, higher = more anomalous
  anomalyMessage: string | null;

  /** Activity classification */
  activity: 'sedentary' | 'walking' | 'running' | 'sleeping';
  activityConfidence: number; // 0-1

  /** Stress estimation */
  stressLevel: number; // 0-100
  stressLabel: 'low' | 'moderate' | 'high';

  /** Sleep quality (only available when sleep session data exists) */
  predictedSleepQuality: number | null; // 0-100
}

export interface ModelStatus {
  initialized: boolean;
  modelsLoaded: string[];
  bufferSize: number;
  lastInferenceTime: number | null;
}

export const EMPTY_INSIGHTS: MLInsights = {
  anomalyDetected: false,
  anomalyScore: 0,
  anomalyMessage: null,
  activity: 'sedentary',
  activityConfidence: 0,
  stressLevel: 0,
  stressLabel: 'low',
  predictedSleepQuality: null,
};
