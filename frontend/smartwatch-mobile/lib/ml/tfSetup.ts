/**
 * TensorFlow.js initialization.
 * Uses @tensorflow/tfjs only (CPU backend) — works on web + native.
 * Gracefully degrades if unavailable — all ML falls back to statistical models.
 */

let tf: any = null;
let isReady = false;
let initFailed = false;

export async function initTF(): Promise<boolean> {
  if (isReady) return true;
  if (initFailed) return false;

  try {
    // Dynamic require so Metro doesn't crash if tfjs has issues
    const tfModule = require('@tensorflow/tfjs');
    tf = tfModule;
    await tf.ready();
    isReady = true;
    console.log('[ML] TensorFlow.js ready, backend:', tf.getBackend());
    return true;
  } catch (e) {
    console.warn('[ML] TensorFlow.js init failed, using statistical models only');
    initFailed = true;
    return false;
  }
}

export function getTF(): any {
  return tf;
}

export function isTFReady(): boolean {
  return isReady;
}
