import { timingSafeEqual } from "node:crypto";
import { runTrainingVideoCleanupWorker } from "@/lib/training-video-cleanup-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Täglicher Aufruf durch pg_cron; geschützt mit dem vorhandenen Cron-Schlüssel. */
export async function GET(request: Request) {
  const secret = process.env.CARPOOL_CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runTrainingVideoCleanupWorker();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json({ error: "Training video cleanup unavailable" }, { status: 503 });
  }
}
