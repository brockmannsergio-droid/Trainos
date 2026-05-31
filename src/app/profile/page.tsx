"use client";

import { useEffect, useState } from "react";

const getLatestFitness = (fitness: any[]) => (fitness && fitness.length ? fitness[fitness.length-1] : null);

export default function ProfilePage() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/garmin').then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  const latest = getLatestFitness(data?.fitness ?? []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold">Profile</h1>
        <p className="mt-2 text-sm text-slate-400">Your current fitness and device information.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">CTL</p>
            <p className="mt-2 text-2xl font-semibold text-white">{latest?.ctl ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">ATL</p>
            <p className="mt-2 text-2xl font-semibold text-white">{latest?.atl ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">TSB</p>
            <p className="mt-2 text-2xl font-semibold text-white">{latest?.tsb ?? '—'}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <h3 className="text-sm text-slate-400">Garmin device</h3>
          <p className="mt-2 text-lg text-white">{data?.deviceModel ?? 'Forerunner 970'}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <h3 className="text-sm text-slate-400">VO2max</h3>
          <p className="mt-2 text-lg text-white">Running: {data?.vo2MaxRunning?.value ?? '—'} — Cycling: {data?.vo2MaxCycling?.value ?? '—'}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <h3 className="text-sm text-slate-400">Heart rate zones</h3>
          <div className="mt-2 grid gap-2">
            {data?.heartRateZones?.map((z: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm text-slate-300">
                <div>{z.label ?? `Zone ${i+1}`}</div>
                <div>{z.min != null && z.max != null ? `${z.min}-${z.max} bpm` : '—'}</div>
              </div>
            )) ?? <div className="text-sm text-slate-400">No zones available</div>}
          </div>
        </div>
      </div>
    </main>
  );
}
