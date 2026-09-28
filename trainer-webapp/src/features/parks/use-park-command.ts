"use client";

import { useRef, useState } from "react";

interface PendingCommand {
  request_id: string;
  operation: string;
  payload: Record<string, unknown>;
  reload?: string | null;
}

export interface CommandOutcome<S> {
  ok: boolean;
  result?: Record<string, string>;
  state?: S | null;
  conflict?: boolean;
  message?: string;
}

/**
 * Führt Park-Commands über `/api/parks` aus.
 * Scheitert die Übertragung, bleibt der identische Command (gleiche Request-ID)
 * für „Erneut versuchen“ erhalten, damit nichts doppelt gespeichert wird.
 */
export function useParkCommand<S>() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState<PendingCommand | null>(null);
  const lock = useRef(false);

  async function send(command: PendingCommand): Promise<CommandOutcome<S>> {
    if (lock.current) return { ok: false, message: "Bitte kurz warten." };
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/parks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const outcome = (await response.json()) as CommandOutcome<S>;
      if (outcome.ok) setFailed(null);
      else {
        // Fachliche Ablehnungen nicht wiederholen, nur Übertragungsfehler.
        setFailed(response.status >= 500 ? command : null);
        setMessage(outcome.message ?? "Speichern fehlgeschlagen.");
      }
      return outcome;
    } catch {
      setFailed(command);
      setMessage("Speicherung nicht bestätigt. Bitte erneut versuchen.");
      return { ok: false };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    message,
    setMessage,
    canRetry: failed !== null,
    run: (
      operation: string,
      payload: Record<string, unknown>,
      reload?: string | null,
    ) =>
      send({ request_id: crypto.randomUUID(), operation, payload, reload }),
    retry: () =>
      failed ? send(failed) : Promise.resolve({ ok: false } as CommandOutcome<S>),
  };
}
