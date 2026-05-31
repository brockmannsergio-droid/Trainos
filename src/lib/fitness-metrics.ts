export type FitnessMetricsPoint = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const parseDate = (value: unknown): Date | null => {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const getActivityDate = (activity: Record<string, unknown>): string | null => {
  const candidateDates = [
    activity["startTimeLocal"],
    activity["activityDateLocal"],
    activity["startTime"],
    activity["beginTimestamp"],
    activity["activityDate"],
  ];

  for (const value of candidateDates) {
    const date = parseDate(value);
    if (date) return formatDate(date);
  }

  return null;
};

const getNumberValue = (activity: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const raw = activity[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

const toFixedNumber = (value: number) => Number(value.toFixed(2));

export const computeFitnessMetrics = (
  activities: unknown[],
  restingHr: number | null,
  maxHr = 178
): FitnessMetricsPoint[] => {
  const rest = restingHr != null && restingHr > 0 ? restingHr : null;
  const denominator = rest != null ? maxHr - rest : maxHr - 40;

  const tssByDate = new Map<string, number>();

  for (const activity of activities) {
    if (!activity || typeof activity !== "object") continue;
    const activityObj = activity as Record<string, unknown>;
    const date = getActivityDate(activityObj);
    if (!date) continue;

    const durationSeconds = getNumberValue(activityObj, "duration", "elapsedDuration", "activeDuration", "durationSeconds", "totalDuration");
    const avgHr = getNumberValue(activityObj, "avgHR", "averageHR", "averageHeartRate", "avgHeartRate", "avgHr", "average_hr");

    if (durationSeconds == null || avgHr == null || denominator === 0) continue;

    const durationMinutes = Number(durationSeconds) / 60;
    const hrRatio = rest != null ? (avgHr - rest) / denominator : avgHr / maxHr;
    if (!Number.isFinite(hrRatio)) continue;

    const positiveRatio = Math.max(0, Math.min(hrRatio, 1));
    const tss = durationMinutes * positiveRatio * Math.exp(1.92 * positiveRatio);
    const totalTss = tssByDate.get(date) ?? 0;
    tssByDate.set(date, totalTss + tss);
  }

  const today = new Date();
  const hits: { date: string; tss: number }[] = [];
  for (let dayOffset = 89; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const key = formatDate(date);
    hits.push({ date: key, tss: toFixedNumber(tssByDate.get(key) ?? 0) });
  }

  const ctlAlpha = 2 / (42 + 1);
  const atlAlpha = 2 / (7 + 1);

  let ctl = 0;
  let atl = 0;
  const output: FitnessMetricsPoint[] = [];

  for (const day of hits) {
    ctl = ctlAlpha * day.tss + (1 - ctlAlpha) * ctl;
    atl = atlAlpha * day.tss + (1 - atlAlpha) * atl;
    const tsb = ctl - atl;
    output.push({ date: day.date, ctl: toFixedNumber(ctl), atl: toFixedNumber(atl), tsb: toFixedNumber(tsb), tss: day.tss });
  }

  return output.slice(-60);
};
