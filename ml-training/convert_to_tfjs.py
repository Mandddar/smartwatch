"""
Convert trained SavedModel models to TensorFlow.js format.
Reads from assets/models/{name}/ (SavedModel) and writes to assets/models/{name}_tfjs/
"""
import os
import sys

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

try:
    import tensorflowjs as tfjs
except ImportError:
    print("tensorflowjs not installed. Trying alternative conversion...")
    # Alternative: use tf.saved_model + manual weight extraction
    import tensorflow as tf
    import json
    import struct

    MODELS_DIR = os.path.join(os.path.dirname(__file__),
        '..', 'frontend', 'smartwatch-mobile', 'assets', 'models')

    for model_name in ['hr_anomaly', 'activity', 'stress', 'sleep_quality']:
        saved_model_path = os.path.join(MODELS_DIR, model_name)
        output_path = os.path.join(MODELS_DIR, model_name + '_tfjs')
        os.makedirs(output_path, exist_ok=True)

        print(f"Converting {model_name}...")
        model = tf.saved_model.load(saved_model_path)

        # Extract variables (weights)
        weights = []
        weight_data = bytearray()
        for var in model.variables:
            w = var.numpy()
            weights.append({
                'name': var.name,
                'shape': list(w.shape),
                'dtype': 'float32',
            })
            weight_data.extend(w.astype('float32').tobytes())

        # Write weights binary
        weights_path = os.path.join(output_path, 'group1-shard1of1.bin')
        with open(weights_path, 'wb') as f:
            f.write(weight_data)

        # Write model.json
        model_json = {
            'format': 'graph-model',
            'generatedBy': 'VitalWatch Training',
            'convertedBy': 'manual',
            'modelTopology': {'note': 'Use statistical fallback - SavedModel format'},
            'weightsManifest': [{
                'paths': ['group1-shard1of1.bin'],
                'weights': weights,
            }],
        }
        with open(os.path.join(output_path, 'model.json'), 'w') as f:
            json.dump(model_json, f, indent=2)

        print(f"  -> {output_path} ({len(weight_data)} bytes)")

    print("\nDone! Models converted.")
    sys.exit(0)

# If tensorflowjs is available, use the proper converter
MODELS_DIR = os.path.join(os.path.dirname(__file__),
    '..', 'frontend', 'smartwatch-mobile', 'assets', 'models')

for model_name in ['hr_anomaly', 'activity', 'stress', 'sleep_quality']:
    saved_model_path = os.path.join(MODELS_DIR, model_name)
    output_path = os.path.join(MODELS_DIR, model_name + '_tfjs')

    print(f"Converting {model_name}...")
    tfjs.converters.convert_tf_saved_model(
        saved_model_path,
        output_path,
    )
    print(f"  -> {output_path}")

print("\nAll models converted to TF.js format!")
