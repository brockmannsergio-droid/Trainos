"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RecoveryPage() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/garmin').then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-semibold">Recovery</h1>
          <Link href="/" className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700">← Back to Dashboard</Link>
        </div>
        <p className="mt-2 text-sm text-slate-400">Overview of recovery metrics and recommendations.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">Body Battery</p>
            <p className="mt-2 text-2xl font-semibold text-white">{data?.bodyBattery?.latest ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">Sleep Score</p>
            <p className="mt-2 text-2xl font-semibold text-white">{data?.sleep?.score ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-400">Training Readiness</p>
            <p className="mt-2 text-2xl font-semibold text-white">{data?.trainingReadiness?.score ?? data?.trainingReadiness?.status ?? '—'}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
          <h3 className="font-medium text-white">Recovery notes</h3>
          <p className="mt-2">Use body battery and sleep trends to reduce intensity or volume when necessary.</p>
        </div>
      </div>
    </main>
  );
}
