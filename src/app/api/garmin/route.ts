import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export async function GET() {
  const { GARMIN_EMAIL, GARMIN_PASSWORD } = process.env;

  if (!GARMIN_EMAIL || !GARMIN_PASSWORD) {
    return NextResponse.json(
      {
        error:
          "Missing Garmin credentials. Add GARMIN_EMAIL and GARMIN_PASSWORD to .env.local and restart the Next.js server.",
      },
      { status: 500 }
    );
  }

  const scriptPath = path.resolve(process.cwd(), "scripts", "garmin_fetch.py");

  try {
    const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
      env: {
        ...process.env,
        GARMIN_EMAIL,
        GARMIN_PASSWORD,
      },
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Log stderr for debugging
    if (stderr) {
      console.error("[Garmin API Debug]", stderr);
    }

    if (stderr) {
      try {
        const errorPayload = JSON.parse(stderr);
        if (errorPayload?.error) {
          return NextResponse.json({ error: errorPayload.error }, { status: 500 });
        }
      } catch {
        // ignore non-json stderr
      }
    }

    const data = JSON.parse(stdout);
    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while running Garmin fetch script.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
