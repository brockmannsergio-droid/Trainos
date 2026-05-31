"use client";

import { useEffect, useState } from "react";

const formatDistance = (m: any) => (m == null ? '—' : `${(Number(m)/1000).toFixed(1)} km`);
const formatDuration = (s: any) => {
  if (s == null) return '—';
  const total = Math.round(Number(s));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  return `${h?`${h}h `:''}${m}m`;
}

export default function ActivitiesPage() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/garmin').then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  const activities = (data?.activities ?? []).slice(0,30);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold">Activities</h1>
        <p className="mt-2 text-sm text-slate-400">Last 30 days of activities with distance, time, HR and TSS.</p>

        <div className="mt-6 space-y-4">
          {activities.length ? activities.map((a: any, i: number) => (
            <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{a.activityName ?? a.activityType ?? 'Activity'}</div>
                  <div className="text-sm text-slate-400">{a.startTimeLocal ?? a.activityDateLocal ?? a.startTime ?? ''}</div>
                </div>
                <div className="text-sm text-slate-300">{formatDistance(a.distance)}</div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm text-slate-300">
                <div>
                  <div className="text-xs text-slate-400">Duration</div>
                  <div className="mt-1 text-white">{formatDuration(a.duration ?? a.elapsedDuration ?? a.activeDuration)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Avg HR</div>
                  <div className="mt-1 text-white">{a.averageHeartRate ?? a.avgHr ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">TSS</div>
                  <div className="mt-1 text-white">{a.tss ?? a.trainingStressScore ?? a.trainingEffect ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Sport</div>
                  <div className="mt-1 text-white">{a.activityType ?? a.activityTypeName ?? '—'}</div>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-slate-400">No activities found.</div>
          )}
        </div>
      </div>
    </main>
  );
}
