#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from garminconnect import Garmin

garmin_client = None

def is_auth_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "401" in message or "403" in message or "unauthorized" in message or "forbidden" in message


def reset_garmin_client():
    global garmin_client
    garmin_client = None


def get_garmin_client(email: str, password: str) -> Garmin:
    global garmin_client
    if garmin_client is not None:
        return garmin_client
    client = Garmin(email=email, password=password)
    client.login()
    garmin_client = client
    return client


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    env = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            env[key] = value
    return env


def get_env_value(key: str) -> str | None:
    value = os.environ.get(key)
    if value:
        return value

    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    file_env = load_env_file(env_path)
    return file_env.get(key)


def extract_values(payload: dict | list | None, keys: list[str]) -> dict[str, object | None]:
    if payload is None:
        return {key: None for key in keys}

    if isinstance(payload, dict):
        return {key: payload.get(key) for key in keys}

    return {key: None for key in keys}


def normalize_date(date: datetime) -> str:
    return date.strftime("%Y-%m-%d")


def try_call(label: str, fn):
    try:
        return {"label": label, "data": fn(), "error": None}
    except Exception as exc:
        return {"label": label, "data": None, "error": str(exc)}


def get_training_metrics(email: str | None = None, password: str | None = None) -> dict[str, object | None]:
    if not email or not password:
        email = get_env_value("GARMIN_EMAIL")
        password = get_env_value("GARMIN_PASSWORD")

    if not email or not password:
        raise ValueError("Missing GARMIN_EMAIL or GARMIN_PASSWORD in environment or .env.local")

    client = get_garmin_client(email, password)

    def call_with_retry(fn):
        nonlocal client
        try:
            return fn()
        except Exception as exc:
            if is_auth_error(exc):
                reset_garmin_client()
                client = get_garmin_client(email, password)
                return fn()
            raise

    today = normalize_date(datetime.utcnow())

    results = {
        "date": today,
        "training_readiness": try_call("training_readiness", lambda: call_with_retry(lambda: client.get_training_readiness(today))),
        "training_status": try_call("training_status", lambda: call_with_retry(lambda: client.get_training_status(today))),
        "morning_training_readiness": try_call("morning_training_readiness", lambda: call_with_retry(lambda: client.get_morning_training_readiness(today))),
        "max_metrics": try_call("max_metrics", lambda: call_with_retry(lambda: client.get_max_metrics(today))),
    }

    candidate_endpoints = [
        f"/metrics-service/metrics/trainingload/{today}",
        f"/metrics-service/metrics/trainingload",
        f"/metrics-service/metrics/trainingstatus/aggregated/{today}",
        f"/metrics-service/metrics/trainingreadiness/{today}",
        f"/userprofile-service/userprofile/user-settings",
    ]

    raw_endpoints = {}
    for endpoint in candidate_endpoints:
        raw_endpoints[endpoint] = try_call(endpoint, lambda endpoint=endpoint: call_with_retry(lambda: client.connectapi(endpoint)))

    results["raw_endpoints"] = raw_endpoints

    extracted = {
        "training_status_fields": extract_values(results["training_status"]["data"], ["acuteLoad", "chronicLoad", "trainingLoad", "readiness"]),
        "training_readiness_fields": extract_values(results["training_readiness"]["data"], ["acuteLoad", "chronicLoad", "trainingLoad", "readiness"]),
        "morning_training_readiness_fields": extract_values(results["morning_training_readiness"]["data"], ["acuteLoad", "chronicLoad", "trainingLoad", "readiness"]),
    }
    results["extracted_fields"] = extracted

    return results


def main():
    try:
        metrics = get_training_metrics()
        print(json.dumps(metrics, indent=2, default=str))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
