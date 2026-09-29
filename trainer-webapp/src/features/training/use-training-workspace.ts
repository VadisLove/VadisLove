"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TrainingCommand,
  TrainingReply,
  TrainingWorkspace,
} from "@/domain/training";

type SuccessReply = Extract<TrainingReply, { ok: true }>;

/** Darstellung des Schreibwegs: Kopfzeile, Banner und betroffene Zeile. */
export type SyncState = "idle" | "busy" | "pending" | "conflict";

/**
 * Übernimmt einen Stand aus einem Nebenkanal (Notizen) nur, wenn er keine
 * Session auf eine ältere Revision zurücksetzt. Notizen erhöhen die Revision
 * nicht; gleich alte Stände sind daher gleichwertig und enthalten die Notiz.
 */
function notOlder(next: TrainingWorkspace, current: TrainingWorkspace | null) {
  if (!current) return true;
  return current.sessions.every((session) => {
    const other = next.sessions.find((entry) => entry.id === session.id);
    return !other || other.revision >= session.revision;
  });
}

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
  const [inflight, setInflight] = useState<TrainingCommand | null>(null);
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
    if (lock.current) return false;
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
      return true;
    } catch {
      setMessage("Laden fehlgeschlagen. Bitte erneut versuchen.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  const send = useCallback(async (command: TrainingCommand) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setInflight(command);
    setMessage("Wird gespeichert …");
    let success = false;
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: command.request_id,
          operation: command.operation,
          payload: command.payload,
        }),
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
      setInflight(null);
      setBusy(false);
    }
    return success;
  }, []);

  const run = useCallback(
    async (operation: string, payload: Record<string, unknown>, label?: string) =>
      pending
        ? false
        : send({ request_id: crypto.randomUUID(), operation, payload, label }),
    [pending, send],
  );

  /** Stand aus dem Notizkanal übernehmen, ohne neuere Zähldaten zu überschreiben. */
  const accept = useCallback((workspace: TrainingWorkspace) => {
    setData((current) => (notOlder(workspace, current) ? workspace : current));
  }, []);

  const sync: SyncState = conflict ? "conflict" : pending ? "pending" : busy ? "busy" : "idle";

  return {
    data,
    busy,
    message,
    pending,
    conflict,
    sync,
    /** Command, der gerade gesendet wird oder unbestätigt wartet. */
    current: inflight ?? pending,
    blocked: busy || Boolean(pending),
    run,
    retry: () => (pending ? send(pending) : Promise.resolve(false)),
    load,
    accept,
    clearMessage: () => setMessage(""),
  };
}

export type TrainingChannel = ReturnType<typeof useTrainingWorkspace>;

export type NoteStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

/**
 * Eigener Kanal für Notizen: speichert automatisch nach ~900 ms, blockiert
 * weder Versuchseingaben noch den Übungswechsel. Entwürfe bleiben bei Fehlern
 * und Konflikten erhalten und können erneut gespeichert werden.
 */
export function useNoteChannel(
  sessionId: string,
  accept: (workspace: TrainingWorkspace) => void,
) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, NoteStatus>>({});
  const timers = useRef<Record<string, number>>({});
  const latest = useRef<Record<string, string>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id));
  }, []);

  const save = useCallback(
    async (key: string) => {
      window.clearTimeout(timers.current[key]);
      const note = latest.current[key] ?? "";
      setStatus((current) => ({ ...current, [key]: "saving" }));
      const payload: Record<string, unknown> =
        key === "session"
          ? { session_id: sessionId, note }
          : { session_id: sessionId, exercise_id: key, note };
      try {
        const response = await fetch("/api/training", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: crypto.randomUUID(),
            operation: key === "session" ? "session_note" : "exercise_note",
            payload,
          }),
        });
        const result = (await response.json()) as TrainingReply;
        if (!result.ok) throw Error(result.message);
        accept(result.workspace);
        // Während des Speicherns weitergetippt? Dann bleibt der Entwurf offen.
        setStatus((current) => ({
          ...current,
          [key]: latest.current[key] === note ? "saved" : "dirty",
        }));
        return true;
      } catch {
        setStatus((current) => ({ ...current, [key]: "failed" }));
        return false;
      }
    },
    [sessionId, accept],
  );

  const change = useCallback(
    (key: string, value: string) => {
      latest.current[key] = value;
      setDrafts((current) => ({ ...current, [key]: value }));
      setStatus((current) => ({ ...current, [key]: "dirty" }));
      window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => void save(key), 900);
    },
    [save],
  );

  const values = Object.values(status);
  return {
    drafts,
    status,
    change,
    save,
    busy: values.some((value) => value === "dirty" || value === "saving"),
    failed: values.some((value) => value === "failed"),
  };
}
