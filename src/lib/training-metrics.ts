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

  // extract training load
  let load: TrainingLoad = null;
  const tlCandidates = [payload?.trainingLoad, payload?.training_load, payload?.training_status, payload?.training_status?.data, payload];
  let found: any = null;
  for (const c of tlCandidates) {
    if (!c) continue;
    // if simplified
    if (typeof c === "object" && (c.acute !== undefined || c.chronic !== undefined || c.dailyTrainingLoadAcute !== undefined)) {
      const acute = getNumber(c, "acute", "dailyTrainingLoadAcute", "acuteLoad");
      const chronic = getNumber(c, "chronic", "dailyTrainingLoadChronic", "chronicLoad");
      found = { acute, chronic };
      break;
    }
    // raw structure with latestTrainingStatusData
    const latest = c?.mostRecentTrainingStatus?.latestTrainingStatusData ?? c?.latestTrainingStatusData ?? c?.latestTrainingStatus ?? c?.trainingStatus ?? null;
    if (latest) {
      // latest can be an array or an object keyed by device id. prefer the first device entry.
      let deviceData: any = null;
      if (Array.isArray(latest) && latest.length) deviceData = latest[0];
      else if (typeof latest === "object") {
        const vals = Object.values(latest);
        if (vals.length) deviceData = vals[0];
      }
      if (deviceData) {
        const acute = deviceData?.acuteTrainingLoadDTO?.dailyTrainingLoadAcute ?? getNumber(deviceData?.acuteTrainingLoadDTO ?? deviceData, "dailyTrainingLoadAcute", "dailyTrainingLoad", "acute");
        const chronic = deviceData?.acuteTrainingLoadDTO?.dailyTrainingLoadChronic ?? getNumber(deviceData?.acuteTrainingLoadDTO ?? deviceData, "dailyTrainingLoadChronic", "chronicLoad", "chronic");
        found = { acute, chronic };
        break;
      }
    }
  }

  if (found) load = { acute: found.acute ?? null, chronic: found.chronic ?? null };

  return { trainingReadiness: readiness, trainingLoad: load, raw: payload };
}
