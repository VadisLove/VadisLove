import Link from "next/link";
import { getCarpools } from "@/data/carpool-repository";
import { CarpoolPanel } from "@/features/carpools/carpool-panel";
import { carpoolCopy } from "@/features/carpools/carpool-copy";
import { getLocale } from "@/i18n/server";

/** Eigener Deep-Link funktioniert auch für Eltern ohne Zugriff auf den Termin. */
export default async function CarpoolPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; ride?: string }>;
}) {
  const params = await searchParams;
  const eventId = typeof params.event === "string" ? params.event : undefined;
  const rideId = typeof params.ride === "string" ? params.ride : undefined;
  const [initial, locale] = await Promise.all([
    getCarpools(eventId, rideId),
    getLocale(),
  ]);
  const copy = carpoolCopy(locale);
  return (
    <>
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <Link href="/kalender">{copy.back}</Link>
      <CarpoolPanel eventId={eventId} rideId={rideId} initial={initial} />
    </>
  );
}
