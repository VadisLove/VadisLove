"use client";
import Link from "next/link";
import { CarFront } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { carpoolCopy } from "./carpool-copy";
import styles from "./carpool.module.css";

/** Gemeinsamer direkter Einstieg für Dashboard und Terminkarte. */
export function CarpoolEntry({ eventId }: { eventId: string }) {
  const { locale } = useI18n();
  return (
    <Link
      className={styles.entry}
      href={`/fahrgemeinschaften?event=${encodeURIComponent(eventId)}`}
    >
      <CarFront size={20} aria-hidden="true" />
      {carpoolCopy(locale).open}
    </Link>
  );
}
