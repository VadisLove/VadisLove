import { timingSafeEqual } from "node:crypto";
import { runOnboardingCleanupWorker } from "@/lib/onboarding-cleanup-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Nur der später konfigurierte Scheduler darf verwaiste Konten bereinigen. */
export async function GET(request: Request) {
  const secret = process.env.ONBOARDING_CLEANUP_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);

  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runOnboardingCleanupWorker();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json(
      { error: "Onboarding cleanup unavailable" },
      { status: 503 },
    );
  }
}
