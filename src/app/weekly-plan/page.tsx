"use client";

import { useEffect, useState } from "react";
import DailyCheckin from "../../components/DailyCheckin";

const feelings = ["Great", "Good", "Okay", "Tired", "Very tired", "Injured"];

export default function WeeklyPlanPage() {
  const [feeling, setFeeling] = useState<string>(feelings[2]);
  const [weeklyNotes, setWeeklyNotes] = useState<string>("");
  const [physicalNotes, setPhysicalNotes] = useState<string>("");
  const [currentFocus, setCurrentFocus] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [plan, setPlan] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [modalWorkout, setModalWorkout] = useState<any | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const submit = async (e: any) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // fetch current Garmin metrics and include in request
      const gResp = await fetch("/api/garmin");
      const garmin = await gResp.json();

      const requestBody = {
        feeling,
        weeklyNotes,
        physicalNotes,
        goal,
        currentFocus,
        garmin,
      };
      console.log("Sending /api/generate-plan payload:", requestBody);

      const resp = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = await resp.json();
      if (!resp.ok) {
        const errorMsg = payload?.error || "Failed to generate plan";
        const detail = payload?.detail;
        throw new Error(detail ? `${errorMsg}: ${JSON.stringify(detail)}` : errorMsg);
      }
      const finalPlan = payload.plan ?? payload;
      setPlan(finalPlan);
      try {
        localStorage.setItem('weeklyPlan', JSON.stringify(finalPlan));
      } catch {}
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message ?? JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  const getNextDateForWeekday = (weekdayName: string) => {
    const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const target = names.indexOf(String(weekdayName || '').toLowerCase());
    const today = new Date();
    if (target === -1) return today.toISOString().slice(0,10);
    const day = today.getDay();
    let diff = (target - day + 7) % 7;
    if (diff === 0) diff = 7; // next occurrence
    const d = new Date();
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0,10);
  };

  const openSendModal = (workout: any) => {
    setModalWorkout(workout);
    setModalDate(getNextDateForWeekday(workout?.day));
    setSendModalOpen(true);
    setSuccessMessage(null);
  };

  const sendToGarmin = async (workout: any, date: string) => {
    try {
      const resp = await fetch('/api/send-to-garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout, date }),
      });
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || JSON.stringify(payload));
      setSuccessMessage(`✅ Sent to Forerunner 970 for ${date}!`);
      return true;
    } catch (err: any) {
      setSuccessMessage(String(err?.message ?? err));
      return false;
    }
  };

  const sendFullWeek = async () => {
    if (!plan?.days) return;
    setSuccessMessage(null);
    for (const d of plan.days) {
      const date = getNextDateForWeekday(d.day);
      await sendToGarmin(d, date);
    }
    setSuccessMessage('✅ Sent full week to Forerunner 970!');
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('weeklyPlan');
      if (stored) setPlan(JSON.parse(stored));
    } catch {}
  }, []);

  const downloadPlan = () => {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'weekly-plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearPlan = () => {
    localStorage.removeItem('weeklyPlan');
    setPlan(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold">Plan My Week</h1>
        <p className="mt-2 text-sm text-slate-400">Create a structured 7-day plan based on your availability and Garmin metrics.</p>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Feeling</label>
            <select value={feeling} onChange={(e) => setFeeling(e.target.value)} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
              {feelings.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <textarea placeholder={"Tell me about your week — when you're planning to\ntrain, any commitments, travel, gym sessions, or\nanything that affects your schedule..."}
            value={weeklyNotes}
            onChange={(e) => setWeeklyNotes(e.target.value)}
            className="min-h-[120px] rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200"
          />

          <textarea placeholder={"Any injuries, soreness or physical notes?"}
            value={physicalNotes}
            onChange={(e) => setPhysicalNotes(e.target.value)}
            className="min-h-[80px] rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200"
          />

          <input placeholder="Current focus (e.g. building aerobic base, speed work)" value={currentFocus} onChange={(e) => setCurrentFocus(e.target.value)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200" />
          <input placeholder="Goal (e.g. 5k PR, build endurance)" value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200" />

          <div className="flex flex-wrap items-center gap-3">
            <button disabled={loading} className="rounded-2xl bg-slate-700 px-4 py-2 text-sm disabled:opacity-60" type="submit">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300"></span>
                  Generating…
                </span>
              ) : (
                "Generate plan"
              )}
            </button>
            <button type="button" onClick={downloadPlan} disabled={!plan} className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 disabled:opacity-50">
              Export plan
            </button>
            <button type="button" onClick={sendFullWeek} disabled={!plan} className="rounded-2xl border border-emerald-600 bg-emerald-700 px-4 py-2 text-sm text-emerald-100 disabled:opacity-50">
              Send full week to Garmin ⌚
            </button>
            <button type="button" onClick={clearPlan} disabled={!plan} className="rounded-2xl border border-rose-700 bg-rose-900 px-4 py-2 text-sm text-rose-100 disabled:opacity-50">
              Clear saved plan
            </button>
            {error ? <span className="text-sm text-rose-400">{error}</span> : null}
          </div>
        </form>

        {plan?.days ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {plan.days.map((d: any, idx: number) => (
              <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-400">{d.day}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{d.type} — {d.sport}</div>
                  </div>
                  <div className="text-sm text-slate-300">{d.duration != null ? `${d.duration}m` : '—'}</div>
                </div>

                <div className="mt-3 text-sm text-slate-300">{d.description?.slice?.(0, 120) ?? d.description}</div>

                <div className="mt-3 flex items-center gap-2">
                  <button className="text-sm text-slate-100 underline" onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}>
                    {expandedDay === idx ? "Hide details" : "View details"}
                  </button>
                  <button className="text-sm text-emerald-200 underline" onClick={() => openSendModal(d)}>
                    Send to Garmin ⌚
                  </button>
                  <div className="text-sm text-slate-400">TSS: {d.tss ?? "—"}</div>
                </div>

                {expandedDay === idx ? (
                  <div className="mt-3 rounded-xl bg-slate-950/50 p-3 text-sm text-slate-200">
                    <div className="font-medium">Warm up</div>
                    <div className="mt-1">{d.workout?.warmup ?? "—"}</div>
                    <div className="mt-2 font-medium">Main set</div>
                    <div className="mt-1">{d.workout?.main ?? d.description ?? "—"}</div>
                    <div className="mt-2 font-medium">Cool down</div>
                    <div className="mt-1">{d.workout?.cooldown ?? "—"}</div>
                    {d.why ? (
                      <>
                        <div className="mt-3 font-medium">Why</div>
                        <div className="mt-1">{d.why}</div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {sendModalOpen && modalWorkout ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-xl bg-slate-900 p-6 text-slate-100">
              <h3 className="text-lg font-semibold">Send workout to Garmin</h3>
              <p className="mt-2 text-sm text-slate-400">{modalWorkout.day} — {modalWorkout.type} — {modalWorkout.sport}</p>

              <div className="mt-4">
                <label className="text-sm text-slate-400">Schedule date</label>
                <input className="mt-1 w-full rounded-md bg-slate-800 p-2 text-sm text-white" type="date" value={modalDate ?? ''} onChange={(e) => setModalDate(e.target.value)} min={new Date().toISOString().slice(0,10)} max={(() => { const d=new Date(); d.setDate(d.getDate()+14); return d.toISOString().slice(0,10); })()} />
              </div>

              {successMessage ? <div className="mt-3 text-sm text-emerald-300">{successMessage}</div> : null}

              <div className="mt-4 flex justify-end gap-3">
                <button className="rounded-2xl border border-slate-700 px-4 py-2 text-sm" onClick={() => { setSendModalOpen(false); setModalWorkout(null); setSuccessMessage(null); }}>Cancel</button>
                <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm" onClick={async () => { if (!modalWorkout || !modalDate) return; await sendToGarmin(modalWorkout, modalDate); }}>
                  Send to Garmin
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
