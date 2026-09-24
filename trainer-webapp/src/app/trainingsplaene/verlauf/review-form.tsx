"use client";

import { useActionState, useState } from "react";
import { addReview } from "./actions";
import { reviewLabels, type SessionRecap } from "@/domain/training-recap";

/** Neue Einträge und Korrekturen verwenden denselben nachvollziehbaren Schreibweg. */
export function ReviewForm({ recap, requestId }: { recap: SessionRecap; requestId: string }) {
  const [state, action, pending] = useActionState(addReview, { message: "" });
  const [kind, setKind] = useState(recap.can_review ? "hint" : "request");
  const [exercise, setExercise] = useState("");
  const [body, setBody] = useState("");
  const [replaces, setReplaces] = useState("");
  const allowed = Object.keys(reviewLabels).filter(k => k === "request" || (k === "confirmation" ? recap.can_confirm : recap.can_review));
  const correctable = recap.reviews.filter(r => allowed.includes(r.kind) && !recap.reviews.some(n => n.supersedes === r.id));
  return <details>
    <summary>Hinweis, Ziel oder Fortschritt ergänzen</summary>
    <p>Diese Angaben sind für den Athleten, berechtigte Trainer und verknüpfte Eltern sichtbar. Nur Angaben zu {recap.athlete_name} eintragen. Korrekturen erhalten den ursprünglichen Eintrag.</p>
    <form action={action}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="participant" value={recap.participant_id} />
      <fieldset disabled={pending}>
        <label>Neuer Eintrag oder Korrektur<select name="replaces" value={replaces} onChange={e => {
          const id = e.target.value; setReplaces(id);
          const old = recap.reviews.find(r => r.id === id);
          if (old) { setKind(old.kind); setExercise(old.exercise_id ?? ""); setBody(old.body); }
        }}><option value="">Neuer Eintrag</option>{correctable.map(r => <option key={r.id} value={r.id}>{reviewLabels[r.kind]}: {r.body.slice(0, 65)}</option>)}</select></label>
        <label>Art<select name="kind" value={kind} onChange={e => { setKind(e.target.value); setReplaces(""); }}>
          {allowed.map(k => <option key={k} value={k}>{reviewLabels[k as keyof typeof reviewLabels]}</option>)}
        </select></label>
        <label>Übung / Skill<select name="exercise" value={exercise} required={kind === "request" || kind === "confirmation"} onChange={e => { setExercise(e.target.value); setReplaces(""); }}>
          <option value="">Gesamte Session</option>{recap.exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select></label>
        <label>Persönlicher Hinweis / Begründung<textarea name="body" value={body} onChange={e => setBody(e.target.value)} required maxLength={4000} rows={3} /></label>
        <button type="submit">{pending ? "Wird gespeichert …" : "Ergänzung speichern"}</button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  </details>;
}
