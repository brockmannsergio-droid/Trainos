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

const isValidResponse = (response: unknown) => {
  if (response === null || response === undefined) return false;
  if (Array.isArray(response)) return response.length > 0;
  if (typeof response === "object") return Object.keys(response as Record<string, unknown>).length > 0;
  return true;
};

const fetchTrainingMetrics = async () => {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const url = `${baseUrl}/api/garmin/training`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Training metrics fetch failed with ${response.status}`);
  }
  return await response.json();
};

const extractLatestResponseValue = (response: unknown, ...keys: string[]) => {
  if (Array.isArray(response)) {
    return getNumberValue(getLastArrayItem(response) as Record<string, any>, ...keys);
  }
  return getNumberValue(response as Record<string, any>, ...keys);
};

const extractLatestResponseField = (response: unknown, ...keys: string[]) => {
  if (Array.isArray(response)) {
    return getValue(getLastArrayItem(response) as Record<string, any>, ...keys);
  }
  return getValue(response as Record<string, any>, ...keys);
};

const getEntryTimestamp = (entry: Record<string, any>) => {
  const raw = getValue(entry, "startGMT", "timestamp", "time", "dateTime", "startTime");
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const getLatestBodyBatteryEntry = (entries: unknown[]) => {
  const validEntries = entries.filter((entry) => entry && typeof entry === "object") as Record<string, any>[];
  if (!validEntries.length) return null;
  return validEntries.reduce((latest, current) => {
    if (!latest) return current;
    const latestTs = getEntryTimestamp(latest);
    const currentTs = getEntryTimestamp(current);
    return currentTs >= latestTs ? current : latest;
  }, null as Record<string, any> | null);
};

const getBodyBatteryArray = (bodyBatteryData: unknown): unknown[] | null => {
  if (Array.isArray(bodyBatteryData) && bodyBatteryData.length) return bodyBatteryData;
  if (!bodyBatteryData || typeof bodyBatteryData !== "object") return null;

  const data = bodyBatteryData as Record<string, any>;
  const candidates = [
    data.bodyBattery,
    data.bodyBatteryTimeline,
    data.bodyBatteryList,
    data.bodyBatteryStatList,
    data.bodyBatteryEntries,
    data.dailyBodyBattery,
    data.data,
    data.series,
    data.bodyBatteryData,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }

  if (data.startGMT || data.timestamp || data.time || data.dateTime || data.startTime) {
    return [data];
  }

  return null;
};

const extractBodyBattery = (bodyBatteryData: unknown, sleepPayload: ReturnType<typeof extractSleep>) => {
  const bodyBatteryArray = getBodyBatteryArray(bodyBatteryData);
  if (bodyBatteryArray) {
    const latestEntry = getLatestBodyBatteryEntry(bodyBatteryArray);
    const latestValue = extractLatestResponseValue(latestEntry, "value", "battery", "bodyBattery", "bodyBatteryLevel", "charged");
    if (latestValue != null) return latestValue;
  }

  return sleepPayload.bodyBatteryLatest;
};

const tryClientMethods = async (client: GarminConnect, label: string, methods: Array<{ name: string; args: unknown[] }>) => {
  const rawClient: any = client as any;
  for (const method of methods) {
    const fn = rawClient[method.name];
    if (typeof fn !== "function") continue;

    try {
      const result = await fn.apply(rawClient, method.args);
      console.log(`[Garmin] ${label} ${method.name} returned:`, result);
      if (isValidResponse(result)) return result;
    } catch (error) {
      console.warn(`[Garmin] ${label} ${method.name} failed:`, error);
    }
  }
  return null;
};

const tryRawEndpoints = async (client: GarminConnect, label: string, endpoints: string[], params: Record<string, string>) => {
  const rawClient: any = client as any;
  const wellnessBase = ((client as any).url?.GC_API as string) ?? "https://connectapi.garmin.com";

  for (const endpoint of endpoints) {
    const url = endpoint.startsWith("http") ? endpoint : `${wellnessBase}${endpoint}`;
    try {
      const result = await rawClient.get(url, { params });
      console.log(`[Garmin] ${label} raw endpoint ${url} returned:`, result);
      if (isValidResponse(result)) return result;
    } catch (error) {
      console.warn(`[Garmin] ${label} raw endpoint ${url} failed:`, error);
    }
  }
  return null;
};

const fetchBodyBatteryData = async (client: GarminConnect, today: Date, sevenDaysAgo: Date) => {
  const methodResult = await tryClientMethods(client, "bodyBattery", [
    { name: "getBodyBattery", args: [sevenDaysAgo, today] },
    { name: "getBodyBattery", args: [today] },
    { name: "getDailyStats", args: [today] },
    { name: "getWellnessData", args: [today] },
  ]);
  if (methodResult != null) return methodResult;

  const endpoints = [
    "/wellness-service/wellness/dailyBodyBattery",
    "/wellness-service/wellness/dailyWellness",
    "/wellness-service/wellness/dailyWellnessData",
    "/wellness-service/wellness/dailyBodyBatteryForDate",
  ];

  const rawResult = await tryRawEndpoints(client, "bodyBattery", endpoints, {
    date: toDateString(today),
    startDate: toDateString(sevenDaysAgo),
    endDate: toDateString(today),
  });
  return rawResult;
};

const fetchVo2MaxData = async (client: GarminConnect, today: Date) => {
  const methodResult = await tryClientMethods(client, "vo2Max", [
    { name: "getMaxMetrics", args: [today] },
    { name: "getVO2MaxTracking", args: [] },
    { name: "getPerformanceMetrics", args: [today] },
    { name: "getUserSettings", args: [] },
  ]);
  if (methodResult != null) return methodResult;

  const endpoints = [
    "/wellness-service/wellness/dailyVO2Max",
    "/wellness-service/wellness/maxMetrics",
    "/wellness-service/wellness/performanceMetrics",
    "/wellness-service/wellness/dailyPerformance",
  ];

  return await tryRawEndpoints(client, "vo2Max", endpoints, { date: toDateString(today) });
};

const fetchTrainingReadinessData = async (client: GarminConnect, today: Date) => {
  const methodResult = await tryClientMethods(client, "trainingReadiness", [
    { name: "getTrainingReadiness", args: [today] },
    { name: "getTrainingStatus", args: [today] },
  ]);
  if (methodResult != null) return methodResult;

  const endpoints = [
    "/wellness-service/wellness/trainingReadiness",
    "/wellness-service/wellness/trainingStatus",
    "/wellness-service/wellness/dailyTrainingStatus",
  ];

  return await tryRawEndpoints(client, "trainingReadiness", endpoints, { date: toDateString(today) });
};

const fetchTrainingLoadData = async (client: GarminConnect, today: Date) => {
  const methodResult = await tryClientMethods(client, "trainingLoad", [
    { name: "getTrainingLoad", args: [today] },
    { name: "getTrainingStatus", args: [today] },
  ]);
  if (methodResult != null) return methodResult;

  const endpoints = [
    "/wellness-service/wellness/trainingLoad",
    "/wellness-service/wellness/dailyTrainingLoad",
    "/wellness-service/wellness/trainingStatus",
  ];

  return await tryRawEndpoints(client, "trainingLoad", endpoints, { date: toDateString(today) });
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
  const vo2MaxResult = await safeFetch("vo2MaxData", () => fetchVo2MaxData(client, today));
  const trainingReadinessResult = await safeFetch("trainingReadinessData", () => fetchTrainingReadinessData(client, today));
  const trainingLoadResult = await safeFetch("trainingLoadData", () => fetchTrainingLoadData(client, today));
  const trainingMetricsResult = await safeFetch("trainingMetricsData", () => fetchTrainingMetrics());
  const heartRateResult = await safeFetch("heartRateData", () => client.getHeartRate(today));

  const activities = (activitiesResult.data ?? []) as unknown[];
  const sleepData = sleepResult.data;
  const bodyBatteryData = bodyBatteryResult.data;
  const vo2MaxData = vo2MaxResult.data;
  const trainingReadinessData = trainingMetricsResult.data?.training_readiness?.data ?? trainingReadinessResult.data;
  const trainingLoadData = trainingMetricsResult.data?.training_status?.data ?? trainingLoadResult.data;
  const trainingMetricsRaw = trainingMetricsResult.data ?? null;
  const heartRateData = heartRateResult.data;

  console.log("[Garmin] raw sleepData:", sleepData);
  console.log("[Garmin] raw bodyBatteryData:", bodyBatteryData);
  console.log("[Garmin] raw vo2MaxData:", vo2MaxData);
  console.log("[Garmin] raw trainingReadinessData:", trainingReadinessData);
  console.log("[Garmin] raw trainingLoadData:", trainingLoadData);

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

  const vo2MaxRunning =
    getNumberValue((vo2MaxData as Record<string, any>)?.userData, "vo2MaxRunning") ??
    getNumberValue(vo2MaxData as Record<string, any>, "vo2MaxRunning");
  const vo2MaxCycling =
    getNumberValue((vo2MaxData as Record<string, any>)?.userData, "vo2MaxCycling") ??
    getNumberValue(vo2MaxData as Record<string, any>, "vo2MaxCycling");
  const vo2MaxValue =
    extractLatestResponseValue(vo2MaxData, "value", "vo2Max", "vo2MaxValue", "maxVo2", "vo2") ??
    vo2MaxRunning ??
    vo2MaxCycling;
  const vo2MaxTrend = getValue(vo2MaxData as Record<string, any>, "trend", "trendDirection", "status");
  const vo2MaxAvailable = vo2MaxValue != null;

  const trainingReadinessScore = extractLatestResponseValue(trainingReadinessData, "score", "trainingReadiness", "value", "readiness");
  const trainingReadinessStatus = extractLatestResponseField(trainingReadinessData, "level", "status", "trainingStatus", "readinessStatus", "state");
  const trainingReadinessAvailable = trainingReadinessScore != null || trainingReadinessStatus != null;

  const firstTrainingStatusData = (trainingLoadData as Record<string, any>)?.mostRecentTrainingStatus?.latestTrainingStatusData;
  const trainingStatusDevice = firstTrainingStatusData && typeof firstTrainingStatusData === "object" ? Object.values(firstTrainingStatusData)[0] : null;
  const acuteTrainingLoadSource = (trainingStatusDevice as Record<string, any>)?.acuteTrainingLoadDTO ?? trainingStatusDevice;
  const trainingLoadAcute = getNumberValue(acuteTrainingLoadSource as Record<string, any>, "dailyTrainingLoadAcute", "acuteLoad", "trainingLoad", "load", "dailyTrainingLoad");
  const trainingLoadChronic = getNumberValue(acuteTrainingLoadSource as Record<string, any>, "dailyTrainingLoadChronic", "chronicLoad", "maxTrainingLoadChronic", "dailyTrainingLoadChronic");
  const trainingLoadWeekly = getNumberValue(trainingStatusDevice as Record<string, any>, "weeklyTrainingLoad", "weeklyLoad", "loadWeekly", "weekLoad");
  const trainingLoadTrend = getValue(trainingLoadData as Record<string, any>, "trend", "trendDirection", "status");
  const trainingLoadAvailable = trainingLoadAcute != null || trainingLoadChronic != null || trainingLoadWeekly != null;

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
      value: vo2MaxValue,
      trend: vo2MaxTrend ?? null,
      available: vo2MaxAvailable,
      raw: vo2MaxData,
    },
    vo2MaxRunning: {
      value: vo2MaxRunning,
      available: vo2MaxRunning != null,
      raw: vo2MaxData,
    },
    vo2MaxCycling: {
      value: vo2MaxCycling,
      available: vo2MaxCycling != null,
      raw: vo2MaxData,
    },
    trainingReadiness: {
      score: trainingReadinessScore,
      status: trainingReadinessStatus ?? null,
      available: trainingReadinessAvailable,
      raw: trainingMetricsRaw ?? trainingReadinessData,
    },
    trainingLoad: {
      acute: trainingLoadAcute,
      chronic: trainingLoadChronic,
      weekly: trainingLoadWeekly,
      trend: trainingLoadTrend ?? null,
      available: trainingLoadAvailable,
      raw: trainingMetricsRaw ?? trainingLoadData,
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
