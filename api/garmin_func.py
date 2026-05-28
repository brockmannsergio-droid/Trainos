import json
import os
import sys

from scripts.garmin_fetch import fetch_garmin_data


def handler(request):
    """Vercel-compatible Python serverless function entry point.

    Returns a dict with `statusCode`, `headers`, and `body`.
    """
    try:
        # fetch_garmin_data reads credentials from the environment
        data = fetch_garmin_data()
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(data, default=str),
        }
    except Exception as exc:
        # Prefer returning structured error JSON so the Next.js proxy can surface it
        err = {"error": str(exc)}
        print(f"ERROR: {exc}", file=sys.stderr)
        return {"statusCode": 500, "headers": {"Content-Type": "application/json"}, "body": json.dumps(err)}
