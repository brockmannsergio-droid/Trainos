"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const formatDistance = (meters: number | string | undefined) => {
  if (!meters || Number.isNaN(Number(meters))) return "—";
  return `${(Number(meters) / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number | string | undefined) => {
  if (!seconds || Number.isNaN(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  return `${h?`${h}h `:''}${m}m`;
}

const formatElevation = (meters: number | string | undefined) => {
  if (meters == null || Number.isNaN(Number(meters))) return "—";
  return `${Number(meters).toFixed(0)} m`;
};

const getActivityType = (activity: Record<string, unknown>) => {
  const rawType = activity["activityName"] ?? activity["activityType"] ?? activity["activityTypeName"] ?? activity["activityTypeDto"];
  if (!rawType) return 'Activity';
  return String(rawType as any);
};

export default function ActivitiesPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/garmin')
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || 'Unable to fetch Garmin data.');
        }
        setData(payload);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load Garmin data.');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const activityCards = useMemo(() => {
    if (!data?.activities || !Array.isArray(data.activities)) return [];
    return data.activities.slice(0, 30).map((activity: any, index: number) => ({
      id: String(activity["activityId"] ?? activity["activityPk"] ?? index),
      name: String(activity["activityName"] ?? activity["activityType"] ?? 'Activity'),
      date: String(activity["startTimeLocal"] ?? activity["beginTimestamp"] ?? activity["activityDateLocal"] ?? activity["startTime"] ?? 'Unknown'),
      distance: formatDistance(activity["distance"] as number | string | undefined),
      duration: formatDuration((activity["duration"] ?? activity["elapsedDuration"] ?? activity["activeDuration"]) as number | string | undefined),
      elevation: formatElevation((activity["elevationGain"] ?? activity["totalElevationGain"] ?? activity["climbElevation"]) as number | string | undefined),
      type: getActivityType(activity as Record<string, unknown>),
    }));
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-semibold">Activities</h1>
          <Link href="/" className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700">← Back to Dashboard</Link>
        </div>
        <p className="mt-2 text-sm text-slate-400">Last 30 days of activities with distance, time, HR and TSS.</p>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-4 text-slate-300">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-slate-400"></div>
                <span>Loading Garmin data…</span>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-700/40 bg-rose-900/40 p-6 text-rose-100">
              <p className="font-semibold">Unable to load Garmin data</p>
              <p className="mt-2 text-sm leading-6 text-rose-200">{error}</p>
            </div>
          ) : activityCards.length ? (
            activityCards.map((activity: any) => (
              <div key={activity.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-slate-600">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{activity.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{activity.date}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">{activity.type}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl bg-slate-950/60 p-3 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Distance</p>
                    <p className="mt-2 text-base font-semibold text-white">{activity.distance}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/60 p-3 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Duration</p>
                    <p className="mt-2 text-base font-semibold text-white">{activity.duration}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/60 p-3 text-sm text-slate-300">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Elevation</p>
                    <p className="mt-2 text-base font-semibold text-white">{activity.elevation}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-slate-400">No activities found.</div>
          )}
        </div>
      </div>
    </main>
  );
}
