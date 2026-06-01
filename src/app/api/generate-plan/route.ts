import { NextResponse } from "next/server";
import { callClaudeWithRetry } from "../../../lib/claude";
import Ajv from 'ajv';
import { weeklyPlanSchema } from '../../../lib/schemas';

type PlanRequest = {
  garmin: Record<string, any>;
  feeling: string;
  availability: string;
  physicalNotes?: string;
  trainingPhase?: string;
  goal?: string;
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

    const userContext = `Garmin metrics: ${JSON.stringify(body.garmin)}\nAvailability/notes: ${body.availability}\nPhysical notes: ${body.physicalNotes || 'none'}\nFeeling: ${body.feeling}\nTraining phase: ${body.trainingPhase || 'unspecified'}\nGoal: ${body.goal || 'general fitness'}`;

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
      return NextResponse.json({ error: 'Unable to obtain valid plan from Claude', detail: String(err) }, { status: 502 });
    }

    // final validation to include errors
    const valid = validate(planJson);
    if (!valid) {
      return NextResponse.json({ error: 'Plan failed schema validation', detail: validate.errors }, { status: 502 });
    }

    return NextResponse.json({ plan: planJson });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
