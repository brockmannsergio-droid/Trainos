#!/usr/bin/env python3
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from garminconnect import Garmin
from garminconnect import GarminConnectAuthenticationError, GarminConnectConnectionError

ROOT_DIR = Path(__file__).resolve().parent.parent
DOTENV_PATH = ROOT_DIR / ".env.local"


def load_dotenv_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        env[key.strip()] = value.strip()
    return env


def get_date_string(days_ago: int = 0) -> str:
    return (date.today() - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def get_credentials() -> tuple[str | None, str | None]:
    username = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")

    if username and password:
        return username, password

    dotenv_values = load_dotenv_file(DOTENV_PATH)
    return dotenv_values.get("GARMIN_EMAIL"), dotenv_values.get("GARMIN_PASSWORD")


def get_value(payload: object | None, *keys: str):
    if not isinstance(payload, dict):
        return None

    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value

    return None


def safe_get(client: Garmin, method_name: str, *args):
    method = getattr(client, method_name, None)
    if not callable(method):
        return None
    try:
        return method(*args)
    except Exception as exc:
        print(f"DEBUG: {method_name} failed: {exc}", file=sys.stderr)
        return None


def extract_hrv(hrv_data: object | None) -> dict[str, object | None]:
    if not isinstance(hrv_data, dict):
        return {"value": None, "status": None}

    summary = hrv_data.get("hrvSummary") if isinstance(hrv_data.get("hrvSummary"), dict) else hrv_data
    if not isinstance(summary, dict):
        return {"value": None, "status": None}

    value = summary.get("lastNightAvg") or summary.get("avgOvernightHrv") or summary.get("averageOvernightHrv")
    status = summary.get("status") or summary.get("hrvStatus")
    return {"value": value, "status": status}


def extract_sleep(sleep_data: object | None) -> dict[str, object | None]:
    if isinstance(sleep_data, list) and sleep_data:
        sleep_data = sleep_data[0]

    if not isinstance(sleep_data, dict):
        return {"score": None, "duration": None, "quality": None}

    sleep_summary = sleep_data.get("sleepSummary")
    if isinstance(sleep_summary, dict):
        summary = sleep_summary
    elif isinstance(sleep_data.get("dailySleepDTO"), dict):
        summary = sleep_data["dailySleepDTO"]
    else:
        summary = sleep_data

    if not isinstance(summary, dict):
        return {"score": None, "duration": None, "quality": None}

    score = (
        summary.get("sleepScore")
        or summary.get("score")
        or (summary.get("sleepScores") or {}).get("overall", {}).get("value")
    )
    duration = (
        summary.get("totalSleepDuration")
        or summary.get("sleepDurationInSeconds")
        or summary.get("sleepTimeSeconds")
        or summary.get("sleepTimeSeconds")
    )
    quality = summary.get("sleepQualityScore") or summary.get("sleepQuality") or (
        (summary.get("sleepScores") or {}).get("overall", {}).get("value")
    )
    return {"score": score, "duration": duration, "quality": quality}


def extract_body_battery(body_battery_data: object | None) -> dict[str, object | None]:
    if not isinstance(body_battery_data, list) or not body_battery_data:
        return {"latest": None, "raw": body_battery_data}

    latest_day = body_battery_data[-1]
    latest_value = None

    if isinstance(latest_day, dict):
        values = latest_day.get("bodyBatteryValuesArray") or latest_day.get("bodyBatteryValues")
        if isinstance(values, list) and values:
            last_entry = values[-1]
            if isinstance(last_entry, list) and len(last_entry) >= 2:
                latest_value = last_entry[1]

    latest = {"bodyBatteryLevel": latest_value, **(latest_day if isinstance(latest_day, dict) else {})}
    return {"latest": latest, "raw": body_battery_data}


def extract_stress(stress_data: object | None) -> dict[str, object | None]:
    if not isinstance(stress_data, dict):
        return {"value": None, "max": None}

    summary = stress_data.get("stressSummary") if isinstance(stress_data.get("stressSummary"), dict) else stress_data
    if not isinstance(summary, dict):
        return {"value": None, "max": None}

    value = summary.get("avgStressLevel") or summary.get("averageStressLevel") or summary.get("averageStress")
    max_value = summary.get("maxStressLevel") or summary.get("maximumStressLevel")
    return {"value": value, "max": max_value}


def extract_resting_heart_rate(rhr_data: object | None) -> dict[str, object | None]:
    if not isinstance(rhr_data, dict):
        return {"value": None, "available": False, "raw": rhr_data}

    value = get_value(
        rhr_data,
        "restingHeartRate",
        "restingHr",
        "restingHeartRateValue",
        "lastRestingHeartRate",
        "resting",
        "lastRecordedRhr",
    )
    available = value is not None
    return {"value": value, "available": available, "raw": rhr_data}


def extract_vo2max(max_metrics: object | None) -> dict[str, object | None]:
    if not isinstance(max_metrics, dict):
        return {"value": None, "trend": None, "available": False, "raw": max_metrics}

    value = get_value(
        max_metrics,
        "vo2Max",
        "VO2Max",
        "vo2max",
        "vo2MaxEstimate",
        "vo2MaxValue",
        "vo2Estimate",
        "vo2Capability",
    )
    trend = get_value(max_metrics, "vo2MaxTrend", "trend", "vo2Trend", "rangeChange", "vo2Status")
    available = value is not None
    return {"value": value, "trend": trend, "available": available, "raw": max_metrics}


def extract_training_readiness(readiness_data: object | None) -> dict[str, object | None]:
    if not isinstance(readiness_data, dict):
        return {"score": None, "status": None, "available": False, "raw": readiness_data}

    score = get_value(
        readiness_data,
        "trainingReadiness",
        "trainingReadinessScore",
        "readinessScore",
        "score",
        "readinesScore",
    )
    status = get_value(readiness_data, "readinessStatus", "status", "readinessLevel", "trainingStatus")
    available = score is not None or status is not None
    return {"score": score, "status": status, "available": available, "raw": readiness_data}


def extract_training_load(load_data: object | None) -> dict[str, object | None]:
    if not isinstance(load_data, dict):
        return {"current": None, "weekly": None, "trend": None, "available": False, "raw": load_data}

    current = get_value(load_data, "trainingLoad", "dailyLoad", "currentLoad", "current", "acuteLoadRating")
    weekly = get_value(
        load_data,
        "weeklyLoad",
        "trainingLoadWeek",
        "load7Day",
        "sevenDayLoad",
        "trainingLoadWeekly",
        "chronicalLoadRating",
    )
    trend = get_value(load_data, "trainingLoadTrend", "trend", "loadTrend", "trainingTrend", "loadChange")
    available = current is not None or weekly is not None
    return {"current": current, "weekly": weekly, "trend": trend, "available": available, "raw": load_data}


def extract_activity_hr_zones(activity_data: object | None) -> list[dict[str, object | None]]:
    if not isinstance(activity_data, dict):
        return []

    zone_keys = [
        "heartRateZones",
        "heartRateZoneDTOs",
        "heartRateZoneSummary",
        "heartRateZoneValues",
        "hrZoneData",
        "heartRateZoneList",
        "heartRateZoneBeans",
        "heartRateZoneStats",
    ]

    for key in zone_keys:
        zones = activity_data.get(key)
        if isinstance(zones, list) and zones:
            extracted = []
            for zone in zones:
                if not isinstance(zone, dict):
                    continue

                label = get_value(zone, "zoneName", "name", "label", "zone", "heartRateZone")
                lower = get_value(zone, "minValue", "minHeartRate", "lowHeartRate", "lowerBound")
                upper = get_value(zone, "maxValue", "maxHeartRate", "highHeartRate", "upperBound")
                time = get_value(zone, "minutes", "duration", "time", "timeInSeconds", "seconds")
                extracted.append({"label": label, "min": lower, "max": upper, "time": time, "raw": zone})
            if extracted:
                return extracted

    return []


def parse_activity_date(activity: object | None) -> date | None:
    if not isinstance(activity, dict):
        return None

    date_keys = ["startTimeLocal", "beginTimestamp", "activityDateLocal", "startTimeGMT", "startTime"]
    for key in date_keys:
        raw_value = activity.get(key)
        if isinstance(raw_value, str):
            try:
                if raw_value.endswith("Z"):
                    raw_value = raw_value[:-1] + "+00:00"
                dt = date.fromisoformat(raw_value[:10]) if len(raw_value) >= 10 else None
                if dt:
                    return dt
            except ValueError:
                pass
        if isinstance(raw_value, (int, float)):
            timestamp = int(raw_value)
            if timestamp > 1e12:
                timestamp //= 1000
            try:
                return date.fromtimestamp(timestamp)
            except Exception:
                pass

    return None


def extract_weekly_summary(activities_data: object | None) -> dict[str, object | None]:
    if not isinstance(activities_data, list):
        return {"totalDistance": None, "totalTime": None, "totalElevation": None, "raw": activities_data}

    now = date.today()
    cutoff = now - timedelta(days=6)
    total_distance = 0.0
    total_time = 0.0
    total_elevation = 0.0
    found = False

    for activity in activities_data:
        if not isinstance(activity, dict):
            continue

        activity_date = parse_activity_date(activity)
        if not activity_date or activity_date < cutoff or activity_date > now:
            continue

        found = True
        distance = get_value(activity, "distance", "distanceMeters", "totalDistance")
        if isinstance(distance, (int, float)):
            total_distance += float(distance)

        duration = get_value(activity, "duration", "elapsedDuration", "activeDuration")
        if isinstance(duration, (int, float)):
            total_time += float(duration)

        elevation = get_value(activity, "elevationGain", "totalElevationGain", "climbElevation", "gainElevation")
        if isinstance(elevation, (int, float)):
            total_elevation += float(elevation)

    return {
        "totalDistance": total_distance if found else None,
        "totalTime": total_time if found else None,
        "totalElevation": total_elevation if found else None,
        "raw": activities_data,
    }


def compute_trend_indicator(current_vo2: object | None, current_load: object | None, prior_vo2: object | None, prior_load: object | None) -> str:
    def to_number(value):
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None
        return None

    vo2_now = to_number(current_vo2)
    load_now = to_number(current_load)
    vo2_prev = to_number(prior_vo2)
    load_prev = to_number(prior_load)

    if vo2_now is None and load_now is None:
        return "Maintaining"

    vo2_delta = vo2_now - vo2_prev if vo2_now is not None and vo2_prev is not None else 0
    load_delta = load_now - load_prev if load_now is not None and load_prev is not None else 0

    if vo2_delta > 0.5 or load_delta > 5:
        return "Improving"
    if vo2_delta < -0.5 or load_delta < -5:
        return "Declining"
    return "Maintaining"


def main() -> int:
    username, password = get_credentials()
    if not username or not password:
        print(
            json.dumps(
                {
                    "error": "Missing Garmin credentials. Set GARMIN_EMAIL and GARMIN_PASSWORD in .env.local or export them as environment variables."
                }
            ),
            file=sys.stderr,
        )
        return 1

    try:
        client = Garmin(username, password)
        client.login()

        end_date = date.today()
        start_date = end_date - timedelta(days=6)

        hrv_data = client.get_hrv_data(get_date_string(0))
        sleep_data = client.get_sleep_data(get_date_string(0))
        stress_data = client.get_stress_data(get_date_string(0))
        body_battery_data = client.get_body_battery(
            start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")
        )
        activities = client.get_activities(start=0, limit=30)
        
        # Try multiple fallback methods for each metric
        resting_hr_data = safe_get(client, "get_resting_heart_rate", get_date_string(0))
        if not resting_hr_data:
            print("DEBUG: get_resting_heart_rate returned None, trying get_heart_rates", file=sys.stderr)
            resting_hr_data = safe_get(client, "get_heart_rates", get_date_string(0))
        
        vo2max_data = safe_get(client, "get_max_metrics", get_date_string(0))
        if not vo2max_data:
            print("DEBUG: get_max_metrics returned None, trying get_fitnessAge", file=sys.stderr)
            vo2max_data = safe_get(client, "get_fitnessAge", get_date_string(0))
        
        training_readiness_data = safe_get(client, "get_training_readiness", get_date_string(0))
        training_load_data = safe_get(client, "get_training_load", get_date_string(0))
        prior_vo2max_data = safe_get(client, "get_max_metrics", get_date_string(7))
        if not prior_vo2max_data:
            print("DEBUG: prior get_max_metrics returned None, trying get_fitnessAge", file=sys.stderr)
            prior_vo2max_data = safe_get(client, "get_fitnessAge", get_date_string(7))
        prior_training_load_data = safe_get(client, "get_training_load", get_date_string(7))

        # Comprehensive debug logging
        print(f"DEBUG: [HRV] {json.dumps(hrv_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [Sleep] {json.dumps(sleep_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [Stress] {json.dumps(stress_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [BodyBattery] {json.dumps(body_battery_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [RestingHR] {json.dumps(resting_hr_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [VO2max] {json.dumps(vo2max_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [TrainingReadiness] {json.dumps(training_readiness_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [TrainingLoad] {json.dumps(training_load_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [PriorVO2max] {json.dumps(prior_vo2max_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [PriorTrainingLoad] {json.dumps(prior_training_load_data, default=str)[:500]}", file=sys.stderr)
        print(f"DEBUG: [Activities] Fetched {len(activities) if isinstance(activities, list) else 0} activities", file=sys.stderr)

        hrv_payload = extract_hrv(hrv_data)
        sleep_payload = extract_sleep(sleep_data)
        body_battery_payload = extract_body_battery(body_battery_data)
        stress_payload = extract_stress(stress_data)
        resting_hr_payload = extract_resting_heart_rate(resting_hr_data)
        vo2max_payload = extract_vo2max(vo2max_data)
        training_readiness_payload = extract_training_readiness(training_readiness_data)
        training_load_payload = extract_training_load(training_load_data)
        prior_vo2max_payload = extract_vo2max(prior_vo2max_data)
        prior_training_load_payload = extract_training_load(prior_training_load_data)
        last_activity = activities[0] if isinstance(activities, list) and activities else None
        hr_zones_payload = extract_activity_hr_zones(last_activity)
        weekly_summary_payload = extract_weekly_summary(activities)
        trend = compute_trend_indicator(vo2max_payload.get("value"), training_load_payload.get("weekly"), prior_vo2max_payload.get("value"), prior_training_load_payload.get("weekly"))

        output = {
            "fetchedAt": date.today().isoformat(),
            "hrv": {
                "value": hrv_payload["value"],
                "status": hrv_payload["status"],
                "raw": hrv_data,
            },
            "sleep": {
                "score": sleep_payload["score"],
                "duration": sleep_payload["duration"],
                "quality": sleep_payload["quality"],
                "raw": sleep_data,
            },
            "bodyBattery": {
                "latest": body_battery_payload["latest"],
                "raw": body_battery_data,
            },
            "stress": {
                "value": stress_payload["value"],
                "max": stress_payload["max"],
                "raw": stress_data,
            },
            "restingHeartRate": {
                "value": resting_hr_payload["value"],
                "available": resting_hr_payload["available"],
                "raw": resting_hr_data,
            },
            "vo2Max": {
                "value": vo2max_payload["value"],
                "trend": vo2max_payload["trend"],
                "available": vo2max_payload["available"],
                "raw": vo2max_data,
            },
            "trainingReadiness": {
                "score": training_readiness_payload["score"],
                "status": training_readiness_payload["status"],
                "available": training_readiness_payload["available"],
                "raw": training_readiness_data,
            },
            "trainingLoad": {
                "current": training_load_payload["current"],
                "weekly": training_load_payload["weekly"],
                "trend": training_load_payload["trend"],
                "available": training_load_payload["available"],
                "raw": training_load_data,
            },
            "weeklySummary": {
                "totalDistance": weekly_summary_payload["totalDistance"],
                "totalTime": weekly_summary_payload["totalTime"],
                "totalElevation": weekly_summary_payload["totalElevation"],
                "raw": weekly_summary_payload["raw"],
            },
            "trendIndicator": trend,
            "heartRateZones": hr_zones_payload,
            "activities": activities,
        }

        print(json.dumps(output, default=str))
        return 0

    except GarminConnectAuthenticationError as auth_exc:
        print(json.dumps({"error": "Authentication failed: " + str(auth_exc)}), file=sys.stderr)
        return 1
    except GarminConnectConnectionError as conn_exc:
        print(json.dumps({"error": "Connection failed: " + str(conn_exc)}), file=sys.stderr)
        return 1
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
