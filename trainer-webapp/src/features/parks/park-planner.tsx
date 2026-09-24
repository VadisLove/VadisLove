"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  clampToPark,
  createObstacle,
  defaultRunPoints,
  formatScore,
  missingObstacleSteps,
  obstacleName,
  parseScore,
  snap,
  stepLabel,
  type ParkDetail,
  type ParkRun,
  type Point,
  type TrickCategory,
} from "@/domain/parks";
import { ParkEditorPanel, type ParkDraft } from "./park-editor-panel";
import type { ScenePlacement } from "./park-scene";
import { RunEditorPanel, type RunDraft } from "./run-editor-panel";
import { useParkCommand } from "./use-park-command";
import styles from "./parks.module.css";

// three.js benötigt WebGL im Browser; die Szene wird deshalb nur clientseitig geladen.
const ParkScene = dynamic(() => import("./park-scene"), {
  ssr: false,
  loading: () => <div className={styles.loadingStage}>3D-Ansicht wird geladen …</div>,
});

type Mode = "view" | "park" | "run";
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

function runToDraft(run: ParkRun): RunDraft {
  return {
    run_id: run.id,
    revision: run.revision,
    park_version_id: run.park_version_id,
    athlete_user_id: run.athlete.user_id ?? "",
    title: run.title,
    event_id: run.event_id,
    start: run.start_point,
    end: run.end_point,
    target_score: run.target_score === null ? "" : String(run.target_score).replace(".", ","),
    actual_score: run.actual_score === null ? "" : String(run.actual_score).replace(".", ","),
    note: run.note,
    steps: run.steps.map((s) => ({
      key: crypto.randomUUID(),
      obstacle_id: s.obstacle_id,
      trick_id: s.trick_id,
      trick_name: s.trick_name,
      stance: s.stance,
      direction: s.direction,
      note: s.note,
    })),
  };
}

/**
 * Parkansicht mit drei Modi (Schritt 7):
 * - Ansehen: Park, Runs, Trickfolge und Scores – keine Bearbeitungswerkzeuge.
 * - Park bearbeiten: Bibliothek, Maße und Luftbild; Speichern erzeugt eine neue Version.
 * - Run planen/bearbeiten: Tricks an Obstacles pinnen, Reihenfolge, Start und Ziel.
 */
export function ParkPlannerView({
  initial,
  initialEdit = false,
  initialRunId = null,
}: {
  initial: ParkDetail;
  initialEdit?: boolean;
  initialRunId?: string | null;
}) {
  const [detail, setDetail] = useState(initial);
  const latest = detail.versions.find((v) => v.version_number === detail.park.latest_version)!;
  const [mode, setMode] = useState<Mode>(initialEdit && initial.park.can_edit ? "park" : "view");
  const [topView, setTopView] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [parkDraft, setParkDraft] = useState<ParkDraft | null>(() =>
    initialEdit && initial.park.can_edit
      ? { name: initial.park.name, location: initial.park.location, content: structuredClone(latest.content) }
      : null,
  );
  const [selectedObstacle, setSelectedObstacle] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [runDraft, setRunDraft] = useState<RunDraft | null>(null);
  const [placing, setPlacing] = useState<ScenePlacement>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const command = useParkCommand<ParkDetail>();

  const selectedRun = detail.runs.find((r) => r.id === selectedRunId) ?? null;
  const versionById = useMemo(
    () => new Map(detail.versions.map((v) => [v.id, v])),
    [detail.versions],
  );
  const aerialUrls = { ...detail.aerialUrls, ...previews };

  // Welche Parkversion wird gerade gezeigt?
  const content =
    mode === "park" && parkDraft
      ? parkDraft.content
      : mode === "run" && runDraft
        ? (versionById.get(runDraft.park_version_id)?.content ?? latest.content)
        : selectedRun
          ? (versionById.get(selectedRun.park_version_id)?.content ?? latest.content)
          : latest.content;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || command.busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, command.busy]);

  function selectRun(id: string | null) {
    setSelectedRunId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("run", id);
    else url.searchParams.delete("run");
    url.searchParams.delete("bearbeiten");
    window.history.replaceState(null, "", url);
  }

  function leaveEditing() {
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setMode("view");
    setParkDraft(null);
    setRunDraft(null);
    setPlacing(null);
    setActiveStep(null);
    setSelectedObstacle(null);
    setDirty(false);
    command.setMessage("");
    setConflict(false);
    selectRun(selectedRunId);
  }

  async function reload() {
    const response = await fetch(`/api/parks?park=${detail.park.id}`, { cache: "no-store" });
    if (!response.ok) return command.setMessage("Laden fehlgeschlagen. Bitte erneut versuchen.");
    setDetail(await response.json());
    setConflict(false);
    command.setMessage("Aktueller Stand geladen. Prüfe deine Eingaben und speichere erneut.");
  }

  function applyOutcome(outcome: { ok: boolean; state?: ParkDetail | null; conflict?: boolean }) {
    if (outcome.state) setDetail(outcome.state);
    setConflict(Boolean(outcome.conflict));
    return outcome.ok;
  }

  // ----- Park bearbeiten -----
  function startParkEdit() {
    setParkDraft({ name: detail.park.name, location: detail.park.location, content: structuredClone(latest.content) });
    setSelectedObstacle(null);
    selectRun(null);
    setMode("park");
  }
  function updateParkDraft(next: ParkDraft) {
    setParkDraft(next);
    setDirty(true);
  }
  function moveObstacle(id: string, point: Point) {
    if (!parkDraft) return;
    const p = clampToPark({ x: snap(point.x), z: snap(point.z) }, parkDraft.content.size);
    updateParkDraft({
      ...parkDraft,
      content: {
        ...parkDraft.content,
        obstacles: parkDraft.content.obstacles.map((o) => (o.id === id ? { ...o, ...p } : o)),
      },
    });
  }
  async function saveParkDraft() {
    if (!parkDraft) return;
    if (!parkDraft.name.trim()) return command.setMessage("Bitte einen Parknamen angeben.");
    if (parkDraft.content.aerial && !parkDraft.content.aerial.rightsConfirmed)
      return command.setMessage("Bitte bestätige, dass du das Luftbild verwenden darfst.");
    const outcome = await command.run(
      "park_save",
      {
        park_id: detail.park.id,
        revision: detail.park.latest_version,
        name: parkDraft.name.trim(),
        location: parkDraft.location.trim(),
        content: parkDraft.content,
      },
      detail.park.id,
    );
    if (applyOutcome(outcome)) {
      setDirty(false);
      setParkDraft(null);
      setSelectedObstacle(null);
      setMode("view");
      command.setMessage("");
    }
  }

  // ----- Runs -----
  function startRun() {
    const points = defaultRunPoints(latest.content.size);
    setRunDraft({
      run_id: crypto.randomUUID(),
      revision: 0,
      park_version_id: latest.id,
      athlete_user_id: detail.athletes[0]?.id ?? detail.user.id,
      title: `Run ${detail.runs.length + 1}`,
      event_id: null,
      start: points.start,
      end: points.end,
      target_score: "",
      actual_score: "",
      note: "",
      steps: [],
    });
    setActiveStep(null);
    setPlacing(null);
    selectRun(null);
    setMode("run");
  }
  function editRun(run: ParkRun) {
    setRunDraft(runToDraft(run));
    setActiveStep(null);
    setPlacing(null);
    setMode("run");
  }
  function updateRunDraft(next: RunDraft) {
    setRunDraft(next);
    setDirty(true);
  }
  function addStep(obstacleId: string) {
    if (!runDraft) return;
    updateRunDraft({
      ...runDraft,
      steps: [
        ...runDraft.steps,
        { key: crypto.randomUUID(), obstacle_id: obstacleId, trick_id: null, trick_name: "", stance: null, direction: null, note: "" },
      ],
    });
    setActiveStep(runDraft.steps.length);
  }
  function placePoint(point: Point) {
    if (!runDraft || !placing) return;
    const p = clampToPark({ x: snap(point.x), z: snap(point.z) }, content.size);
    updateRunDraft({ ...runDraft, [placing]: p });
    setPlacing(null);
  }
  async function suggestTrick(index: number, name: string, category: TrickCategory) {
    const outcome = await command.run("trick_suggest", { name, category }, detail.park.id);
    if (!applyOutcome(outcome) || !runDraft || !outcome.result) return;
    const trickId = outcome.result.trick_id;
    setRunDraft((d) =>
      d && {
        ...d,
        steps: d.steps.map((s, i) => (i === index ? { ...s, trick_id: trickId, trick_name: name } : s)),
      },
    );
  }
  async function saveRun() {
    if (!runDraft) return;
    const target = parseScore(runDraft.target_score);
    const actual = parseScore(runDraft.actual_score);
    if (!runDraft.title.trim()) return command.setMessage("Bitte einen Titel angeben.");
    if (runDraft.steps.length === 0) return command.setMessage("Füge mindestens einen Trick hinzu.");
    const open = runDraft.steps.findIndex((s) => !s.trick_id);
    if (open >= 0) {
      setActiveStep(open);
      return command.setMessage(`Bitte für Schritt ${open + 1} einen Trick aus dem Katalog wählen oder vorschlagen.`);
    }
    if (target === "invalid" || actual === "invalid")
      return command.setMessage("Scores müssen Zahlen zwischen 0 und 1000 sein.");
    const outcome = await command.run(
      "run_save",
      {
        run_id: runDraft.run_id,
        revision: runDraft.revision,
        park_version_id: runDraft.park_version_id,
        athlete_user_id: runDraft.athlete_user_id,
        title: runDraft.title.trim(),
        event_id: runDraft.event_id,
        start: runDraft.start,
        end: runDraft.end,
        target_score: target,
        actual_score: actual,
        note: runDraft.note,
        steps: runDraft.steps.map((s) => ({
          obstacle_id: s.obstacle_id,
          trick_id: s.trick_id,
          stance: s.stance,
          direction: s.direction,
          note: s.note,
        })),
      },
      detail.park.id,
    );
    if (applyOutcome(outcome)) {
      const id = runDraft.run_id;
      setDirty(false);
      setRunDraft(null);
      setMode("view");
      selectRun(id);
    }
  }
  async function deleteRun() {
    if (!runDraft || !window.confirm("Diesen Run endgültig löschen?")) return;
    const outcome = await command.run(
      "run_delete",
      { run_id: runDraft.run_id, revision: runDraft.revision },
      detail.park.id,
    );
    if (applyOutcome(outcome)) {
      setDirty(false);
      setRunDraft(null);
      setMode("view");
      selectRun(null);
    }
  }

  const runVersion = runDraft ? versionById.get(runDraft.park_version_id) : null;
  const missingInDraft = runDraft ? missingObstacleSteps(runDraft.steps, content.obstacles) : [];
  const missingInLatest = runDraft ? missingObstacleSteps(runDraft.steps, latest.content.obstacles) : [];
  const usedObstacleIds = useMemo(
    () => new Set(detail.runs.flatMap((r) => r.steps.map((s) => s.obstacle_id))),
    [detail.runs],
  );

  const sceneRun =
    mode === "run" && runDraft
      ? { start: runDraft.start, end: runDraft.end, steps: runDraft.steps }
      : mode === "view" && selectedRun
        ? { start: selectedRun.start_point, end: selectedRun.end_point, steps: selectedRun.steps }
        : null;

  const stageHint =
    mode === "run"
      ? placing
        ? `Tippe im Park auf den ${placing === "start" ? "Startpunkt" : "Zielpunkt"}.`
        : runDraft?.steps.length
          ? null
          : "Tippe auf ein Obstacle, um den ersten Trick zu setzen."
      : mode === "park" && parkDraft?.content.obstacles.length === 0
        ? "Füge Obstacles aus der Bibliothek hinzu."
        : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Link href="/skateparks" className={styles.back}>
            <ChevronLeft size={16} /> Skateparks
          </Link>
          <h1>{detail.park.name}</h1>
          <p>
            {detail.park.location ? `${detail.park.location} · ` : ""}
            Version {detail.park.latest_version} · {latest.content.obstacles.length} Obstacles
          </p>
        </div>
        {mode === "view" && detail.park.can_edit ? (
          <button type="button" className={styles.ghost} onClick={startParkEdit}>
            <Pencil size={16} /> Park bearbeiten
          </button>
        ) : null}
      </div>

      <div className={styles.planner}>
        <div className={styles.stage}>
          <div className={styles.stageTools}>
            <button
              type="button"
              className={styles.button}
              aria-pressed={topView}
              onClick={() => setTopView((v) => !v)}
            >
              {topView ? "3D" : "Draufsicht"}
            </button>
          </div>
          <ParkScene
            content={content}
            aerialUrl={content.aerial ? aerialUrls[content.aerial.path] : null}
            topView={topView}
            editable={mode === "park"}
            selectedObstacleId={mode === "park" ? selectedObstacle : null}
            onObstacleClick={
              mode === "park" ? setSelectedObstacle : mode === "run" && !placing ? addStep : undefined
            }
            onObstacleMove={mode === "park" ? moveObstacle : undefined}
            onGroundClick={
              mode === "run" && placing ? placePoint : mode === "park" ? () => setSelectedObstacle(null) : undefined
            }
            run={sceneRun}
            activeStep={mode === "run" ? activeStep : null}
            label={`3D-Modell des Parks ${detail.park.name}`}
          />
          {stageHint ? <div className={styles.stageHint}>{stageHint}</div> : null}
        </div>

        <aside className={styles.panel} aria-live="polite">
          {command.message ? (
            <div className={styles.message} role="status">
              <span>{command.message}</span>
              {command.canRetry ? (
                <button type="button" className={styles.button} onClick={() => command.retry().then(applyOutcome)}>
                  Erneut versuchen
                </button>
              ) : conflict ? (
                <button type="button" className={styles.button} onClick={reload}>
                  Aktuellen Stand laden
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === "park" && parkDraft ? (
            <ParkEditorPanel
              draft={parkDraft}
              userId={detail.user.id}
              selectedId={selectedObstacle}
              usedObstacleIds={usedObstacleIds}
              busy={command.busy}
              onChange={updateParkDraft}
              onAdd={(type) => {
                const obstacle = createObstacle(type, { x: 0, z: 0 }, crypto.randomUUID());
                updateParkDraft({
                  ...parkDraft,
                  content: { ...parkDraft.content, obstacles: [...parkDraft.content.obstacles, obstacle] },
                });
                setSelectedObstacle(obstacle.id);
              }}
              onSelect={setSelectedObstacle}
              onAerialPreview={(path, url) => setPreviews((p) => ({ ...p, [path]: url }))}
              onSave={saveParkDraft}
              onCancel={leaveEditing}
            />
          ) : mode === "run" && runDraft ? (
            <RunEditorPanel
              draft={runDraft}
              obstacles={content.obstacles}
              tricks={detail.tricks}
              events={detail.events}
              athletes={
                detail.athletes.some((a) => a.id === runDraft.athlete_user_id)
                  ? detail.athletes
                  : [
                      ...detail.athletes,
                      {
                        id: runDraft.athlete_user_id,
                        name: selectedRun?.athlete.display_name ?? "Athlet",
                      },
                    ]
              }
              isNew={runDraft.revision === 0}
              outdatedVersion={
                runVersion && runVersion.id !== latest.id ? runVersion.version_number : null
              }
              missingSteps={missingInDraft}
              placing={placing}
              activeStep={activeStep}
              busy={command.busy}
              onChange={updateRunDraft}
              onPlace={setPlacing}
              onActiveStep={setActiveStep}
              onSuggestTrick={suggestTrick}
              onUseLatestVersion={
                missingInLatest.length === 0
                  ? () => updateRunDraft({ ...runDraft, park_version_id: latest.id })
                  : null
              }
              onSave={saveRun}
              onCancel={leaveEditing}
              onDelete={deleteRun}
            />
          ) : (
            <>
              <button
                type="button"
                className={styles.primary}
                onClick={startRun}
                disabled={latest.content.obstacles.length === 0}
              >
                Run planen
              </button>
              {latest.content.obstacles.length === 0 ? (
                <p className={styles.hint}>
                  Dieser Park hat noch keine Obstacles.
                  {detail.park.can_edit ? " Baue ihn zuerst über „Park bearbeiten“ nach." : ""}
                </p>
              ) : null}

              {selectedRun ? (
                <section className={styles.card}>
                  <div className={styles.row} style={{ justifyContent: "space-between" }}>
                    <h2>{selectedRun.title}</h2>
                    <button type="button" className={styles.ghost} onClick={() => selectRun(null)}>
                      Schließen
                    </button>
                  </div>
                  <p className={styles.muted}>
                    {selectedRun.athlete.display_name}
                    {selectedRun.event
                      ? ` · ${selectedRun.event.title}, ${dateFormat.format(new Date(selectedRun.event.starts_at))}`
                      : ""}
                    {selectedRun.version_number !== detail.park.latest_version
                      ? ` · Parkversion ${selectedRun.version_number}`
                      : ""}
                  </p>
                  <ol className={styles.steps} style={{ marginTop: 12 }}>
                    {selectedRun.steps.map((s, i) => {
                      const o = content.obstacles.find((x) => x.id === s.obstacle_id);
                      return (
                        <li key={s.id ?? i} className={styles.stepHead}>
                          <span className={styles.number}>{i + 1}</span>
                          <span>
                            <strong>{stepLabel(s)}</strong>
                            <br />
                            <span className={styles.muted}>
                              {o ? obstacleName(o, content.obstacles) : "Obstacle"}
                              {s.note ? ` · ${s.note}` : ""}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className={styles.runSummary} style={{ marginTop: 12 }}>
                    <span>Ziel-Score: {formatScore(selectedRun.target_score)}</span>
                    <span>Erhalten: {formatScore(selectedRun.actual_score)}</span>
                  </div>
                  {selectedRun.note ? <p className={styles.muted} style={{ marginTop: 8 }}>{selectedRun.note}</p> : null}
                  {selectedRun.can_edit ? (
                    <button type="button" className={styles.button} style={{ marginTop: 12 }} onClick={() => editRun(selectedRun)}>
                      <Pencil size={16} /> Bearbeiten
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section>
                <h2>Runs in diesem Park</h2>
                {detail.runs.length === 0 ? (
                  <p className={styles.muted}>
                    Noch keine Runs, die du sehen darfst. Runs sind nur für den Athleten,
                    zugeordnete Trainer und verknüpfte Eltern sichtbar.
                  </p>
                ) : (
                  <ul className={styles.list} style={{ marginTop: 10 }}>
                    {detail.runs.map((run) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          className={styles.listItem}
                          style={{ width: "100%", textAlign: "left", cursor: "pointer", borderColor: run.id === selectedRunId ? "var(--color-blue)" : undefined }}
                          onClick={() => selectRun(run.id === selectedRunId ? null : run.id)}
                          aria-pressed={run.id === selectedRunId}
                        >
                          <div>
                            <strong>{run.title}</strong>
                            <span className={styles.muted}>
                              {run.athlete.display_name} · {run.steps.length} Tricks
                              {run.event ? ` · ${run.event.type === "contest" ? "Contest" : "Training"}` : ""}
                            </span>
                          </div>
                          {run.actual_score !== null ? (
                            <span className={styles.badge}>{formatScore(run.actual_score)}</span>
                          ) : run.target_score !== null ? (
                            <span className={styles.badge}>Ziel {formatScore(run.target_score)}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
