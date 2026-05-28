import os
import sys
from pathlib import Path

from flask import Flask, jsonify

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from scripts.training_metrics import get_training_metrics

app = Flask(__name__)

@app.route("/training-metrics", methods=["GET"])
def training_metrics():
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")

    if not email or not password:
        return jsonify({
            "error": "GARMIN_EMAIL and GARMIN_PASSWORD must be set in environment variables",
        }), 400

    try:
        metrics = get_training_metrics(email=email, password=password)
        return jsonify(metrics)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
