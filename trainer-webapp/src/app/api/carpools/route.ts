import { NextRequest, NextResponse } from "next/server";
import { getCarpools } from "@/data/carpool-repository";

/** Lesender Endpunkt für den beim Öffnen eines Termins geladenen Bereich. */
export async function GET(request: NextRequest) {
  const result = await getCarpools(
    request.nextUrl.searchParams.get("event") || undefined,
    request.nextUrl.searchParams.get("ride") || undefined,
  );
  return NextResponse.json(result, {
    status: result.error ? 400 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
