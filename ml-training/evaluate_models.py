"""
Evaluate all 4 trained models on held-out test data.
"""
import os
import numpy as np

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow import keras

np.random.seed(99)  # different seed from training

def normalize_hr(hr):
    return np.clip((hr - 40) / 160, 0, 1)


# =============================================================================
# Model 1: HR Anomaly Autoencoder
# =============================================================================
def eval_hr_anomaly():
    print("=" * 60)
    print("MODEL 1: HR Anomaly Detection (Autoencoder)")
    print("=" * 60)

    model = tf.saved_model.load(os.path.join(MODELS_DIR, 'hr_anomaly'))
    serve = model.signatures['serving_default']

    # Generate normal test data
    normal_test = []
    for _ in range(500):
        base = np.random.uniform(60, 90)
        noise = np.random.normal(0, 2, 60)
        trend = np.linspace(0, np.random.uniform(-3, 3), 60)
        normal_test.append(normalize_hr(base + noise + trend))

    # Generate anomalous test data
    anomalous_test = []
    for _ in range(100):
        # Sudden spike
        hr = np.random.uniform(65, 80, 60)
        spike_pos = np.random.randint(10, 50)
        hr[spike_pos:spike_pos+5] += np.random.uniform(40, 60)
        anomalous_test.append(normalize_hr(hr))

    for _ in range(100):
        # Sustained tachycardia
        hr = np.random.uniform(120, 160, 60) + np.random.normal(0, 5, 60)
        anomalous_test.append(normalize_hr(hr))

    for _ in range(100):
        # Bradycardia
        hr = np.random.uniform(35, 48, 60) + np.random.normal(0, 2, 60)
        anomalous_test.append(normalize_hr(hr))

    for _ in range(100):
        # Erratic/irregular
        hr = np.random.uniform(50, 150, 60)
        anomalous_test.append(normalize_hr(hr))

    # Compute reconstruction error
    def get_mse(data):
        input_key = list(serve.structured_input_signature[1].keys())[0]
        output_key = list(serve.structured_outputs.keys())[0]
        inp = tf.constant(np.array(data, dtype=np.float32))
        out = serve(**{input_key: inp})[output_key].numpy()
        mse = np.mean((np.array(data) - out) ** 2, axis=1)
        return mse

    normal_mse = get_mse(normal_test)
    anomalous_mse = get_mse(anomalous_test)

    # Find optimal threshold
    best_acc = 0
    best_thresh = 0
    for thresh in np.linspace(0, 0.05, 100):
        normal_correct = np.sum(normal_mse < thresh)
        anomaly_correct = np.sum(anomalous_mse >= thresh)
        acc = (normal_correct + anomaly_correct) / (len(normal_mse) + len(anomalous_mse))
        if acc > best_acc:
            best_acc = acc
            best_thresh = thresh

    normal_correct = np.sum(normal_mse < best_thresh)
    anomaly_correct = np.sum(anomalous_mse >= best_thresh)

    print(f"  Normal samples:   {len(normal_test)}")
    print(f"  Anomaly samples:  {len(anomalous_test)}")
    print(f"  Normal MSE:       {np.mean(normal_mse):.6f} (std: {np.std(normal_mse):.6f})")
    print(f"  Anomaly MSE:      {np.mean(anomalous_mse):.6f} (std: {np.std(anomalous_mse):.6f})")
    print(f"  Optimal threshold: {best_thresh:.6f}")
    print(f"  Normal detected:  {normal_correct}/{len(normal_test)} ({100*normal_correct/len(normal_test):.1f}%)")
    print(f"  Anomaly detected: {anomaly_correct}/{len(anomalous_test)} ({100*anomaly_correct/len(anomalous_test):.1f}%)")
    print(f"  >> Overall Accuracy: {best_acc*100:.1f}%")
    print()


# =============================================================================
# Model 2: Activity Classifier
# =============================================================================
def eval_activity():
    print("=" * 60)
    print("MODEL 2: Activity Classification")
    print("=" * 60)

    model = tf.saved_model.load(os.path.join(MODELS_DIR, 'activity'))
    serve = model.signatures['serving_default']

    n_test = 500
    data = []
    labels = []

    for _ in range(n_test):
        # Sedentary
        hr = np.random.uniform(65, 85, 12)
        steps = np.zeros(12)
        data.append(np.column_stack([normalize_hr(hr), steps]).flatten())
        labels.append(0)
        # Walking
        hr = np.random.uniform(80, 110, 12) + np.random.normal(0, 3, 12)
        steps = np.random.uniform(0.1, 0.5, 12)
        data.append(np.column_stack([normalize_hr(hr), steps]).flatten())
        labels.append(1)
        # Running
        hr = np.random.uniform(110, 160, 12) + np.random.normal(0, 5, 12)
        steps = np.random.uniform(0.4, 1.0, 12)
        data.append(np.column_stack([normalize_hr(hr), steps]).flatten())
        labels.append(2)
        # Sleeping
        hr = np.random.uniform(48, 65, 12) + np.random.normal(0, 1.5, 12)
        steps = np.zeros(12)
        data.append(np.column_stack([normalize_hr(hr), steps]).flatten())
        labels.append(3)

    X = np.array(data, dtype=np.float32)
    y = np.array(labels)

    input_key = list(serve.structured_input_signature[1].keys())[0]
    output_key = list(serve.structured_outputs.keys())[0]
    preds = serve(**{input_key: tf.constant(X)})[output_key].numpy()
    pred_labels = np.argmax(preds, axis=1)

    total_correct = np.sum(pred_labels == y)
    class_names = ['Sedentary', 'Walking', 'Running', 'Sleeping']
    print(f"  Total test samples: {len(y)}")
    for i, name in enumerate(class_names):
        mask = y == i
        class_correct = np.sum(pred_labels[mask] == i)
        class_total = np.sum(mask)
        print(f"  {name}: {class_correct}/{class_total} ({100*class_correct/class_total:.1f}%)")
    print(f"  >> Overall Accuracy: {100*total_correct/len(y):.1f}%")
    print()


# =============================================================================
# Model 3: Stress Estimator
# =============================================================================
def eval_stress():
    print("=" * 60)
    print("MODEL 3: Stress Estimation (Regression)")
    print("=" * 60)

    model = tf.saved_model.load(os.path.join(MODELS_DIR, 'stress'))
    serve = model.signatures['serving_default']

    n_test = 1000
    data = []
    labels = []

    for _ in range(n_test):
        stress = np.random.uniform(0, 1)
        mean_hr = 60 + stress * 50 + np.random.normal(0, 5)
        std_hr = 2 + stress * 15 + np.random.normal(0, 2)
        rmssd = max(0, 50 - stress * 45 + np.random.normal(0, 5))
        hr_range = 5 + stress * 40 + np.random.normal(0, 3)

        features = [
            normalize_hr(mean_hr), min(1, max(0, std_hr / 40)),
            min(1, max(0, rmssd / 50)), min(1, max(0, hr_range / 100)),
            np.random.normal(0, 0.5), min(2, max(0, rmssd / (std_hr + 0.1))),
            normalize_hr(mean_hr - std_hr), normalize_hr(mean_hr + std_hr),
            np.random.uniform(-0.1, 0.1),
            1.0 if std_hr > 15 else 0.0,
            1.0 if mean_hr > 100 else 0.0,
            1.0 if rmssd < 10 else 0.0,
        ]
        data.append(features)
        labels.append(stress)

    X = np.array(data, dtype=np.float32)
    y = np.array(labels, dtype=np.float32)

    input_key = list(serve.structured_input_signature[1].keys())[0]
    output_key = list(serve.structured_outputs.keys())[0]
    preds = serve(**{input_key: tf.constant(X)})[output_key].numpy().flatten()

    mae = np.mean(np.abs(preds - y))
    mse = np.mean((preds - y) ** 2)
    rmse = np.sqrt(mse)

    # Classification accuracy (low/moderate/high buckets)
    def bucket(v):
        if v < 0.35: return 0
        if v < 0.65: return 1
        return 2

    true_buckets = np.array([bucket(v) for v in y])
    pred_buckets = np.array([bucket(v) for v in preds])
    bucket_acc = np.mean(true_buckets == pred_buckets)

    print(f"  Test samples:  {len(y)}")
    print(f"  MAE:           {mae:.4f} (on 0-1 scale) = {mae*100:.1f} points on 0-100")
    print(f"  RMSE:          {rmse:.4f}")
    print(f"  >> Bucket Accuracy (low/moderate/high): {bucket_acc*100:.1f}%")
    print()


# =============================================================================
# Model 4: Sleep Quality
# =============================================================================
def eval_sleep_quality():
    print("=" * 60)
    print("MODEL 4: Sleep Quality Prediction (Regression)")
    print("=" * 60)

    model = tf.saved_model.load(os.path.join(MODELS_DIR, 'sleep_quality'))
    serve = model.signatures['serving_default']

    n_test = 1000
    data = []
    labels = []

    for _ in range(n_test):
        dur = np.random.uniform(2, 10)
        avg_hr = np.random.uniform(48, 75)
        hr_var = np.random.uniform(1, 20)
        min_hr = avg_hr - np.random.uniform(3, 15)
        avg_spo2 = np.random.uniform(93, 99)
        movements = np.random.randint(0, 50)

        quality = 0.0
        quality += min(0.25, dur / 32)
        quality += 0.2 * (1 - normalize_hr(avg_hr))
        quality += 0.15 * (1 - min(1, hr_var / 20))
        quality += 0.2 * ((avg_spo2 - 90) / 10)
        quality += 0.2 * (1 - min(1, movements / 50))
        quality = np.clip(quality + np.random.normal(0, 0.05), 0, 1)

        features = [
            min(1, dur / 10), normalize_hr(avg_hr),
            min(1, hr_var / 20), normalize_hr(min_hr),
            (avg_spo2 - 80) / 20, min(1, movements / 50),
        ]
        data.append(features)
        labels.append(quality)

    X = np.array(data, dtype=np.float32)
    y = np.array(labels, dtype=np.float32)

    input_key = list(serve.structured_input_signature[1].keys())[0]
    output_key = list(serve.structured_outputs.keys())[0]
    preds = serve(**{input_key: tf.constant(X)})[output_key].numpy().flatten()

    mae = np.mean(np.abs(preds - y))
    rmse = np.sqrt(np.mean((preds - y) ** 2))

    # Within 10 points accuracy (on 0-100 scale)
    within_10 = np.mean(np.abs(preds - y) * 100 < 10)
    within_15 = np.mean(np.abs(preds - y) * 100 < 15)

    print(f"  Test samples:  {len(y)}")
    print(f"  MAE:           {mae:.4f} (0-1 scale) = {mae*100:.1f} points on 0-100")
    print(f"  RMSE:          {rmse:.4f}")
    print(f"  >> Within 10 pts: {within_10*100:.1f}%")
    print(f"  >> Within 15 pts: {within_15*100:.1f}%")
    print()


MODELS_DIR = os.path.join(os.path.dirname(__file__),
    '..', 'frontend', 'smartwatch-mobile', 'assets', 'models')

eval_hr_anomaly()
eval_activity()
eval_stress()
eval_sleep_quality()
