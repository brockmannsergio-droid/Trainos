import { NextResponse } from "next/server";
import { GarminConnect } from "garmin-connect";

const getValue = (payload: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const parseDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const extractSleep = (sleepData: unknown) => {
  if (!sleepData || typeof sleepData !== "object") {
    return { score: null, duration: null, quality: null, raw: sleepData };
  }

  const summary = (sleepData as Record<string, any>).dailySleepDTO ?? sleepData;
  const score = getValue(summary, "sleepScore", "score", "sleepQualityScore", "sleepQuality");
  const duration = getValue(summary, "sleepTimeSeconds", "totalSleepDuration", "sleepDurationInSeconds");
  const quality = getValue(summary, "sleepQualityScore", "sleepQuality");

  return { score, duration, quality, raw: sleepData };
};

const extractHeartRate = (heartRateData: unknown) => {
  if (!heartRateData || typeof heartRateData !== "object") {
    return { value: null, raw: heartRateData };
  }

  const resting = getValue(heartRateData as Record<string, any>, "restingHeartRate", "restingHr", "restingHeartRateValue", "resting");
  return { value: resting, raw: heartRateData };
};

const extractWeeklySummary = (activities: unknown[]) => {
  if (!Array.isArray(activities)) {
    return { totalDistance: null, totalTime: null, totalElevation: null, raw: activities };
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const summary = activities.reduce(
    (acc: { totalDistance: number; totalTime: number; totalElevation: number }, activity) => {
      if (!activity || typeof activity !== "object") return acc;
      const startTime = new Date((activity as Record<string, any>).startTimeLocal ?? (activity as Record<string, any>).startTime ?? "");
      if (Number.isNaN(startTime.getTime()) || startTime < sevenDaysAgo) return acc;

      const distance = Number((activity as Record<string, any>).distance ?? (activity as Record<string, any>).totalDistance ?? 0);
      const duration = Number((activity as Record<string, any>).duration ?? (activity as Record<string, any>).elapsedDuration ?? (activity as Record<string, any>).activeDuration ?? 0);
      const elevation = Number((activity as Record<string, any>).elevationGain ?? (activity as Record<string, any>).totalElevationGain ?? (activity as Record<string, any>).climbElevation ?? 0);

      return {
        totalDistance: acc.totalDistance + (Number.isNaN(distance) ? 0 : distance),
        totalTime: acc.totalTime + (Number.isNaN(duration) ? 0 : duration),
        totalElevation: acc.totalElevation + (Number.isNaN(elevation) ? 0 : elevation),
      };
    },
    { totalDistance: 0, totalTime: 0, totalElevation: 0 }
  );

  return { ...summary, raw: activities };
};

const extractHRZones = (activity: unknown) => {
  if (!activity || typeof activity !== "object") return [];
  const activityObj = activity as Record<string, any>;
  const zones =
    activityObj.heartRateZones ??
    activityObj.heartRateZoneDTOs ??
    activityObj.heartRateZoneDistribution ??
    [];

  if (!Array.isArray(zones)) return [];

  return zones.map((zone) => {
    if (!zone || typeof zone !== "object") return null;
    return {
      label: getValue(zone as Record<string, any>, "name", "label", "zoneName") ?? null,
      min: getValue(zone as Record<string, any>, "min", "lowerBound", "from") ?? null,
      max: getValue(zone as Record<string, any>, "max", "upperBound", "to") ?? null,
      time: getValue(zone as Record<string, any>, "seconds", "duration", "time") ?? null,
      raw: zone,
    };
  }).filter((zone) => zone !== null) as Array<Record<string, unknown>>;
};

const fetchGarminData = async () => {
  const username = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing Garmin credentials. Set GARMIN_EMAIL and GARMIN_PASSWORD in Vercel environment variables.");
  }

  const client = new GarminConnect({ username, password });
  await client.login();

  const today = parseDate(0);
  const activities = (await client.getActivities(0, 30)) ?? [];
  const sleepData = await client.getSleepData(today);
  const heartRateData = await client.getHeartRate(today);

  const sleepPayload = extractSleep(sleepData);
  const heartRatePayload = extractHeartRate(heartRateData);
  const weeklySummaryPayload = extractWeeklySummary(activities);
  const lastActivity = Array.isArray(activities) && activities.length ? activities[0] : null;
  const hrZonesPayload = extractHRZones(lastActivity);

  return {
    fetchedAt: new Date().toISOString().slice(0, 10),
    hrv: {
      value: null,
      status: null,
      raw: null,
    },
    sleep: {
      score: sleepPayload.score,
      duration: sleepPayload.duration,
      quality: sleepPayload.quality,
      raw: sleepPayload.raw,
    },
    bodyBattery: {
      latest: null,
      raw: null,
    },
    stress: {
      value: null,
      max: null,
      raw: null,
    },
    restingHeartRate: {
      value: heartRatePayload.value,
      available: heartRatePayload.value != null,
      raw: heartRateData,
    },
    vo2Max: {
      value: null,
      trend: null,
      available: false,
      raw: null,
    },
    trainingReadiness: {
      score: null,
      status: null,
      available: false,
      raw: null,
    },
    trainingLoad: {
      current: null,
      weekly: null,
      trend: null,
      available: false,
      raw: null,
    },
    weeklySummary: {
      totalDistance: weeklySummaryPayload.totalDistance,
      totalTime: weeklySummaryPayload.totalTime,
      totalElevation: weeklySummaryPayload.totalElevation,
      raw: weeklySummaryPayload.raw,
    },
    trendIndicator: null,
    heartRateZones: hrZonesPayload,
    activities,
  };
};

export async function GET() {
  try {
    const data = await fetchGarminData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Garmin fetch error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
