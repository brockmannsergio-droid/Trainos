import { NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const runLocalTrainingMetrics = async () => {
  const scriptPath = path.join(process.cwd(), "scripts", "training_metrics.py");
  const { stdout, stderr } = await execFileAsync("python3", [scriptPath], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr) {
    console.warn("Python training metrics script stderr:", stderr);
  }

  return JSON.parse(stdout);
};

export async function GET() {
  const remoteUrl = process.env.TRAINING_METRICS_SERVICE_URL;

  if (remoteUrl) {
    const response = await fetch(remoteUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Training metrics service returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const data = await runLocalTrainingMetrics();
      return NextResponse.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      error:
        "Training metrics service is not configured. Set TRAINING_METRICS_SERVICE_URL for production.",
    },
    { status: 500 }
  );
}
