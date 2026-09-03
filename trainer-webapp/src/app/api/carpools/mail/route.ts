import { timingSafeEqual } from "node:crypto";
import { runCarpoolMailWorker } from "@/lib/carpool-mail-worker";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Der Scheduler authentifiziert sich separat; normale Login-Cookies genügen nicht. */
export async function GET(request: Request) {
  const secret = process.env.CARPOOL_CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runCarpoolMailWorker();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json(
      { error: "Carpool mail worker unavailable" },
      { status: 503 },
    );
  }
}
