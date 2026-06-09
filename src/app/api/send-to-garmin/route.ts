import { NextResponse } from 'next/server';

const TRAINING_SERVICE = process.env.TRAINING_METRICS_SERVICE_URL || 'http://localhost:8080';

const zoneTextToNumber = (zoneText: string): number => {
  const text = zoneText.toUpperCase().trim();
  if (text.includes('Z5')) return 5;
  if (text.includes('Z4')) return 4;
  if (text.includes('Z3')) return 3;
  if (text.includes('Z2')) return 2;
  if (text.includes('Z1')) return 1;
  return 2;
};

const parseDuration = (text: string): number => {
  const match = text?.match(/(\d+)\s*min/i);
  return match ? parseInt(match[1]) * 60 : 10 * 60;
};

// Parse interval structure from main set text
// e.g. "8x3 min hard efforts with 2 min easy recovery"
const parseIntervals = (mainText: string): { reps: number, workDuration: number, restDuration: number } | null => {
  const match = mainText?.match(/(\d+)\s*[x×]\s*(\d+)\s*min/i);
  if (!match) return null;
  const reps = parseInt(match[1]);
  const workDuration = parseInt(match[2]) * 60;
  const restMatch = mainText.match(/(?:with|\+|,)?\s*(\d+)\s*min(?:ute)?s?\s*(?:easy|recovery|rest|jog|between|active)/i);
  const restDuration = restMatch ? parseInt(restMatch[1]) * 60 : 90;
  return { reps, workDuration, restDuration };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workout, date } = body;

    const workoutSteps = workout?.workout ?? workout;
    const totalDuration = (workout?.duration ?? 40) * 60;
    const zoneNumber = workout?.zones ? zoneTextToNumber(workout.zones) : 2;

    const warmupDuration = workoutSteps?.warmup ? parseDuration(workoutSteps.warmup) : 10 * 60;
    const cooldownDuration = workoutSteps?.cooldown ? parseDuration(workoutSteps.cooldown) : 10 * 60;
    const mainDuration = Math.max(totalDuration - warmupDuration - cooldownDuration, 60);

    // Try to parse intervals from main set
    const intervals = workoutSteps?.main ? parseIntervals(workoutSteps.main) : null;

    const steps: Array<{type: string, duration: number, zoneNumber?: number, reps?: number, restDuration?: number}> = [];

    if (workoutSteps?.warmup) {
      steps.push({ type: 'warmup', duration: warmupDuration, zoneNumber: 1 });
    }

    if (intervals) {
      // Send as interval repeat
      steps.push({ 
        type: 'repeat', 
        duration: intervals.workDuration, 
        zoneNumber: zoneNumber ?? undefined,
        reps: intervals.reps,
        restDuration: intervals.restDuration
      });
    } else if (workoutSteps?.main) {
      steps.push({ type: 'interval', duration: mainDuration, zoneNumber: zoneNumber ?? undefined });
    }

    if (workoutSteps?.cooldown) {
      steps.push({ type: 'cooldown', duration: cooldownDuration, zoneNumber: 1 });
    }

    const workoutName = `TrainOS - ${workout?.day ?? ''} ${workout?.type ?? ''} ${workout?.sport ?? ''}`
      .replace(/\s+/g, ' ').trim();

    const enrichedWorkout = {
      ...workout,
      name: workoutName,
      steps,
    };

    const payload = { workout: enrichedWorkout, date };

    console.log('[send-to-garmin] Payload:', JSON.stringify(payload, null, 2));

    const resp = await fetch(`${TRAINING_SERVICE.replace(/\/$/, '')}/send-workout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responsePayload = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return NextResponse.json({ error: responsePayload?.error || 'Failed to send' }, { status: resp.status });
    }
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
