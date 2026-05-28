import { NextResponse } from "next/server";

// Proxy to Python serverless function that runs the Garmin fetch logic.
// On Vercel the Python function is available at /api/garmin_func; in
// development we call the local dev server.
export async function GET() {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT ?? 3000}`;
    const url = `${base}/api/garmin_func`;

    const resp = await fetch(url, {
      method: "GET",
      headers: { "x-internal-proxy": "1" },
    });

    const text = await resp.text();

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON response from Python function." }, { status: 502 });
    }

    if (!resp.ok) {
      return NextResponse.json({ error: data?.error || 'Python function error' }, { status: resp.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
