"use client";

import { useEffect, useMemo, useState } from "react";

type GarminData = {
  hrv?: { value?: number | string | null; status?: string; raw?: Record<string, unknown> };
  sleep?: { score?: number | string | null; duration?: number; quality?: number | string | null; raw?: Record<string, unknown> };
  bodyBattery?: { latest?: number | string | null; raw?: unknown };
  stress?: { value?: number | string | null; max?: number | string | null; raw?: Record<string, unknown> };
  restingHeartRate?: { value?: number | string | null; available?: boolean; raw?: Record<string, unknown> };
  vo2Max?: { value?: number | string | null; trend?: string | null; available?: boolean; raw?: Record<string, unknown> };
  vo2MaxRunning?: { value?: number | string | null; available?: boolean; raw?: Record<string, unknown> };
  vo2MaxCycling?: { value?: number | string | null; available?: boolean; raw?: Record<string, unknown> };
  trainingReadiness?: { score?: number | string | null; status?: string | null; available?: boolean; raw?: Record<string, unknown> };
  trainingLoad?: { acute?: number | string | null; chronic?: number | string | null; weekly?: number | string | null; trend?: string | null; available?: boolean; raw?: Record<string, unknown> };
  weeklySummary?: { totalDistance?: number | null; totalTime?: number | null; totalElevation?: number | null; raw?: Record<string, unknown> };
  heartRateZones?: Array<{ label?: string | null; min?: number | string | null; max?: number | string | null; time?: number | string | null; raw?: Record<string, unknown> }>;
  trendIndicator?: string | null;
  activities?: Array<Record<string, unknown>>;
};

type MetricCard = {
  label: string;
  value: string | number;
  helper?: string;
};

const navItems = [
  "Dashboard",
  "Weekly Plan",
  "Recovery",
  "Activities",
  "Profile",
];

const formatDistance = (meters: number | string | undefined) => {
  if (!meters || Number.isNaN(Number(meters))) return "—";
  return `${(Number(meters) / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number | string | undefined) => {
  if (!seconds || Number.isNaN(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours ? `${hours}h ` : ""}${minutes}m ${secs}s`;
};

const getActivityType = (activity: Record<string, unknown>) => {
  const rawType =
    activity["activityType"] ??
    (activity["activityTypeDto"] as any)?.type ??
    (activity["activityTypeDto"] as any)?.name ??
    activity["activityTypeName"];

  if (typeof rawType === "string") return rawType;
  if (typeof rawType === "number") return String(rawType);
  if (rawType && typeof rawType === "object") {
    return String((rawType as any).type ?? (rawType as any).name ?? "—");
  }

  return "—";
};

const getLatestBodyBattery = (bodyBattery?: { latest?: number | string | null; raw?: unknown }) => {
  if (!bodyBattery) return "—";
  if (bodyBattery.latest == null) return "—";
  return String(bodyBattery.latest);
};

const getHrvValue = (hrv?: { value?: number | string | null; status?: string }) => {
  if (!hrv || hrv.value == null) return "—";
  return String(hrv.value);
};

const getStressValue = (stress?: { value?: number | string | null }) => {
  if (!stress || stress.value == null) return "—";
  return String(stress.value);
};

const getRestingHeartRateValue = (resting?: { value?: number | string | null; available?: boolean }) => {
  if (!resting) return "—";
  if (resting.available === false) return "N/A";
  if (resting.value == null) return "—";
  return String(resting.value);
};

const getVo2MaxValue = (vo2Max?: { value?: number | string | null; available?: boolean }) => {
  if (!vo2Max) return "—";
  if (vo2Max.available === false) return "N/A";
  if (vo2Max.value == null) return "—";
  return String(vo2Max.value);
};

const getTrainingReadinessValue = (readiness?: { score?: number | string | null; status?: string | null; available?: boolean }) => {
  if (!readiness) return "—";
  if (readiness.available === false) return "N/A";
  if (readiness.score != null) return String(readiness.score);
  if (readiness.status) return readiness.status;
  return "—";
};

const getTrainingLoadValue = (trainingLoad?: { acute?: number | string | null; chronic?: number | string | null; weekly?: number | string | null; available?: boolean }) => {
  if (!trainingLoad) return "—";
  if (trainingLoad.available === false) return "N/A";
  const acute = trainingLoad.acute != null ? String(trainingLoad.acute) : "—";
  const chronic = trainingLoad.chronic != null ? String(trainingLoad.chronic) : "—";
  return `${acute} / ${chronic}`;
};

const formatElevation = (meters: number | string | undefined) => {
  if (meters == null || Number.isNaN(Number(meters))) return "—";
  return `${Number(meters).toFixed(0)} m`;
};

const formatTrendIndicator = (trend?: string | null) => {
  if (!trend) return "Maintaining";
  return trend;
};

const formatZoneTime = (value: number | string | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const seconds = Number(value);
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
};

export default function Home() {
  const [data, setData] = useState<GarminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch("/api/garmin")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to fetch Garmin data.");
        }
        setData(payload);
      })
      .catch((fetchError) => {
        setError(fetchError.message ?? "Failed to load Garmin data.");
      })
      .finally(() => setLoading(false));
  }, []);

  const activityCards = useMemo(() => {
    if (!data?.activities || !Array.isArray(data.activities)) return [];
    return data.activities.slice(0, 30).map((activity, index) => ({
      id: String(activity["activityId"] ?? activity["activityPk"] ?? index),
      name: String(activity["activityName"] ?? activity["activityType"] ?? "Activity"),
      date: String(
        activity["startTimeLocal"] ?? activity["beginTimestamp"] ?? activity["activityDateLocal"] ?? activity["startTime"] ?? "Unknown"
      ),
      distance: formatDistance(activity["distance"] as number | string | undefined),
      duration: formatDuration(
        (activity["duration"] ?? activity["elapsedDuration"] ?? activity["activeDuration"]) as number | string | undefined
      ),
      elevation: formatElevation(
        (activity["elevationGain"] ?? activity["totalElevationGain"] ?? activity["climbElevation"]) as number | string | undefined
      ),
      type: getActivityType(activity),
    }));
  }, [data]);

  const metrics: MetricCard[] = [
    {
      label: "Resting HR",
      value: getRestingHeartRateValue(data?.restingHeartRate),
      helper:
        data?.restingHeartRate?.available === false
          ? "N/A for this device"
          : "Current resting heart rate",
    },
    {
      label: "VO2max Running",
      value: getVo2MaxValue(data?.vo2MaxRunning),
      helper:
        data?.vo2MaxRunning?.available === false
          ? "N/A for this device"
          : "Running VO2max estimate",
    },
    {
      label: "VO2max Cycling",
      value: getVo2MaxValue(data?.vo2MaxCycling),
      helper:
        data?.vo2MaxCycling?.available === false
          ? "N/A for this device"
          : "Cycling VO2max estimate",
    },
    {
      label: "Today's HRV",
      value: String(getHrvValue(data?.hrv)),
      helper: "Higher is generally better",
    },
    {
      label: "Sleep Score",
      value: data?.sleep?.score != null ? String(data.sleep.score) : "—",
      helper: "Last recorded night",
    },
    {
      label: "Current body battery",
      value: getLatestBodyBattery(data?.bodyBattery),
      helper: "Uses current wellness timeline; falls back to sleep body battery",
    },
    {
      label: "Stress Level",
      value: String(getStressValue(data?.stress)),
      helper: "Current stress snapshot",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 flex-col gap-6 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl lg:flex">
          <div className="space-y-3">
            <div className="rounded-3xl bg-slate-800/70 px-4 py-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Training</p>
              <h1 className="mt-3 text-2xl font-semibold text-white">Endurance Hub</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Track HRV, sleep, body battery, stress, and your last week of activities.
              </p>
            </div>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item}
                className="flex w-full items-center justify-between rounded-3xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-left text-sm text-slate-100 transition hover:border-slate-600 hover:bg-slate-900"
              >
                <span>{item}</span>
                <span className="text-slate-500">→</span>
              </button>
            ))}
          </nav>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-100">Next session</p>
            <p className="mt-2">Recovery checkpoint in 48h. Use your body battery and sleep trend to adjust volume.</p>
          </div>
        </aside>

        <section className="flex-1">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Training dashboard</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Weekly recovery overview</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                  Connect directly to Garmin and see your latest HRV, sleep score, body battery, stress, and recent activity load.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                {loading ? "Refreshing data…" : error ? "Last sync failed" : `Last synced: ${new Date().toLocaleTimeString()}`}
              </div>
            </div>
            {loading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/60">
                <div className="flex items-center gap-4 text-slate-300">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-slate-400"></div>
                  <span>Loading Garmin data…</span>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-rose-700/40 bg-rose-900/40 p-6 text-rose-100">
                <p className="font-semibold">Unable to load Garmin data</p>
                <p className="mt-2 text-sm leading-6 text-rose-200">{error}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Training trend</p>
                    <p className="mt-4 text-3xl font-semibold text-white">{formatTrendIndicator(data?.trendIndicator)}</p>
                    <p className="mt-2 text-sm text-slate-500">Based on VO2max and training load changes.</p>
                  </div>
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                      <p className="mt-4 text-3xl font-semibold text-white">{metric.value}</p>
                      {metric.helper ? <p className="mt-2 text-sm text-slate-500">{metric.helper}</p> : null}
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Training status</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">Readiness score & load</h3>
                    </div>
                    <p className="text-sm text-slate-400">Separate readiness and load insights from Garmin.</p>
                  </div>
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Training readiness</p>
                      <p className="mt-4 text-3xl font-semibold text-white">{getTrainingReadinessValue(data?.trainingReadiness)}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {data?.trainingReadiness?.available === false
                          ? "N/A for this device"
                          : data?.trainingReadiness?.status
                          ? `Status: ${data.trainingReadiness.status}`
                          : "Recovery readiness score"
                        }
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Training load</p>
                      <p className="mt-4 text-3xl font-semibold text-white">{getTrainingLoadValue(data?.trainingLoad)}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {data?.trainingLoad?.available === false
                          ? "N/A for this device"
                          : "Acute / chronic training load"
                        }
                      </p>
                      {data?.trainingLoad?.weekly != null ? (
                        <p className="mt-2 text-sm text-slate-400">Weekly load: {String(data.trainingLoad.weekly)}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Weekly distance</p>
                    <p className="mt-4 text-3xl font-semibold text-white">{formatDistance(data?.weeklySummary?.totalDistance ?? undefined)}</p>
                    <p className="mt-2 text-sm text-slate-500">Distance in the last 7 days</p>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Weekly time</p>
                    <p className="mt-4 text-3xl font-semibold text-white">{formatDuration(data?.weeklySummary?.totalTime ?? undefined)}</p>
                    <p className="mt-2 text-sm text-slate-500">Total active time this week</p>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Weekly elevation</p>
                    <p className="mt-4 text-3xl font-semibold text-white">{formatElevation(data?.weeklySummary?.totalElevation ?? undefined)}</p>
                    <p className="mt-2 text-sm text-slate-500">Total elevation gain this week</p>
                  </div>
                </div>

                <div className="mt-6 rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recent activities</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">Last 30 days</h3>
                    </div>
                    <p className="text-sm text-slate-400">Showing your latest available Garmin activity load.</p>
                  </div>
                  <div className="mt-6 space-y-4">
                    {activityCards.length > 0 ? (
                      activityCards.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-slate-600"
                        >
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
                      <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-slate-400">
                        No recent activities were found in Garmin for the last 30 days.
                      </div>
                    )}
                  </div>
                </div>

                {data?.heartRateZones && data.heartRateZones.length > 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Last activity</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Heart rate zone distribution</h3>
                      </div>
                      <p className="text-sm text-slate-400">Based on your most recent activity.</p>
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {data.heartRateZones.map((zone, index) => (
                        <div key={index} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{zone.label ?? `Zone ${index + 1}`}</p>
                          <p className="mt-2 text-base font-semibold text-white">
                            {zone.min != null || zone.max != null
                              ? `${zone.min ?? "?"}-${zone.max ?? "?"} bpm`
                              : "—"}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">{formatZoneTime(zone.time as number | string | undefined)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
