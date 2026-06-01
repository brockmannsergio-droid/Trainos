import { NextResponse } from "next/server";
import { callClaudeWithRetry } from "../../../lib/claude";
import Ajv from 'ajv';
import { weeklyPlanSchema } from '../../../lib/schemas';

type PlanRequest = {
  garmin: Record<string, any>;
  feeling: string;
  weeklyNotes: string;
  physicalNotes?: string;
  currentFocus?: string;
  goal?: string;
};

const safeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

const safeString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const summarizeGarminForPrompt = (garmin?: Record<string, any>) => {
  const latestFitness = Array.isArray(garmin?.fitness) && garmin.fitness.length ? garmin.fitness[garmin.fitness.length - 1] : garmin?.fitness;

  const ctl = safeNumber(latestFitness?.ctl ?? latestFitness?.CTL ?? garmin?.ctl);
  const atl = safeNumber(latestFitness?.atl ?? latestFitness?.ATL ?? garmin?.atl);
  const tsb = safeNumber(latestFitness?.tsb ?? latestFitness?.TSB ?? garmin?.tsb);

  const hrv = safeNumber(garmin?.sleep?.hrvValue ?? garmin?.sleep?.hrv ?? garmin?.hrv);
  const sleepScore = safeNumber(garmin?.sleep?.score ?? garmin?.sleep?.sleepScore ?? garmin?.sleepScore);
  const bodyBattery = safeNumber(garmin?.sleep?.bodyBatteryLatest ?? garmin?.bodyBattery?.value ?? garmin?.bodyBatteryLatest ?? garmin?.bodyBattery);
  const stress = safeNumber(garmin?.sleep?.stressValue ?? garmin?.sleep?.stress ?? garmin?.stress?.value ?? garmin?.stress);

  const restingHr = safeNumber(garmin?.restingHeartRate?.value ?? garmin?.restingHeartRate ?? garmin?.restingHr);
  const vo2Max = safeNumber(garmin?.vo2Max?.value ?? garmin?.vo2Max ?? garmin?.vo2MaxRunning?.value ?? garmin?.vo2MaxRunning);
  const vo2MaxRunning = safeNumber(garmin?.vo2MaxRunning?.value ?? garmin?.vo2MaxRunning);
  const vo2MaxCycling = safeNumber(garmin?.vo2MaxCycling?.value ?? garmin?.vo2MaxCycling);

  const readinessScore = safeNumber(
    garmin?.trainingReadiness?.score ??
    garmin?.trainingReadiness?.trainingReadiness ??
    garmin?.trainingReadiness?.value ??
    garmin?.trainingReadinessScore
  );
  const readinessLevel = safeString(
    garmin?.trainingReadiness?.status ??
    garmin?.trainingReadiness?.level ??
    garmin?.trainingReadiness?.state ??
    garmin?.trainingReadiness?.statusText
  );

  const weeklyDistance = safeNumber(garmin?.weeklySummary?.totalDistance ?? garmin?.weeklySummary?.distance ?? garmin?.weeklySummary?.totalDistanceKm);
  let weeklyTime = safeNumber(garmin?.weeklySummary?.totalTime ?? garmin?.weeklySummary?.totalTimeMinutes ?? garmin?.weeklySummary?.totalTimeSeconds);
  if (weeklyTime != null && weeklyTime > 10000) weeklyTime = Number((weeklyTime / 60).toFixed(1));

  const activities = Array.isArray(garmin?.activities)
    ? garmin.activities.slice(0, 3).map((activity: any) => ({
        name: safeString(activity.name ?? activity.activityName ?? activity.title ?? activity.displayName ?? activity.activityType) ?? 'Unknown activity',
        duration: safeNumber(activity.duration ?? activity.elapsedDuration ?? activity.activeDuration ?? activity.elapsedTime ?? activity.totalTime) ?? 0,
        distance: safeNumber(activity.distance ?? activity.totalDistance ?? activity.distanceKm ?? activity.distanceMeters ?? activity.distance_meters) ?? 0,
      }))
    : [];

  return {
    ctl,
    atl,
    tsb,
    hrv,
    sleepScore,
    bodyBattery,
    stress,
    restingHr,
    vo2Max,
    vo2MaxRunning,
    vo2MaxCycling,
    readinessScore,
    readinessLevel,
    weeklyDistance,
    weeklyTime,
    activities,
  };
};

export async function POST(request: Request) {
  try {
    const body: PlanRequest = await request.json();

    const systemPrompt = `You are an expert endurance coach. Produce a single JSON object describing a 7-day polarized training plan.

CRITICAL FORMATTING RULES:
- Return ONLY a valid JSON object. No markdown, no backticks, no code blocks, no explanation, no commentary.
- Start your response with { and end with }
- Do NOT wrap JSON in triple backticks or markdown
- Do NOT include any text before or after the JSON

SCHEMA:
{ "days": [ { "day": "Monday", "type": "easy|hard|long|rest|tempo", "sport": "run|ride|rest", "duration": 45, "zones": "Z1-Z2", "description": "...", "tss": 40, "workout": { "warmup": "...", "main": "...", "cooldown": "..." } } ] }

REQUIREMENTS:
1) days: array of exactly 7 objects (Monday-Sunday)
2) type: one of easy, hard, long, rest, tempo (lowercase)
3) sport: one of run, ride, rest (lowercase)
4) duration: number (minutes)
5) zones: string (e.g., "Z1-Z2", "Z3", "Zone 2 easy")
6) description: string with workout summary
7) tss: number (training stress score)
8) workout.warmup, workout.main, workout.cooldown: strings or null

TRAINING RULES:
- Keep ~80% easy, ~20% hard sessions
- No hard sessions back-to-back
- Respect user's availability and physical notes`;

    const garminSummary = summarizeGarminForPrompt(body.garmin);
    const userContext = `Garmin summary:\n- CTL: ${garminSummary.ctl ?? 'unknown'}\n- ATL: ${garminSummary.atl ?? 'unknown'}\n- TSB: ${garminSummary.tsb ?? 'unknown'}\n- HRV: ${garminSummary.hrv ?? 'unknown'}\n- Sleep score: ${garminSummary.sleepScore ?? 'unknown'}\n- Body battery: ${garminSummary.bodyBattery ?? 'unknown'}\n- Stress: ${garminSummary.stress ?? 'unknown'}\n- Resting HR: ${garminSummary.restingHr ?? 'unknown'}\n- VO2max: ${garminSummary.vo2Max ?? 'unknown'}\n- VO2max running: ${garminSummary.vo2MaxRunning ?? 'unknown'}\n- VO2max cycling: ${garminSummary.vo2MaxCycling ?? 'unknown'}\n- Training readiness score: ${garminSummary.readinessScore ?? 'unknown'}\n- Training readiness level: ${garminSummary.readinessLevel ?? 'unknown'}\n- Weekly distance: ${garminSummary.weeklyDistance ?? 'unknown'}\n- Weekly time: ${garminSummary.weeklyTime ?? 'unknown'}\nRecent activities:\n${garminSummary.activities.length ? garminSummary.activities.map((activity, index) => `${index + 1}) ${activity.name}, duration ${activity.duration}, distance ${activity.distance}`).join('\n') : 'No recent activities available.'}\nWeekly notes: ${body.weeklyNotes}\nPhysical notes: ${body.physicalNotes || 'none'}\nFeeling: ${body.feeling}\nCurrent focus: ${body.currentFocus || 'unspecified'}\nGoal: ${body.goal || 'general fitness'}`;

    const prompt = `${systemPrompt}\n\n${userContext}\n\nRespond with ONLY a valid JSON object. No markdown, no backticks, no explanation. Start with { and end with }`;

    const validatePlan = (obj: any) => {
      if (!obj || typeof obj !== 'object') return false;
      if (!Array.isArray(obj.days) || obj.days.length !== 7) return false;
      const allowedTypes = ['easy','hard','long','rest','tempo'];
      const allowedSports = ['run','ride','rest'];
      for (const d of obj.days) {
        if (typeof d.day !== 'string') return false;
        if (typeof d.type !== 'string' || !allowedTypes.includes(d.type.toLowerCase())) return false;
        if (typeof d.sport !== 'string' || !allowedSports.includes(d.sport.toLowerCase())) return false;
        if (typeof d.duration !== 'number') return false;
        if (typeof d.zones !== 'string') return false;
        if (typeof d.description !== 'string') return false;
        if (typeof d.tss !== 'number') return false;
        if (!d.workout || typeof d.workout !== 'object') return false;
        if (d.workout.warmup != null && typeof d.workout.warmup !== 'string') return false;
        if (d.workout.main != null && typeof d.workout.main !== 'string') return false;
        if (d.workout.cooldown != null && typeof d.workout.cooldown !== 'string') return false;
      }
      return true;
    };

    const ajv = new Ajv();
    const validate = ajv.compile(weeklyPlanSchema as any);

    let planJson: any = null;
    try {
      planJson = await callClaudeWithRetry(prompt, (obj: any) => validate(obj));
    } catch (err: any) {
      const detail = typeof err === 'object' && err.message ? err.message : String(err);
      return NextResponse.json({ error: 'Unable to obtain valid plan from Claude', detail }, { status: 502 });
    }

    // final validation to include errors
    const valid = validate(planJson);
    if (!valid) {
      const errorDetails = validate.errors?.map((e: any) => `${e.dataPath || 'root'}: ${e.message}`).join('; ') || JSON.stringify(validate.errors);
      return NextResponse.json({ error: 'Plan failed schema validation', detail: errorDetails }, { status: 502 });
    }

    return NextResponse.json({ plan: planJson });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
