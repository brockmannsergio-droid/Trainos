export type TrainingReadiness = { score: number | null; level: string | null } | null;
export type TrainingLoad = { acute: number | null; chronic: number | null } | null;

const getNumber = (obj: any, ...keys: string[]) => {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
};

const getValue = (obj: any, ...keys: string[]) => {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
};

export async function fetchTrainingMetricsService(): Promise<{ trainingReadiness: TrainingReadiness; trainingLoad: TrainingLoad; raw: any } > {
  const base = process.env.TRAINING_METRICS_SERVICE_URL;
  if (!base) throw new Error("TRAINING_METRICS_SERVICE_URL is not set");
  const url = `${base.replace(/\/$/, "")}/training-metrics`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Training metrics service returned ${res.status}`);
  const payload = await res.json();

  // extract training readiness
  let readiness: TrainingReadiness = null;
  const trCandidates = [payload?.trainingReadiness, payload?.training_readiness, payload?.training_readiness?.data, payload?.trainingReadinessData, payload];
  let tr0: any = null;
  for (const c of trCandidates) {
    if (!c) continue;
    if (Array.isArray(c) && c.length) {
      tr0 = c[0];
      break;
    }
    if (typeof c === "object" && (c.score !== undefined || c.level !== undefined)) {
      tr0 = c;
      break;
    }
  }
  if (tr0) {
    const score = getNumber(tr0, "score");
    const levelRaw = getValue(tr0, "level", "state");
    const level = levelRaw == null ? null : String(levelRaw);
    readiness = { score, level };
  }

  // extract training load (use Render service "raw" wrapper if present)
  let load: TrainingLoad = null;
  const rawStatus = payload?.trainingLoad?.raw?.trainingStatus ?? payload?.trainingStatus ?? payload?.raw?.trainingStatus;
  if (rawStatus?.latestTrainingStatusData) {
    const deviceData = Object.values(rawStatus.latestTrainingStatusData)[0] as any;
    const acute = deviceData?.acuteTrainingLoadDTO?.dailyTrainingLoadAcute;
    const chronic = deviceData?.acuteTrainingLoadDTO?.dailyTrainingLoadChronic;
    load = { acute: acute ?? null, chronic: chronic ?? null };
  }

  return { trainingReadiness: readiness, trainingLoad: load, raw: payload };
}
