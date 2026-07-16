"use client";

import { useActionState } from "react";
import { BellRing, CalendarDays, CheckCircle2, ClipboardList, ShieldCheck, UsersRound } from "lucide-react";
import {
  saveNotificationPreferences,
  type SettingsActionState,
} from "@/app/einstellungen/actions";
import { PageHeader } from "@/components/ui/page-header";
import { useCurrentUser } from "@/components/auth/current-user-context";
import type { NotificationPreferences } from "@/domain/models";
import type { EvaluationSkillDefinition, EvaluationWeights } from "@/domain/models";
import { EvaluationSettings } from "./evaluation-settings";
import styles from "./settings-view.module.css";

const initialState: SettingsActionState = { status: "idle", message: "" };

const options = [
  {
    name: "relationshipRequests",
    preference: "relationshipRequests",
    title: "Neue Anfragen",
    description: "Freundschaften, Trainer–Athlet-Verbindungen und Beitrittsanfragen.",
    icon: UsersRound,
  },
  {
    name: "requestUpdates",
    preference: "requestUpdates",
    title: "Antworten auf meine Anfragen",
    description: "Bestätigungen und Ablehnungen zu gesendeten Anfragen.",
    icon: CheckCircle2,
  },
  {
    name: "groupActivity",
    preference: "groupActivity",
    title: "Gruppenaktivität",
    description: "Einladungen und wichtige Änderungen in deinen Gruppen.",
    icon: BellRing,
  },
  {
    name: "newEvents",
    preference: "newEvents",
    title: "Neue Termine und Trainings",
    description: "Wenn Kontakte, Trainer oder Gruppenmitglieder einen Termin anlegen.",
    icon: CalendarDays,
  },
  {
    name: "trainingPlans",
    preference: "trainingPlans",
    title: "Geteilte Trainingspläne",
    description: "Wenn eine Person oder Gruppe einen Trainingsplan mit dir teilt.",
    icon: ClipboardList,
  },
  {
    name: "guardianActivity",
    preference: "guardianActivity",
    title: "Aktivitäten verknüpfter Athleten",
    description: "Hinweise für Eltern, ohne die selbstständigen Aktionen des Athleten zu blockieren.",
    icon: ShieldCheck,
  },
] as const;

/** Einstellungsseite fuer alle aktuell erzeugten In-App-Hinweise. */
export function SettingsView({
  preferences,
  evaluationPreferences,
}: {
  preferences: NotificationPreferences;
  evaluationPreferences: { skills: EvaluationSkillDefinition[]; weights: EvaluationWeights };
}) {
  const currentUser = useCurrentUser();
  const [state, action, pending] = useActionState(saveNotificationPreferences, initialState);

  return (
    <>
      <PageHeader
        title="Einstellungen"
        description="Lege fest, welche Aktivitäten in deiner Glocke erscheinen."
      />
      <div className={styles.settingsStack}>
      <form action={action} className={styles.settingsCard}>
        <header>
          <span><BellRing size={22} /></span>
          <div>
            <h2>Benachrichtigungen</h2>
            <p>Änderungen gelten für neue Hinweise. Bereits vorhandene Meldungen bleiben im Postfach.</p>
          </div>
        </header>

        <div className={styles.optionList}>
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <label key={option.name} className={styles.option}>
                <span className={styles.optionIcon}><Icon size={19} /></span>
                <span className={styles.optionText}>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <input
                  type="checkbox"
                  name={option.name}
                  defaultChecked={preferences[option.preference]}
                />
                <span className={styles.switch} aria-hidden="true" />
              </label>
            );
          })}
        </div>

        <footer>
          {state.message ? (
            <p className={state.status === "error" ? styles.error : styles.success} aria-live="polite">
              {state.message}
            </p>
          ) : <span />}
          <button type="submit" disabled={pending}>
            {pending ? "Wird gespeichert ..." : "Einstellungen speichern"}
          </button>
        </footer>
      </form>
      {currentUser?.accountType !== "athlete" ? <EvaluationSettings
        initialSkills={evaluationPreferences.skills}
        initialWeights={evaluationPreferences.weights}
      /> : null}
      </div>
    </>
  );
}
