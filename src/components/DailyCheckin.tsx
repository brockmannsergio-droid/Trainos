"use client";

import { useState } from "react";

async function adaptWorkoutCall(payload: { feeling: string; note: string }) {
  // fetch garmin metrics to include
  const gResp = await fetch('/api/garmin');
  const garmin = await gResp.json().catch(() => ({}));
  // include today's planned workout from localStorage if available
  let todayWorkout: any = null;
  try {
    const stored = localStorage.getItem('weeklyPlan');
    if (stored) {
      const plan = JSON.parse(stored);
      const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
      if (Array.isArray(plan.days)) {
        todayWorkout = plan.days.find((d: any) => String(d.day).toLowerCase() === String(weekday).toLowerCase()) ?? null;
      }
    }
  } catch {}

  const resp = await fetch('/api/adapt-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, garmin, todayWorkout }),
  });
  return resp.json();
}

const feelings = ["Great", "Good", "Okay", "Tired", "Very tired", "Injured"];

export default function DailyCheckin() {
  const [feeling, setFeeling] = useState<string>(feelings[2]);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await adaptWorkoutCall({ feeling, note });
      if (!res) throw new Error('No response');
      setResult(res);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <select
            value={feeling}
            onChange={(e) => setFeeling(e.target.value)}
            className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            aria-label="How are you feeling today"
          >
            {feelings.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button disabled={loading} className="rounded-2xl bg-slate-700 px-4 py-2 text-sm text-white whitespace-nowrap" type="submit">
            {loading ? 'Adapting…' : 'Save'}
          </button>
        </div>
        <textarea
          placeholder="Anything to add about today? e.g. heavy legs, stressed, left knee sore, feeling motivated..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-200 resize-none"
        />
      </form>

      {loading ? <div className="mt-2 text-sm text-slate-400">Contacting AI to adapt today's workout…</div> : null}
      {error ? <div className="mt-2 text-sm text-rose-400">{error}</div> : null}
      {result ? (
        (() => {
          const payload = result.adapted ?? result;
          // payload may be { adapted: {...}, explanation }
          const adapted = payload.adapted ?? payload;
          const explanation = payload.explanation ?? payload.message ?? null;
          const original = payload.original ?? null;

          const titleEmoji = (adapted?.intensity ?? adapted?.type ?? '').toLowerCase().includes('easy') ? '🟢' : adapted?.intensity?.toLowerCase().includes('hard') ? '🔴' : '🏃';

          return (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{titleEmoji} {adapted?.title ?? adapted?.type ?? 'Adapted workout'}</div>
                  <div className="text-sm text-slate-300">TSS: {adapted?.tss ?? '—'}</div>
                </div>

                <div className="mt-3 text-sm text-slate-200">
                  <div className="font-medium">Warm up</div>
                  <div className="mt-1">{adapted?.warmup ?? '—'}</div>

                  <div className="mt-2 font-medium">Main set</div>
                  <div className="mt-1">{adapted?.main ?? adapted?.description ?? '—'}</div>

                  <div className="mt-2 font-medium">Cool down</div>
                  <div className="mt-1">{adapted?.cooldown ?? '—'}</div>

                  {adapted?.zones ? (
                    <div className="mt-3">
                      <div className="text-xs text-slate-400">Target zones / pace</div>
                      <div className="mt-1 text-sm text-slate-200">{Array.isArray(adapted.zones) ? adapted.zones.join(', ') : adapted.zones ?? '—'}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-sm text-slate-400">AI reasoning</div>
                <div className="mt-2 rounded-lg bg-slate-950/60 p-3 text-sm text-slate-200">{explanation ?? '—'}</div>

                {original ? (
                  <div className="mt-4 grid gap-2">
                    <div className="text-xs text-slate-400">Original</div>
                    <div className="rounded-md bg-slate-950/40 p-2 text-sm text-slate-200">{original?.main ?? original?.description ?? '—'}</div>
                    <div className="text-xs text-slate-400">Adapted</div>
                    <div className="rounded-md bg-slate-950/40 p-2 text-sm text-slate-200">{adapted?.main ?? adapted?.description ?? '—'}</div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
