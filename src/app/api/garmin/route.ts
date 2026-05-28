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

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

const getLastArrayItem = (value: unknown) => (Array.isArray(value) && value.length ? value[value.length - 1] : value);

const getNumberValue = (payload: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  const raw = getValue(payload, ...keys);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return null;
};

const extractSleep = (sleepData: unknown) => {
  if (!sleepData || typeof sleepData !== "object") {
    return {
      score: null,
      duration: null,
      quality: null,
      hrvValue: null,
      hrvStatus: null,
      bodyBatteryLatest: null,
      bodyBatteryChange: null,
      stressValue: null,
      raw: sleepData,
    };
  }

  const summary = (sleepData as Record<string, any>).dailySleepDTO ?? sleepData;
  const score =
    getNumberValue(summary as Record<string, any>, "sleepScore", "score", "sleepQualityScore", "sleepQuality") ??
    getNumberValue((summary as Record<string, any>).sleepScores?.overall as Record<string, any>, "value");
  const duration = getNumberValue(summary as Record<string, any>, "sleepTimeSeconds", "totalSleepDuration", "sleepDurationInSeconds");
  const quality = getNumberValue(summary as Record<string, any>, "sleepQualityScore", "sleepQuality");
  const hrvValue = getNumberValue(sleepData as Record<string, any>, "avgOvernightHrv", "avgHrv", "averageHrv");
  const hrvStatus = getValue(sleepData as Record<string, any>, "hrvStatus");

  const sleepBodyBattery = getLastArrayItem((sleepData as Record<string, any>).sleepBodyBattery);
  const bodyBatteryLatest = getNumberValue(sleepBodyBattery as Record<string, any>, "value", "battery", "bodyBattery");
  const bodyBatteryChange = getNumberValue(sleepData as Record<string, any>, "bodyBatteryChange", "bodyBatteryDelta");

  const sleepStress = getLastArrayItem((sleepData as Record<string, any>).sleepStress ?? (sleepData as Record<string, any>).stress ?? (sleepData as Record<string, any>).stressData);
  const stressValue = getNumberValue(sleepStress as Record<string, any>, "stressLevel", "value", "avgStress", "stress");

  return {
    score,
    duration,
    quality,
    hrvValue,
    hrvStatus,
    bodyBatteryLatest,
    bodyBatteryChange,
    stressValue,
    raw: sleepData,
  };
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

const safeFetch = async <T>(label: string, fetcher: () => Promise<T>) => {
  try {
    const data = await fetcher();
    return { data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[Garmin] ${label} failed: ${message}`);
    return { data: null, error: message };
  }
};

const extractBodyBattery = (bodyBatteryData: unknown, sleepPayload: ReturnType<typeof extractSleep>) => {
  if (!bodyBatteryData || typeof bodyBatteryData !== "object") {
    return sleepPayload.bodyBatteryLatest;
  }

  const lastEntry = getLastArrayItem(bodyBatteryData);
  const lastValue = getNumberValue(lastEntry as Record<string, any>, "value", "battery", "bodyBattery", "charged");
  if (lastValue != null) return lastValue;

  const statsList = getLastArrayItem(
    (bodyBatteryData as Record<string, any>).bodyBatteryStatList ??
      (bodyBatteryData as Record<string, any>).bodyBatteryStats ??
      (bodyBatteryData as Record<string, any>).statistics ??
      (bodyBatteryData as Record<string, any>).data
  );

  return getNumberValue(statsList as Record<string, any>, "value", "battery", "bodyBattery", "charged") ?? sleepPayload.bodyBatteryLatest;
};

const fetchBodyBatteryData = async (client: GarminConnect, today: Date, sevenDaysAgo: Date) => {
  const wellnessBase = ((client as any).url?.GC_API as string) ?? "https://connectapi.garmin.com";
  const rawClient: any = client as any;

  if (typeof rawClient.getBodyBattery === "function") {
    try {
      return await rawClient.getBodyBattery(today);
    } catch {
      try {
        return await rawClient.getBodyBattery(sevenDaysAgo, today);
      } catch (error) {
        console.warn("[Garmin] getBodyBattery fallback failed:", error);
      }
    }
  }

  try {
    return await rawClient.get(`${wellnessBase}/wellness-service/wellness/dailyBodyBattery`, {
      params: { date: toDateString(today) },
    });
  } catch (singleDateError) {
    console.warn("[Garmin] dailyBodyBattery single-date fetch failed:", singleDateError);
  }

  try {
    return await rawClient.get(`${wellnessBase}/wellness-service/wellness/dailyBodyBattery`, {
      params: { startDate: toDateString(sevenDaysAgo), endDate: toDateString(today) },
    });
  } catch (rangeError) {
    console.warn("[Garmin] dailyBodyBattery range fetch failed:", rangeError);
    throw rangeError;
  }
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
  const sevenDaysAgo = parseDate(7);

  const activitiesResult = await safeFetch("activities", () => client.getActivities(0, 30));
  const sleepResult = await safeFetch("sleepData", () => client.getSleepData(today));
  const bodyBatteryResult = await safeFetch("bodyBatteryData", () => fetchBodyBatteryData(client, today, sevenDaysAgo));
  const heartRateResult = await safeFetch("heartRateData", () => client.getHeartRate(today));

  const activities = (activitiesResult.data ?? []) as unknown[];
  const sleepData = sleepResult.data;
  const bodyBatteryData = bodyBatteryResult.data;
  const heartRateData = heartRateResult.data;

  console.log("[Garmin] raw sleepData:", sleepData);
  console.log("[Garmin] raw bodyBatteryData:", bodyBatteryData);

  const sleepPayload = extractSleep(sleepData);
  const heartRatePayload = extractHeartRate(heartRateData);
  const weeklySummaryPayload = extractWeeklySummary(activities);
  const lastActivity = Array.isArray(activities) && activities.length ? activities[0] : null;
  const hrZonesPayload = extractHRZones(lastActivity);

  const hrvValue = sleepPayload.hrvValue ?? null;
  const hrvStatus = sleepPayload.hrvStatus ?? null;
  const bodyBatteryLatest = extractBodyBattery(bodyBatteryData, sleepPayload);
  const bodyBatteryChange = sleepPayload.bodyBatteryChange ?? null;

  const stressValue = sleepPayload.stressValue ?? null;
  const stressMax = null;

  return {
    fetchedAt: new Date().toISOString().slice(0, 10),
    hrv: {
      value: hrvValue,
      status: hrvStatus,
      raw: sleepPayload.raw,
    },
    sleep: {
      score: sleepPayload.score,
      duration: sleepPayload.duration,
      quality: sleepPayload.quality,
      raw: sleepPayload.raw,
    },
    bodyBattery: {
      latest: bodyBatteryLatest,
      change: bodyBatteryChange,
      raw: bodyBatteryData,
    },
    stress: {
      value: stressValue,
      max: stressMax,
      raw: sleepPayload.raw,
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
