import { NextResponse } from 'next/server';

const TRAINING_SERVICE = process.env.TRAINING_METRICS_SERVICE_URL || 'http://localhost:8080';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[send-to-garmin] Sending workout to:', `${TRAINING_SERVICE}/send-workout`);
    console.log('[send-to-garmin] Payload:', JSON.stringify(body, null, 2));

    const resp = await fetch(`${TRAINING_SERVICE.replace(/\/$/, '')}/send-workout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const payload = await resp.json().catch(() => ({}));
    console.log('[send-to-garmin] Response status:', resp.status);
    console.log('[send-to-garmin] Response payload:', JSON.stringify(payload, null, 2));
    
    if (!resp.ok) {
      const errorMsg = payload?.error || 'Failed to send to training service';
      console.error('[send-to-garmin] Error:', errorMsg, 'Detail:', payload);
      return NextResponse.json({ error: errorMsg, detail: payload }, { status: resp.status });
    }
    return NextResponse.json(payload);
  } catch (err: any) {
    const errorMsg = err?.message ?? String(err);
    console.error('[send-to-garmin] Fetch error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
