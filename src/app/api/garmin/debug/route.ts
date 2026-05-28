import { NextResponse } from "next/server";
import { GarminConnect } from "garmin-connect";

const parseDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

const safeCall = async (label: string, fn: () => Promise<unknown>) => {
  try {
    const result = await fn();
    return { label, result, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { label, result: null, error: message };
  }
};

const fetchRawEndpointResponses = async (client: GarminConnect, endpoints: string[], params: Record<string, string>) => {
  const rawClient: any = client as any;
  const wellnessBase = ((client as any).url?.GC_API as string) ?? "https://connectapi.garmin.com";
  const results: Record<string, { result: unknown | null; error: string | null }> = {};

  for (const endpoint of endpoints) {
    const url = endpoint.startsWith("http") ? endpoint : `${wellnessBase}${endpoint}`;
    try {
      const result = await rawClient.get(url, { params });
      results[endpoint] = { result, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results[endpoint] = { result: null, error: message };
    }
  }

  return results;
};

const findKeyMatches = (value: unknown, patterns: string[], path = ""): Array<{ path: string; value: unknown }> => {
  const results: Array<{ path: string; value: unknown }> = [];
  const lowerPatterns = patterns.map((pattern) => pattern.toLowerCase());

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      results.push(...findKeyMatches(item, patterns, `${path}[${index}]`));
    });
    return results;
  }

  if (value && typeof value === "object") {
    for (const [key, subValue] of Object.entries(value as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();
      if (lowerPatterns.some((pattern) => lowerKey.includes(pattern))) {
        results.push({ path: currentPath, value: subValue });
      }
      results.push(...findKeyMatches(subValue, patterns, currentPath));
    }
  }

  return results;
};

export async function GET() {
  const username = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Missing Garmin credentials. Set GARMIN_EMAIL and GARMIN_PASSWORD." },
      { status: 500 }
    );
  }

  const client = new GarminConnect({ username, password });

  try {
    await client.login();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Garmin login failed.", loginError: message },
      { status: 500 }
    );
  }

  const today = parseDate(0);
  const sevenDaysAgo = parseDate(7);
  const rawClient: any = client;

  const responses = {
    getBodyBattery: await safeCall("getBodyBattery", async () => {
      if (typeof rawClient.getBodyBattery === "function") {
        return await rawClient.getBodyBattery(sevenDaysAgo, today);
      }
      throw new Error("getBodyBattery method not available");
    }),
    getHrvData: await safeCall("getHrvData", async () => {
      if (typeof rawClient.getHrvData === "function") {
        return await rawClient.getHrvData(today);
      }
      throw new Error("getHrvData method not available");
    }),
    getSleepData: await safeCall("getSleepData", async () => {
      if (typeof rawClient.getSleepData === "function") {
        return await rawClient.getSleepData(today);
      }
      throw new Error("getSleepData method not available");
    }),
    getMaxMetrics: await safeCall("getMaxMetrics", async () => {
      if (typeof rawClient.getMaxMetrics === "function") {
        return await rawClient.getMaxMetrics(today);
      }
      throw new Error("getMaxMetrics method not available");
    }),
    getUserSettings: await safeCall("getUserSettings", async () => {
      if (typeof rawClient.getUserSettings === "function") {
        return await rawClient.getUserSettings();
      }
      throw new Error("getUserSettings method not available");
    }),
    getTrainingReadiness: await safeCall("getTrainingReadiness", async () => {
      if (typeof rawClient.getTrainingReadiness === "function") {
        return await rawClient.getTrainingReadiness(today);
      }
      throw new Error("getTrainingReadiness method not available");
    }),
    getTrainingReadinessWithStringDate: await safeCall("getTrainingReadinessWithStringDate", async () => {
      if (typeof rawClient.getTrainingReadiness === "function") {
        return await rawClient.getTrainingReadiness(toDateString(today));
      }
      throw new Error("getTrainingReadiness method not available");
    }),
    getTrainingStatus: await safeCall("getTrainingStatus", async () => {
      if (typeof rawClient.getTrainingStatus === "function") {
        return await rawClient.getTrainingStatus(today);
      }
      throw new Error("getTrainingStatus method not available");
    }),
    getTrainingLoad: await safeCall("getTrainingLoad", async () => {
      if (typeof rawClient.getTrainingLoad === "function") {
        return await rawClient.getTrainingLoad(toDateString(sevenDaysAgo), toDateString(today));
      }
      throw new Error("getTrainingLoad method not available");
    }),
    getMetrics: await safeCall("getMetrics", async () => {
      if (typeof rawClient.getMetrics === "function") {
        return await rawClient.getMetrics(today);
      }
      throw new Error("getMetrics method not available");
    }),
    getDailyStats: await safeCall("getDailyStats", async () => {
      if (typeof rawClient.getDailyStats === "function") {
        return await rawClient.getDailyStats(today);
      }
      throw new Error("getDailyStats method not available");
    }),
    getWellnessData: await safeCall("getWellnessData", async () => {
      if (typeof rawClient.getWellnessData === "function") {
        return await rawClient.getWellnessData(today);
      }
      throw new Error("getWellnessData method not available");
    }),
    getUserSettingsMatches: await safeCall("getUserSettingsMatches", async () => {
      if (typeof rawClient.getUserSettings === "function") {
        const settings = await rawClient.getUserSettings();
        return findKeyMatches(settings, ["load", "readiness", "training"]);
      }
      throw new Error("getUserSettings method not available");
    }),
    rawBodyBatteryEndpoints: await safeCall("rawBodyBatteryEndpoints", async () =>
      fetchRawEndpointResponses(rawClient, [
        "/wellness-service/wellness/dailyBodyBattery",
        "/wellness-service/wellness/dailyWellness",
        "/wellness-service/wellness/dailyWellnessData",
        "/wellness-service/wellness/dailyStats",
      ], { date: toDateString(today), startDate: toDateString(sevenDaysAgo), endDate: toDateString(today) })
    ),
    rawTrainingEndpoints: await safeCall("rawTrainingEndpoints", async () =>
      fetchRawEndpointResponses(rawClient, [
        "/wellness-service/wellness/trainingReadiness",
        "/wellness-service/wellness/trainingStatus",
        "/wellness-service/wellness/trainingLoad",
        "/wellness-service/wellness/dailyTrainingLoad",
      ], { date: toDateString(today), startDate: toDateString(sevenDaysAgo), endDate: toDateString(today) })
    ),
  };

  return NextResponse.json({ login: "success", responses });
}
