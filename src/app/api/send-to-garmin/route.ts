import { NextResponse } from 'next/server';

const TRAINING_SERVICE = process.env.TRAINING_METRICS_SERVICE_URL || 'http://localhost:8080';

// Map zone text to Garmin HR zone numbers
const zoneTextToNumber = (zoneText: string): number => {
  const text = zoneText.toUpperCase().trim();
  
  // Z5 or Zone 5
  if (text.includes('Z5') || text.includes('ZONE 5')) return 5;
  
  // Z4-Z5 → use higher zone (4)
  if ((text.includes('Z4') && text.includes('Z5')) || (text.includes('ZONE 4') && text.includes('ZONE 5'))) return 4;
  
  // Z4
  if (text.includes('Z4') || text.includes('ZONE 4')) return 4;
  
  // Z3-Z4 → use higher zone (3)
  if ((text.includes('Z3') && text.includes('Z4')) || (text.includes('ZONE 3') && text.includes('ZONE 4'))) return 3;
  
  // Z3
  if (text.includes('Z3') || text.includes('ZONE 3')) return 3;
  
  // Z1-Z2 → use higher zone (2)
  if ((text.includes('Z1') && text.includes('Z2')) || (text.includes('ZONE 1') && text.includes('ZONE 2'))) return 2;
  
  // Z2
  if (text.includes('Z2') || text.includes('ZONE 2')) return 2;
  
  // Z1
  if (text.includes('Z1') || text.includes('ZONE 1')) return 1;
  
  return 1; // default to Z1
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workout, date } = body;
    
    // Extract zone number from the zones field
    const zoneNumber = workout?.zones ? zoneTextToNumber(workout.zones) : undefined;
    
    // Build steps array from warmup, main, cooldown
    const steps: Array<{type: string, duration: number, zoneNumber?: number}> = [];
    
    if (workout?.warmup) {
      steps.push({ type: 'warmup', duration: 300, zoneNumber: 1 }); // 5 min warmup in Z1
    }
    
    if (workout?.main) {
      steps.push({ type: 'interval', duration: (workout?.duration ?? 40) * 60 * 0.8, zoneNumber: zoneNumber ?? undefined });
    }
    
    if (workout?.cooldown) {
      steps.push({ type: 'cooldown', duration: 300, zoneNumber: 1 }); // 5 min cooldown in Z1
    }
    
    const enrichedWorkout = {
      ...workout,
      steps,
    };
    
    const payload = { workout: enrichedWorkout, date };
    
    console.log('[send-to-garmin] Sending workout to:', `${TRAINING_SERVICE}/send-workout`);
    console.log('[send-to-garmin] Payload:', JSON.stringify(payload, null, 2));

    const resp = await fetch(`${TRAINING_SERVICE.replace(/\/$/, '')}/send-workout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const responsePayload = await resp.json().catch(() => ({}));
    console.log('[send-to-garmin] Response status:', resp.status);
    console.log('[send-to-garmin] Response payload:', JSON.stringify(responsePayload, null, 2));
    
    if (!resp.ok) {
      const errorMsg = responsePayload?.error || 'Failed to send to training service';
      console.error('[send-to-garmin] Error:', errorMsg, 'Detail:', responsePayload);
      return NextResponse.json({ error: errorMsg, detail: responsePayload }, { status: resp.status });
    }
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    const errorMsg = err?.message ?? String(err);
    console.error('[send-to-garmin] Fetch error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
