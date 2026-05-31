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
    const requestUrl = `${remoteUrl.replace(/\/$/, "")}/training-metrics`;
    const response = await fetch(requestUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Training metrics service returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Normalize and extract the exact fields we need for the dashboard
    const extract = (payload: any) => {
      const out: any = { trainingReadiness: null, trainingLoad: null, raw: payload };

      // training readiness: look for arrays or objects containing score/level
      const trCandidates = [
        payload?.training_readiness?.data,
        payload?.training_readiness,
        payload?.trainingReadiness,
        payload?.trainingReadinessData,
        payload?.training_readiness_data,
        payload,
      ];

      let tr = null;
      for (const c of trCandidates) {
        if (!c) continue;
        if (Array.isArray(c) && c.length && (c[0].score !== undefined || c[0].level !== undefined)) {
          tr = c[0];
          break;
        }
        if (typeof c === "object" && (c.score !== undefined || c.level !== undefined)) {
          tr = c;
          break;
        }
      }

      if (tr) {
        out.trainingReadiness = { score: tr.score ?? null, level: tr.level ?? tr.state ?? null };
      }

      // training load: look for latestTrainingStatusData or nested acuteTrainingLoadDTO
      const tlCandidates = [
        payload?.training_status?.data,
        payload?.training_status,
        payload?.trainingStatus,
        payload?.training_status_data,
        payload?.trainingLoad,
        payload?.training_load,
        payload,
      ];

      let tlFound: any = null;
      const findFromArray = (arr: any) => {
        if (!Array.isArray(arr) || !arr.length) return null;
        const first = arr[0];
        if (!first || typeof first !== "object") return null;
        const acuteDto = first.acuteTrainingLoadDTO ?? first.acuteTrainingLoad ?? first.acuteTrainingLoadDTO;
        if (acuteDto) return { acute: acuteDto.dailyTrainingLoadAcute ?? acuteDto.dailyTrainingLoad ?? acuteDto.acute ?? null, chronic: acuteDto.dailyTrainingLoadChronic ?? acuteDto.dailyTrainingLoadChronic ?? acuteDto.chronic ?? null };
        // fallback: keys on the first element
        return { acute: first.dailyTrainingLoadAcute ?? first.acuteLoad ?? first.acute ?? null, chronic: first.dailyTrainingLoadChronic ?? first.chronicLoad ?? first.chronic ?? null };
      };

      for (const c of tlCandidates) {
        if (!c) continue;
        if (Array.isArray(c)) {
          const r = findFromArray(c);
          if (r) {
            tlFound = r;
            break;
          }
        }

        if (typeof c === "object") {
          // if the object already contains acute/chronic
          if (c.acute !== undefined || c.chronic !== undefined || c.dailyTrainingLoadAcute !== undefined) {
            tlFound = { acute: c.acute ?? c.dailyTrainingLoadAcute ?? c.acuteLoad ?? null, chronic: c.chronic ?? c.dailyTrainingLoadChronic ?? c.chronicLoad ?? null };
            break;
          }

          // if it contains mostRecentTrainingStatus or latestTrainingStatusData
          const latest = c.mostRecentTrainingStatus?.latestTrainingStatusData ?? c.latestTrainingStatusData ?? c.latestTrainingStatus ?? null;
          if (latest && typeof latest === "object") {
            // take first device entry
            const device = Array.isArray(latest) ? latest[0] : Object.values(latest)[0];
            const acuteDto = device?.acuteTrainingLoadDTO ?? device;
            if (acuteDto) {
              tlFound = { acute: acuteDto.dailyTrainingLoadAcute ?? acuteDto.acute ?? null, chronic: acuteDto.dailyTrainingLoadChronic ?? acuteDto.chronic ?? null };
              break;
            }
          }
        }
      }

      if (tlFound) {
        out.trainingLoad = { acute: tlFound.acute ?? null, chronic: tlFound.chronic ?? null };
      }

      return out;
    };

    const normalized = extract(data);
    return NextResponse.json(normalized);
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
