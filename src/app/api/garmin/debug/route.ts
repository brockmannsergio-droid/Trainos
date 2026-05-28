import { NextResponse } from "next/server";
import { GarminConnect } from "garmin-connect";

const parseDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const safeCall = async (label: string, fn: () => Promise<unknown>) => {
  try {
    const result = await fn();
    return { label, result, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { label, result: null, error: message };
  }
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
    getTrainingReadiness: await safeCall("getTrainingReadiness", async () => {
      if (typeof rawClient.getTrainingReadiness === "function") {
        return await rawClient.getTrainingReadiness(today);
      }
      throw new Error("getTrainingReadiness method not available");
    }),
    getTrainingStatus: await safeCall("getTrainingStatus", async () => {
      if (typeof rawClient.getTrainingStatus === "function") {
        return await rawClient.getTrainingStatus(today);
      }
      throw new Error("getTrainingStatus method not available");
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
  };

  return NextResponse.json({ login: "success", responses });
}
