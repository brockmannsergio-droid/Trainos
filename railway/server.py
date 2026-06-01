import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request

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
        # Ensure trainingLoad is populated from nested trainingStatus.latestTrainingStatusData
        # Attempt to locate the trainingStatus payload in common places
        data_candidates = [
            metrics.get("training_status", {}).get("data"),
            metrics.get("trainingStatus"),
            metrics.get("training_status"),
            metrics.get("raw_endpoints"),
            metrics,
        ]
        data = None
        for c in data_candidates:
            if c:
                data = c
                break

        training_status = {}
        if isinstance(data, dict):
            training_status = data.get("trainingStatus", data)

        if isinstance(training_status, dict):
            latest = training_status.get("latestTrainingStatusData", {})
            if latest:
                # take first device entry
                vals = list(latest.values())
                device_data = vals[0] if vals else {}
                acute_dto = device_data.get("acuteTrainingLoadDTO", {}) if isinstance(device_data, dict) else {}
                acute = acute_dto.get("dailyTrainingLoadAcute")
                chronic = acute_dto.get("dailyTrainingLoadChronic")
                metrics["trainingLoad"] = {"acute": acute, "chronic": chronic}

        return jsonify(metrics)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


    @app.route("/send-workout", methods=["POST"])
    def send_workout():
        email = os.environ.get("GARMIN_EMAIL")
        password = os.environ.get("GARMIN_PASSWORD")

        if not email or not password:
            return jsonify({"error": "GARMIN_EMAIL and GARMIN_PASSWORD must be set in environment variables"}), 400

        payload = request.get_json(silent=True)
        if not payload:
            return jsonify({"error": "Invalid JSON payload"}), 400

        workout = payload.get("workout")
        date = payload.get("date")
        if not workout or not date:
            return jsonify({"error": "Missing workout or date"}), 400

        try:
            client = Garmin(email=email, password=password)
            client.login()
            # Expecting Garmin client to expose add_workout(workout, date)
            if not hasattr(client, 'add_workout'):
                return jsonify({"error": "Garmin client does not support add_workout on this environment"}), 500

            result = client.add_workout(workout, date)
            return jsonify({"ok": True, "result": result})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
