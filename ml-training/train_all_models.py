"""
Train all 4 TinyML models for VitalWatch and export to TensorFlow.js format.

Models:
1. HR Anomaly Detection (Autoencoder) - 60 HR readings -> anomaly score
2. Activity Classification (Dense) - 24 features -> 4 classes
3. Stress Estimation (Regression) - 12 features -> stress score 0-1
4. Sleep Quality Prediction (Regression) - 6 features -> quality 0-1

Output: TF.js model JSON + binary weights in ../frontend/smartwatch-mobile/assets/models/
"""

import os
import numpy as np

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow import keras

np.random.seed(42)
tf.random.set_seed(42)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__),
    '..', 'frontend', 'smartwatch-mobile', 'assets', 'models')
os.makedirs(OUTPUT_DIR, exist_ok=True)


def normalize_hr(hr):
    return np.clip((hr - 40) / 160, 0, 1)


# =============================================================================
# Model 1: Heart Rate Anomaly Detection (Autoencoder)
# Input: 60 normalized HR values (5 min window at 5s intervals)
# Output: reconstruction -> anomaly = high reconstruction error
# =============================================================================
def train_hr_anomaly():
    print("Training HR Anomaly Autoencoder...")

    # Generate synthetic normal HR patterns
    n_samples = 10000
    normal_data = []
    for _ in range(n_samples):
        base = np.random.uniform(60, 90)  # resting HR range
        noise = np.random.normal(0, 2, 60)  # small natural variation
        trend = np.linspace(0, np.random.uniform(-3, 3), 60)  # gradual drift
        hr = base + noise + trend
        normal_data.append(normalize_hr(hr))

    X_train = np.array(normal_data, dtype=np.float32)

    # Autoencoder: 60 -> 32 -> 16 -> 8 -> 16 -> 32 -> 60
    encoder_input = keras.Input(shape=(60,))
    x = keras.layers.Dense(32, activation='relu')(encoder_input)
    x = keras.layers.Dense(16, activation='relu')(x)
    encoded = keras.layers.Dense(8, activation='relu')(x)
    x = keras.layers.Dense(16, activation='relu')(encoded)
    x = keras.layers.Dense(32, activation='relu')(x)
    decoded = keras.layers.Dense(60, activation='sigmoid')(x)

    autoencoder = keras.Model(encoder_input, decoded)
    autoencoder.compile(optimizer='adam', loss='mse')
    autoencoder.fit(X_train, X_train, epochs=30, batch_size=64, verbose=0)

    # Save
    path = os.path.join(OUTPUT_DIR, 'hr_anomaly')
    autoencoder.export(path)
    print(f"  Saved to {path}")
    return autoencoder


# =============================================================================
# Model 2: Activity Classification
# Input: 24 features (12 readings x [normalized HR, normalized step delta])
# Output: 4 classes [sedentary, walking, running, sleeping]
# =============================================================================
def train_activity_classifier():
    print("Training Activity Classifier...")

    n_per_class = 3000
    data = []
    labels = []

    for _ in range(n_per_class):
        # Sedentary: stable low-moderate HR, no step deltas
        hr = np.random.uniform(65, 85, 12)
        steps = np.zeros(12)
        features = np.column_stack([normalize_hr(hr), steps]).flatten()
        data.append(features)
        labels.append(0)

        # Walking: moderate HR, small step deltas
        hr = np.random.uniform(80, 110, 12) + np.random.normal(0, 3, 12)
        steps = np.random.uniform(0.1, 0.5, 12)  # normalized step deltas
        features = np.column_stack([normalize_hr(hr), steps]).flatten()
        data.append(features)
        labels.append(1)

        # Running: high HR, large step deltas
        hr = np.random.uniform(110, 160, 12) + np.random.normal(0, 5, 12)
        steps = np.random.uniform(0.4, 1.0, 12)
        features = np.column_stack([normalize_hr(hr), steps]).flatten()
        data.append(features)
        labels.append(2)

        # Sleeping: low stable HR, no steps
        hr = np.random.uniform(48, 65, 12) + np.random.normal(0, 1.5, 12)
        steps = np.zeros(12)
        features = np.column_stack([normalize_hr(hr), steps]).flatten()
        data.append(features)
        labels.append(3)

    X = np.array(data, dtype=np.float32)
    y = keras.utils.to_categorical(labels, 4)

    # Shuffle
    idx = np.random.permutation(len(X))
    X, y = X[idx], y[idx]

    model = keras.Sequential([
        keras.layers.Input(shape=(24,)),
        keras.layers.Dense(16, activation='relu'),
        keras.layers.Dense(8, activation='relu'),
        keras.layers.Dense(4, activation='softmax'),
    ])
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    model.fit(X, y, epochs=20, batch_size=64, verbose=0, validation_split=0.1)

    path = os.path.join(OUTPUT_DIR, 'activity')
    model.export(path)
    print(f"  Saved to {path}")
    return model


# =============================================================================
# Model 3: Stress Estimation
# Input: 12 statistical features from a 60-reading HR window
# Output: stress score 0-1
# =============================================================================
def train_stress_estimator():
    print("Training Stress Estimator...")

    n_samples = 8000
    data = []
    labels = []

    for _ in range(n_samples):
        # Generate stress level first, then create corresponding features
        stress = np.random.uniform(0, 1)

        mean_hr = 60 + stress * 50 + np.random.normal(0, 5)
        std_hr = 2 + stress * 15 + np.random.normal(0, 2)
        rmssd = max(0, 50 - stress * 45 + np.random.normal(0, 5))
        hr_range = 5 + stress * 40 + np.random.normal(0, 3)

        features = [
            normalize_hr(mean_hr),                     # normalized mean HR
            min(1, max(0, std_hr / 40)),               # normalized std
            min(1, max(0, rmssd / 50)),                # normalized RMSSD
            min(1, max(0, hr_range / 100)),            # normalized range
            np.random.normal(0, 0.5),                  # skewness
            min(2, max(0, rmssd / (std_hr + 0.1))),   # RMSSD/STD ratio
            normalize_hr(mean_hr - std_hr),            # min proxy
            normalize_hr(mean_hr + std_hr),            # max proxy
            np.random.uniform(-0.1, 0.1),              # trend
            1.0 if std_hr > 15 else 0.0,               # high variability flag
            1.0 if mean_hr > 100 else 0.0,             # elevated HR flag
            1.0 if rmssd < 10 else 0.0,                # low HRV flag
        ]
        data.append(features)
        labels.append(stress)

    X = np.array(data, dtype=np.float32)
    y = np.array(labels, dtype=np.float32)

    model = keras.Sequential([
        keras.layers.Input(shape=(12,)),
        keras.layers.Dense(16, activation='relu'),
        keras.layers.Dense(8, activation='relu'),
        keras.layers.Dense(1, activation='sigmoid'),
    ])
    model.compile(optimizer='adam', loss='mse')
    model.fit(X, y, epochs=30, batch_size=64, verbose=0, validation_split=0.1)

    path = os.path.join(OUTPUT_DIR, 'stress')
    model.export(path)
    print(f"  Saved to {path}")
    return model


# =============================================================================
# Model 4: Sleep Quality Prediction
# Input: 6 features (duration_hrs, avg_hr, hr_variance, min_hr, avg_spo2, movement_count)
# Output: quality score 0-1
# =============================================================================
def train_sleep_quality():
    print("Training Sleep Quality Predictor...")

    n_samples = 6000
    data = []
    labels = []

    for _ in range(n_samples):
        duration_hrs = np.random.uniform(2, 10)
        avg_hr = np.random.uniform(48, 75)
        hr_var = np.random.uniform(1, 20)
        min_hr = avg_hr - np.random.uniform(3, 15)
        avg_spo2 = np.random.uniform(93, 99)
        movements = np.random.randint(0, 50)

        # Quality heuristic: longer sleep, lower HR, higher SpO2, less movement = better
        quality = 0.0
        quality += min(0.25, duration_hrs / 32)         # duration (7-8h optimal)
        quality += 0.2 * (1 - normalize_hr(avg_hr))     # lower HR = better
        quality += 0.15 * (1 - min(1, hr_var / 20))     # less variability = deeper
        quality += 0.2 * ((avg_spo2 - 90) / 10)         # higher SpO2 = better
        quality += 0.2 * (1 - min(1, movements / 50))   # less movement = better
        quality = np.clip(quality + np.random.normal(0, 0.05), 0, 1)

        features = [
            min(1, duration_hrs / 10),
            normalize_hr(avg_hr),
            min(1, hr_var / 20),
            normalize_hr(min_hr),
            (avg_spo2 - 80) / 20,
            min(1, movements / 50),
        ]
        data.append(features)
        labels.append(quality)

    X = np.array(data, dtype=np.float32)
    y = np.array(labels, dtype=np.float32)

    model = keras.Sequential([
        keras.layers.Input(shape=(6,)),
        keras.layers.Dense(8, activation='relu'),
        keras.layers.Dense(4, activation='relu'),
        keras.layers.Dense(1, activation='sigmoid'),
    ])
    model.compile(optimizer='adam', loss='mse')
    model.fit(X, y, epochs=30, batch_size=64, verbose=0, validation_split=0.1)

    path = os.path.join(OUTPUT_DIR, 'sleep_quality')
    model.export(path)
    print(f"  Saved to {path}")
    return model


if __name__ == '__main__':
    print(f"Output directory: {OUTPUT_DIR}\n")
    train_hr_anomaly()
    train_activity_classifier()
    train_stress_estimator()
    train_sleep_quality()
    print("\nAll models trained and exported!")
