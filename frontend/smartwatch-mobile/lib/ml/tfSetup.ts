/**
 * TensorFlow.js initialization.
 * Must be called once before any model inference.
 * Uses @tensorflow/tfjs only (CPU backend) — works on web + native.
 * Gracefully degrades if unavailable.
 */

let tf: any = null;
let isReady = false;
let initFailed = false;

export async function initTF(): Promise<boolean> {
  if (isReady) return true;
  if (initFailed) return false;

  try {
    tf = require('@tensorflow/tfjs');
    await tf.ready();
    isReady = true;
    console.log('[ML] TensorFlow.js ready, backend:', tf.getBackend());
    return true;
  } catch (e) {
    console.warn('[ML] TensorFlow.js init failed, using statistical models only:', e);
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
