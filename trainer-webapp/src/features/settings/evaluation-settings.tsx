"use client";

import { useState, useTransition } from "react";
import { BarChart3, Eye, EyeOff, Plus, Save, SlidersHorizontal } from "lucide-react";
import { saveEvaluationSettings, type EvaluationActionResult } from "@/app/auswertung/actions";
import type { EvaluationSkillCategory, EvaluationSkillDefinition, EvaluationWeights } from "@/domain/models";
import styles from "./evaluation-settings.module.css";

const categoryLabels: Record<EvaluationSkillCategory, string> = {
  skateboarding: "Skateboarding",
  mental: "Mental",
  athletic: "Athletik",
};

/** Trainerbezogene Konfiguration; keine Aenderung ist fuer andere Trainer sichtbar. */
export function EvaluationSettings({
  initialSkills,
  initialWeights,
}: {
  initialSkills: EvaluationSkillDefinition[];
  initialWeights: EvaluationWeights;
}) {
  const [skills, setSkills] = useState(initialSkills);
  const [weights, setWeights] = useState(initialWeights);
  const [result, setResult] = useState<EvaluationActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const total = weights.attendance + weights.contests + weights.tasks + weights.skills;

  const updateSkill = (key: string, patch: Partial<EvaluationSkillDefinition>) => {
    setSkills((current) => current.map((skill) => skill.key === key ? { ...skill, ...patch } : skill));
  };

  const addSkill = () => {
    const category: EvaluationSkillCategory = "skateboarding";
    setSkills((current) => [...current, {
      key: `custom-${crypto.randomUUID()}`,
      label: "Neuer Skill",
      category,
      visible: true,
      sortOrder: Math.max(0, ...current.filter((skill) => skill.category === category).map((skill) => skill.sortOrder)) + 10,
      custom: true,
    }]);
  };

  const save = () => {
    startTransition(async () => setResult(await saveEvaluationSettings({ weights, skills })));
  };

  return (
    <section className={styles.card}>
      <header>
        <span><SlidersHorizontal size={22} /></span>
        <div><h2>Auswertung</h2><p>Gewichtung und Skill-Katalog gelten nur für dein Trainerkonto.</p></div>
      </header>

      <div className={styles.weightSection}>
        <div className={styles.sectionTitle}><BarChart3 size={18} /><div><h3>Overall-Gewichtung</h3><p>Alle vier Werte müssen zusammen 100 % ergeben.</p></div><strong className={total === 100 ? styles.validTotal : styles.invalidTotal}>{total}%</strong></div>
        <div className={styles.weightGrid}>
          {([
            ["attendance", "Trainingsanwesenheit"], ["contests", "Contest-Erfolge"],
            ["tasks", "Aufgaben & Ziele"], ["skills", "Skill-Bewertungen"],
          ] as const).map(([key, label]) => <label key={key}>{label}<span><input type="number" min="0" max="100" value={weights[key]} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} /><b>%</b></span></label>)}
        </div>
      </div>

      <div className={styles.skillSection}>
        <div className={styles.sectionTitle}><div><h3>Skill-Katalog</h3><p>Skills ausblenden, umbenennen oder persönliche Skills ergänzen.</p></div><button type="button" onClick={addSkill}><Plus size={16} /> Skill anlegen</button></div>
        <div className={styles.skillList}>
          {skills.map((skill) => (
            <div className={styles.skillRow} key={skill.key}>
              <button type="button" className={skill.visible ? styles.visibleButton : styles.hiddenButton} onClick={() => updateSkill(skill.key, { visible: !skill.visible })} aria-label={skill.visible ? `${skill.label} ausblenden` : `${skill.label} einblenden`}>{skill.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <input value={skill.label} onChange={(event) => updateSkill(skill.key, { label: event.target.value })} />
              <select value={skill.category} onChange={(event) => updateSkill(skill.key, { category: event.target.value as EvaluationSkillCategory })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <small>{skill.custom ? "Eigener Skill" : "Standard"}</small>
            </div>
          ))}
        </div>
      </div>

      <footer>
        {result ? <p className={result.status === "error" ? styles.error : styles.success} aria-live="polite">{result.message}</p> : <span />}
        <button type="button" onClick={save} disabled={pending || total !== 100}><Save size={16} /> {pending ? "Wird gespeichert …" : "Auswertung speichern"}</button>
      </footer>
    </section>
  );
}
