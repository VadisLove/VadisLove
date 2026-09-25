"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TrainingCommand,
  TrainingReply,
  TrainingWorkspace,
} from "@/domain/training";

type SuccessReply = Extract<TrainingReply, { ok: true }>;

/**
 * Gemeinsamer Schreibweg für Pläne und Live-Trainings über `/api/training`.
 *
 * Ein bestätigter Serverstand ist die einzige Quelle für angezeigte Werte.
 * Scheitert ein Command, bleibt er unverändert als `pending` erhalten, damit er
 * mit derselben Request-ID gefahrlos erneut gesendet werden kann.
 */
export function useTrainingWorkspace(
  initial: TrainingWorkspace | null,
  onSuccess?: (command: TrainingCommand, reply: SuccessReply) => void,
) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState(
    initial ? "" : "Trainings konnten nicht geladen werden.",
  );
  const [pending, setPending] = useState<TrainingCommand | null>(null);
  const [conflict, setConflict] = useState(false);
  const successRef = useRef(onSuccess);

  useEffect(() => {
    successRef.current = onSuccess;
  }, [onSuccess]);

  // Neue Serverdaten (z. B. nach router.refresh) ersetzen den lokalen Stand,
  // solange gerade kein Command unterwegs ist (Abgleich während des Renderns).
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    if (initial && !busy) setData(initial);
  }

  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/training", { cache: "no-store" });
      if (!response.ok) throw Error();
      setData(await response.json());
      setPending(null);
      setConflict(false);
      setMessage(
        "Aktueller Stand geladen. Offene Eingaben bitte vergleichen und bei Bedarf erneut speichern.",
      );
    } catch {
      setMessage("Laden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  const send = useCallback(async (command: TrainingCommand) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("Wird gespeichert …");
    let success = false;
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as TrainingReply;
      if (!result.ok) {
        setPending(command);
        setConflict(Boolean(result.conflict));
        setMessage(result.message);
      } else {
        setData(result.workspace);
        setPending(null);
        setConflict(false);
        setMessage("");
        successRef.current?.(command, result);
        success = true;
      }
    } catch {
      setPending(command);
      setMessage(
        "Noch nicht gespeichert oder bestätigt. Lass die Seite offen und versuche es erneut.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
    return success;
  }, []);

  const run = useCallback(
    async (operation: string, payload: Record<string, unknown>) =>
      pending
        ? false
        : send({ request_id: crypto.randomUUID(), operation, payload }),
    [pending, send],
  );

  return {
    data,
    busy,
    message,
    pending,
    conflict,
    blocked: busy || Boolean(pending),
    run,
    retry: () => (pending ? send(pending) : Promise.resolve(false)),
    load,
    clearMessage: () => setMessage(""),
  };
}
