import { NextResponse } from 'next/server';

const PY_SERVICE = process.env.PYTHON_SERVICE_URL || 'http://localhost:8080';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resp = await fetch(`${PY_SERVICE.replace(/\/$/, '')}/send-workout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return NextResponse.json({ error: payload?.error || 'Failed to send to python service', detail: payload }, { status: resp.status });
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
