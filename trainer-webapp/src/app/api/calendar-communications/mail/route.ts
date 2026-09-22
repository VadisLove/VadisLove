import { timingSafeEqual } from "node:crypto";
import { runCalendarMailWorker } from "@/lib/calendar-mail-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Der vorhandene Cron-Schlüssel schützt auch den getrennten Kalender-Worker. */
export async function GET(request: Request) {
  const secret = process.env.CARPOOL_CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runCalendarMailWorker();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json({ error: "Calendar mail worker unavailable" }, { status: 503 });
  }
}
