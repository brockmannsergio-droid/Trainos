import { NextResponse } from "next/server";
import Ajv from 'ajv';
import { callClaudeWithRetry } from "../../../lib/claude";
import { adaptedWorkoutSchema } from "../../../lib/schemas";

type AdaptRequest = {
  feeling: string;
  note?: string;
  garmin?: Record<string, any>;
  todayWorkout?: Record<string, any> | null;
};

export async function POST(request: Request) {
  try {
    const body: AdaptRequest = await request.json();

    const apiKey = process.env.CLAUDE_API_KEY;
    const apiUrl = process.env.CLAUDE_API_URL || "https://api.anthropic.com/v1/complete";
    if (!apiKey) return NextResponse.json({ error: "Claude API key not configured" }, { status: 500 });

    const systemPrompt = `You are an experienced endurance coach. Given today's planned workout and the user's morning check-in (feeling and note) plus Garmin metrics, adapt only today's workout. Return a JSON object with this exact shape:{"adapted": {"duration": 45, "intensity": "easy|moderate|hard", "notes": "...", "tss": 30, "warmup": "...", "main": "...", "cooldown": "..."}, "explanation":"short human text"}. Return ONLY valid JSON.`;

    const userContext = `Feeling: ${body.feeling}\nNote: ${body.note || ''}\nGarmin: ${JSON.stringify(body.garmin || {})}\nToday's planned workout: ${JSON.stringify(body.todayWorkout || null)}`;

    const prompt = `${systemPrompt}\n\n${userContext}\n\nRespond with JSON only.`;

    const ajv = new Ajv();
    const validate = ajv.compile(adaptedWorkoutSchema as any);

    let parsed: any = null;
    try {
      parsed = await callClaudeWithRetry(prompt, (obj: any) => validate(obj));
    } catch (err: any) {
      return NextResponse.json({ error: 'Unable to parse valid adapted workout from Claude', detail: String(err) }, { status: 502 });
    }

    const valid = validate(parsed);
    if (!valid) {
      return NextResponse.json({ error: 'Adapted workout failed schema validation', detail: validate.errors }, { status: 502 });
    }

    return NextResponse.json({ adapted: parsed.adapted, explanation: parsed.explanation ?? null, original: body.todayWorkout ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
