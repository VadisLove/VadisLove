"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { zoneFromPolygon } from "@/domain/park-geometry";
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
  type Obstacle,
  type ParkRun,
  type Point,
  type TrickCategory,
} from "@/domain/parks";
import { ParkEditorPanel, type ParkDraft } from "./park-editor-panel";
import type { ScenePlacement } from "./park-scene";
import { RunEditorPanel, type RunDraft } from "./run-editor-panel";
import { makeCommand, type EditPhase, type SceneCommand, type SceneCommandInput, type TransformState } from "./scene-commands";
import { StageToolbar, ShortcutHelp } from "./stage-toolbar";
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
  const [missedTap, setMissedTap] = useState(false);
  // Hinweis nach einem Tipp neben ein Obstacle nach 4 s wieder ausblenden.
  useEffect(() => {
    if (!missedTap) return;
    const timer = setTimeout(() => setMissedTap(false), 4000);
    return () => clearTimeout(timer);
  }, [missedTap]);
  const [conflict, setConflict] = useState(false);
  const command = useParkCommand<ParkDetail>();
  // ----- Steuerung der 3D-Ansicht -----
  const [showGrid, setShowGrid] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Punkte des Bereichs, der gerade gezeichnet wird (null = kein Zeichenmodus). */
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [sceneCommand, setSceneCommand] = useState<SceneCommand | null>(null);
  const [transform, setTransform] = useState<TransformState | null>(null);
  const sendCommand = (c: SceneCommandInput) => setSceneCommand(makeCommand(c));
  // Rückgängig/Wiederholen für den Park-Entwurf. `previewBase` hält den Stand vor einer
  // laufenden Vorschau (Ziehen, G/R/S), damit die ganze Bewegung ein Schritt ist.
  const [past, setPast] = useState<ParkDraft[]>([]);
  const [future, setFuture] = useState<ParkDraft[]>([]);
  const previewBase = useRef<ParkDraft | null>(null);

  const selectedRun = detail.runs.find((r) => r.id === selectedRunId) ?? null;
  const versionById = useMemo(
    () => new Map(detail.versions.map((v) => [v.id, v])),
    [detail.versions],
  );
  const assetUrls = { ...detail.assetUrls, ...previews };

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
    setDrawing(null);
    setPast([]);
    setFuture([]);
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
    const content = structuredClone(latest.content);
    // Mit Gelände folgt die Grundfläche immer dem Höhenraster (ältere Stände konnten abweichen).
    if (content.ground?.kind === "terrain")
      content.size = { width: content.ground.width, length: content.ground.length };
    setParkDraft({ name: detail.park.name, location: detail.park.location, content });
    setSelectedObstacle(null);
    setPast([]);
    setFuture([]);
    selectRun(null);
    setMode("park");
  }
  /** Übernimmt einen neuen Entwurf; `preview` sammelt Zwischenschritte zu einem Undo-Schritt. */
  function updateParkDraft(next: ParkDraft, phase: EditPhase = "commit") {
    if (!parkDraft) return;
    if (phase === "cancel") {
      if (previewBase.current) setParkDraft(previewBase.current);
      previewBase.current = null;
      return;
    }
    if (phase === "preview") {
      if (!previewBase.current) previewBase.current = parkDraft;
    } else {
      const base = previewBase.current ?? parkDraft;
      previewBase.current = null;
      setPast((p) => [...p.slice(-59), base]);
      setFuture([]);
    }
    setParkDraft(next);
    setDirty(true);
  }
  function editObstacle(next: Obstacle, phase: EditPhase) {
    if (!parkDraft) return;
    if (phase === "cancel") return updateParkDraft(parkDraft, "cancel");
    updateParkDraft(
      {
        ...parkDraft,
        content: {
          ...parkDraft.content,
          obstacles: parkDraft.content.obstacles.map((o) => (o.id === next.id ? next : o)),
        },
      },
      phase,
    );
  }
  function undo() {
    if (!parkDraft || past.length === 0) return;
    setFuture((f) => [parkDraft, ...f]);
    setParkDraft(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    if (!parkDraft || future.length === 0) return;
    setPast((p) => [...p, parkDraft]);
    setParkDraft(future[0]);
    setFuture((f) => f.slice(1));
    setDirty(true);
  }
  function removeSelected() {
    if (!parkDraft || !selectedObstacle) return;
    updateParkDraft({
      ...parkDraft,
      content: { ...parkDraft.content, obstacles: parkDraft.content.obstacles.filter((o) => o.id !== selectedObstacle) },
    });
    setSelectedObstacle(null);
  }
  /** Kopie des gewählten Obstacles; danach direkt verschieben (wie Umschalt+D in Blender). */
  function duplicateSelected() {
    const source = parkDraft?.content.obstacles.find((o) => o.id === selectedObstacle);
    if (!parkDraft || !source) return;
    const copy = { ...structuredClone(source), id: crypto.randomUUID(), label: source.label };
    updateParkDraft({
      ...parkDraft,
      content: { ...parkDraft.content, obstacles: [...parkDraft.content.obstacles, copy] },
    });
    setSelectedObstacle(copy.id);
    // Erst nach dem Rendern der Kopie verschieben.
    setTimeout(() => sendCommand({ type: "transform", kind: "move" }), 0);
  }
  // ----- Bereich zeichnen (Punkte setzen wie mit dem Zeichenstift) -----
  function startDrawing() {
    setSelectedObstacle(null);
    setDrawing([]);
    command.setMessage("");
  }
  function finishDrawing(points = drawing) {
    if (!parkDraft || !points) return;
    // Doppelklick erzeugt zwei gleiche Punkte am Ende: zusammenfassen.
    const clean = points.filter(
      (p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 0.05,
    );
    if (clean.length < 3) return command.setMessage("Ein Bereich braucht mindestens 3 Punkte.");
    const zone = zoneFromPolygon(clean, crypto.randomUUID());
    if (!zone) return command.setMessage("Ein Bereich darf höchstens 60 × 60 m groß sein.");
    updateParkDraft({
      ...parkDraft,
      content: { ...parkDraft.content, obstacles: [...parkDraft.content.obstacles, zone] },
    });
    setDrawing(null);
    setSelectedObstacle(zone.id);
  }
  function addDrawingPoint(point: Point, closes: boolean) {
    if (!drawing) return;
    if (closes) return finishDrawing(drawing);
    setDrawing([...drawing, { x: Math.round(point.x * 100) / 100, z: Math.round(point.z * 100) / 100 }]);
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
    // Feines Raster (10 cm): der Punkt landet dort, wo getippt wurde.
    const p = clampToPark({ x: snap(point.x, 0.1), z: snap(point.z, 0.1) }, content.size);
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

  // Tastenkürzel des Planers (G/R/S, Ansichten und Achsen verarbeitet die Szene selbst).
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const handleKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (e.defaultPrevented || (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
      e.preventDefault();
      return setHelpOpen((v) => !v);
    }
    if (key === "#" || (e.code === "Backquote" && e.shiftKey)) return setShowGrid((v) => !v);
    if (mode === "run") {
      if (e.key === "Escape" && placing) setPlacing(null);
      return;
    }
    if (mode !== "park" || transform) return;
    if (drawing) {
      if (e.key === "Escape") setDrawing(null);
      else if (e.key === "Enter") finishDrawing();
      else if (e.key === "Backspace" || e.key === "Delete") setDrawing(drawing.slice(0, -1));
      else return;
      e.preventDefault();
      return;
    }
    if (mod && key === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && key === "y") {
      e.preventDefault();
      return redo();
    }
    if (mod || e.altKey) return;
    if (e.shiftKey && key === "d") {
      e.preventDefault();
      return duplicateSelected();
    }
    if (e.shiftKey) return;
    if (key === "b") {
      e.preventDefault();
      return startDrawing();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedObstacle) {
      e.preventDefault();
      return removeSelected();
    }
    if (e.key === "Escape") setSelectedObstacle(null);
  };
  useLayoutEffect(() => {
    keyHandler.current = handleKey;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const attribution =
    (content.ground?.kind === "terrain" ? content.ground.attribution : null) ??
    content.aerial?.attribution ??
    null;
  // Tipp neben ein Obstacle: kurz erklären, woran Tricks angepinnt werden.
  const showMissedTap = mode === "run" && !placing && missedTap;
  const stageHint = transform
    ? `${transform.text} — ${
        transform.awaitingDrag
          ? "im Bild ziehen, Loslassen übernimmt"
          : "X/Y/Z Achse · Zahl tippen · Enter/Klick übernehmen · Esc abbrechen"
      }`
    : drawing
      ? drawing.length < 3
        ? `Bereich zeichnen: Punkte um das Element setzen (${drawing.length}/3). Esc bricht ab.`
        : "Weitere Punkte setzen – ersten Punkt antippen, Doppelklick oder Enter schließt den Bereich."
      : mode === "run"
      ? showMissedTap
        ? "Tricks werden an Obstacles oder Bereiche angepinnt – bitte direkt darauf tippen."
        : placing
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
          <StageToolbar
            mode={mode}
            topView={topView}
            onTopView={setTopView}
            showGrid={showGrid}
            onGrid={setShowGrid}
            onHelp={() => setHelpOpen((v) => !v)}
            hasSelection={Boolean(selectedObstacle)}
            drawing={Boolean(drawing)}
            transform={transform}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            onCommand={sendCommand}
            onDraw={() => (drawing ? setDrawing(null) : startDrawing())}
            onFinishDrawing={() => finishDrawing()}
            onUndo={undo}
            onRedo={redo}
            onDuplicate={duplicateSelected}
            onDelete={removeSelected}
          />
          {helpOpen ? <ShortcutHelp onClose={() => setHelpOpen(false)} /> : null}
          <ParkScene
            content={content}
            assetUrls={assetUrls}
            topView={topView}
            onTopViewChange={setTopView}
            showGrid={showGrid}
            command={sceneCommand}
            onTransformState={setTransform}
            editable={mode === "park"}
            selectedObstacleId={mode === "park" ? selectedObstacle : null}
            onObstacleClick={
              mode === "park" ? setSelectedObstacle : mode === "run" && !placing ? addStep : undefined
            }
            onObstacleEdit={mode === "park" ? editObstacle : undefined}
            pickThrough={Boolean(placing || drawing)}
            showCursor={Boolean((mode === "run" && placing) || drawing)}
            draftPolygon={drawing}
            onGroundDoubleClick={drawing ? () => finishDrawing() : undefined}
            onGroundClick={
              mode === "run"
                ? placing
                  ? placePoint
                  : () => setMissedTap(true)
                : mode === "park"
                  ? drawing
                    ? (p, info) => addDrawingPoint(p, info.closesPolygon)
                    : () => setSelectedObstacle(null)
                  : undefined
            }
            run={sceneRun}
            activeStep={mode === "run" ? activeStep : null}
            label={`3D-Modell des Parks ${detail.park.name}`}
          />
          {stageHint ? <div className={styles.stageHint}>{stageHint}</div> : null}
          {/* Lizenzpflichtige Quellenangabe amtlicher Daten (Schritt 7b). */}
          {attribution ? <div className={styles.attribution}>{attribution}</div> : null}
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
              onChange={(next) => updateParkDraft(next)}
              onDrawZone={startDrawing}
              onAdd={(type, patch) => {
                const obstacle = { ...createObstacle(type, { x: 0, z: 0 }, crypto.randomUUID()), ...patch };
                updateParkDraft({
                  ...parkDraft,
                  content: { ...parkDraft.content, obstacles: [...parkDraft.content.obstacles, obstacle] },
                });
                setSelectedObstacle(obstacle.id);
              }}
              onSelect={setSelectedObstacle}
              onAssetPreview={(urls) => setPreviews((p) => ({ ...p, ...urls }))}
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
                <div className={styles.hint}>
                  {latest.content.ground ? (
                    <>
                      Tricks werden an Obstacles oder Bereiche angepinnt. Markiere im Gelände
                      zuerst Bowl, Banks und Rampen als <strong>Bereich</strong> oder setze
                      Obstacles aus der Bibliothek.
                    </>
                  ) : (
                    <>Dieser Park hat noch keine Obstacles.</>
                  )}
                  {detail.park.can_edit ? (
                    <div className={styles.row} style={{ marginTop: 8 }}>
                      <button type="button" className={styles.button} onClick={startParkEdit}>
                        <Pencil size={16} /> {latest.content.ground ? "Bereiche anlegen" : "Park nachbauen"}
                      </button>
                    </div>
                  ) : null}
                </div>
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
