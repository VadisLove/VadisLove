"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { pickHeightfield } from "@/domain/geodata";
import {
  applyTransform,
  describeTransform,
  insertZoneVertex,
  localToWorld,
  moveZoneVertex,
  removeZoneVertex,
  zoneOutline,
  type TransformAxis,
  type TransformKind,
} from "@/domain/park-geometry";
import type { Obstacle, Point } from "@/domain/parks";

/**
 * Editor-Werkzeuge in der 3D-Szene (Orientierung und präzise Eingabe):
 * Referenzraster mit Achsen, Achsen-Gizmo, Bodenauswahl über das Höhenfeld,
 * G/R/S-Transformationen wie in Blender und ziehbare Eckpunkte für Bereiche.
 */

/** Achsenfarben wie in Blender: X rot, Y grün, Z blau. */
export const AXIS_COLORS = { x: "#e5484d", y: "#3fa34d", z: "#3e7bdd" } as const;
const TOOL_COLOR = "#148cf2";

import type { EditPhase, SceneCommand, TransformState, ViewName } from "./scene-commands";

export type { EditPhase, SceneCommand, TransformState, ViewName };

/** Tastatureingaben in Formularfeldern nie als Kürzel auswerten. */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Element, an dem React Three Fiber seine Zeiger-Ereignisse registriert (Wrapper des Canvas). */
function useEventElement() {
  const connected = useThree((s) => s.events.connected) as HTMLElement | null | undefined;
  const gl = useThree((s) => s.gl);
  return connected ?? gl.domElement.parentElement ?? gl.domElement;
}

/** Schnittpunkt eines Zeigers mit dem Boden (Höhenfeld oder Ebene y = 0). */
export function useGroundPick(heightAt: ((x: number, z: number) => number) | null, step: number) {
  const { camera, gl } = useThree();
  return useMemo(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    return (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      return pickHeightfield(origin, direction, heightAt, step);
    };
  }, [camera, gl, heightAt, step]);
}

// ---------------------------------------------------------------------------
// Referenzraster
// ---------------------------------------------------------------------------

/**
 * Raster mit 1-m- und 5-m-Linien sowie farbigen Achsen durch den Parkmittelpunkt.
 * Mit Gelände/Scan wird das Raster auf die Oberfläche gelegt, sonst liegt es flach.
 */
export function ReferenceGrid({
  width,
  length,
  heightAt,
}: {
  width: number;
  length: number;
  heightAt: ((x: number, z: number) => number) | null;
}) {
  const geometries = useMemo(() => {
    const big = Math.max(width, length);
    const minor = big > 120 ? 2 : 1;
    const major = minor * 5;
    // Flaches Raster reicht etwas über den Park hinaus; gedrapt nur über den Park (dort gibt es Höhen).
    const margin = heightAt ? 0 : major * 2;
    const hx = Math.ceil((width / 2 + margin) / major) * major;
    const hz = Math.ceil((length / 2 + margin) / major) * major;
    const limX = heightAt ? width / 2 : hx;
    const limZ = heightAt ? length / 2 : hz;
    const lift = heightAt ? 0.04 : 0.003;
    const y = (x: number, z: number) => (heightAt ? heightAt(x, z) : 0) + lift;
    const sample = heightAt ? 0.5 : Infinity;

    const minorPos: number[] = [];
    const majorPos: number[] = [];
    const axisX: number[] = [];
    const axisY: number[] = [];
    // Linie entlang einer Achse, bei Gelände in 0,5-m-Stücken der Oberfläche folgend.
    const line = (target: number[], ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Number.isFinite(sample) ? Math.max(1, Math.ceil(len / sample)) : 1;
      for (let i = 0; i < n; i++) {
        const x0 = ax + ((bx - ax) * i) / n;
        const z0 = az + ((bz - az) * i) / n;
        const x1 = ax + ((bx - ax) * (i + 1)) / n;
        const z1 = az + ((bz - az) * (i + 1)) / n;
        target.push(x0, y(x0, z0), z0, x1, y(x1, z1), z1);
      }
    };
    for (let x = -hx; x <= hx + 1e-6; x += minor) {
      if (Math.abs(x) > limX + 1e-6) continue;
      const target = Math.abs(x) < 1e-6 ? axisY : Math.abs(x % major) < 1e-6 ? majorPos : minorPos;
      line(target, x, -limZ, x, limZ);
    }
    for (let z = -hz; z <= hz + 1e-6; z += minor) {
      if (Math.abs(z) > limZ + 1e-6) continue;
      const target = Math.abs(z) < 1e-6 ? axisX : Math.abs(z % major) < 1e-6 ? majorPos : minorPos;
      line(target, -limX, z, limX, z);
    }
    const make = (data: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
      return g;
    };
    return { minor: make(minorPos), major: make(majorPos), x: make(axisX), y: make(axisY) };
  }, [width, length, heightAt]);
  useEffect(
    () => () => Object.values(geometries).forEach((g) => g.dispose()),
    [geometries],
  );
  return (
    <group renderOrder={1}>
      <lineSegments geometry={geometries.minor}>
        <lineBasicMaterial color="#9fb0c2" transparent opacity={0.35} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={geometries.major}>
        <lineBasicMaterial color="#6d7f93" transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={geometries.x}>
        <lineBasicMaterial color={AXIS_COLORS.x} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={geometries.y}>
        <lineBasicMaterial color={AXIS_COLORS.y} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Kamera: Ansichten, Tastenkürzel und Orientierung für das Gizmo
// ---------------------------------------------------------------------------

const ELEVATION = (12 * Math.PI) / 180;
/** Kamerarichtungen (von der Mitte zur Kamera) in three.js-Koordinaten. */
const VIEW_DIRECTIONS: Record<"front" | "back" | "right" | "left", THREE.Vector3> = {
  // Blender: Vorderansicht blickt von −Y (Süden, +z) nach Norden.
  front: new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)),
  back: new THREE.Vector3(0, Math.sin(ELEVATION), -Math.cos(ELEVATION)),
  right: new THREE.Vector3(Math.cos(ELEVATION), Math.sin(ELEVATION), 0),
  left: new THREE.Vector3(-Math.cos(ELEVATION), Math.sin(ELEVATION), 0),
};

/**
 * OrbitControls samt Ansichtswechsel. In der Draufsicht nur Verschieben und Zoomen.
 * Zoomen erfolgt zum Mauszeiger hin (wie in Blender/Illustrator), damit man gezielt
 * an eine Stelle heranzoomen kann.
 */
export function CameraRig({
  topView,
  onTopViewChange,
  park,
  controlsRef,
  orientation,
  command,
  focus,
}: {
  topView: boolean;
  onTopViewChange?: (top: boolean) => void;
  park: { width: number; length: number };
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  /** Meldet Kameradrehungen an das Achsen-Gizmo außerhalb des Canvas. */
  orientation: EventTarget;
  command: SceneCommand | null;
  /** Mittelpunkt und Größe des gewählten Objekts für „Auswahl zentrieren“. */
  focus: { x: number; y: number; z: number; size: number } | null;
}) {
  const { camera, gl, invalidate, size: canvas } = useThree();
  const pendingView = useRef<ViewName | null>(null);
  const fittedKey = useRef("");
  const animation = useRef<number | null>(null);
  const focusRef = useRef(focus);
  useLayoutEffect(() => {
    focusRef.current = focus;
  });

  // Kamera-Setup einmalig; die Steuerung selbst stammt aus three.js.
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 400;
    controls.zoomToCursor = true;
    const notify = () => {
      invalidate();
      orientation.dispatchEvent(new Event("change"));
    };
    controls.addEventListener("change", notify);
    controlsRef.current = controls;
    fittedKey.current = "";
    return () => {
      controls.removeEventListener("change", notify);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, controlsRef, orientation]);

  /** Abstand, bei dem der ganze Park ins Bild passt (unabhängig vom Seitenverhältnis). */
  const fitDistance = () => {
    const vfov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (canvas.width / Math.max(1, canvas.height)));
    return Math.max(park.width / 2 / Math.tan(hfov / 2), park.length / 2 / Math.tan(vfov / 2)) * 1.12;
  };

  /** Weicher Kameraflug zu Position/Ziel (ca. 0,3 s). */
  const flyTo = (position: THREE.Vector3, target: THREE.Vector3, instant = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (animation.current) cancelAnimationFrame(animation.current);
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const start = performance.now();
    const step = () => {
      const t = instant ? 1 : Math.min(1, (performance.now() - start) / 280);
      const e = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(fromPos, position, e);
      controls.target.lerpVectors(fromTarget, target, e);
      controls.update();
      invalidate();
      orientation.dispatchEvent(new Event("change"));
      animation.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    step();
  };

  const applyView = (view: ViewName, instant = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = controls.target.clone();
    const distance = camera.position.distanceTo(target) || fitDistance();
    if (view === "home") {
      const fit = fitDistance();
      if (topView) return flyTo(new THREE.Vector3(0, fit, 0.001), new THREE.Vector3(), instant);
      const tilt = new THREE.Vector3(0, 0.8, 0.75).normalize().multiplyScalar(fit * 1.1);
      return flyTo(tilt, new THREE.Vector3(), instant);
    }
    if (view === "focus") {
      const f = focusRef.current;
      if (!f) return;
      const center = new THREE.Vector3(f.x, f.y, f.z);
      const dir = camera.position.clone().sub(controls.target).normalize();
      return flyTo(center.clone().add(dir.multiplyScalar(Math.max(4, f.size * 2.4))), center, instant);
    }
    if (view === "top") {
      return flyTo(new THREE.Vector3(target.x, target.y + distance, target.z + 0.001), target, instant);
    }
    flyTo(target.clone().add(VIEW_DIRECTIONS[view].clone().multiplyScalar(distance)), target, instant);
  };

  // Steuerungsmodus je Ansicht; beim ersten Anzeigen und beim Wechsel die Kamera ausrichten.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !canvas.width || !canvas.height) return;
    if (topView) {
      controls.enableRotate = false;
      controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    } else {
      controls.enableRotate = true;
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
    // Nur bei Ansichtswechsel oder neuer Parkgröße neu ausrichten – nicht bei jeder Größenänderung.
    const key = `${topView}|${park.width}|${park.length}`;
    if (fittedKey.current === key) return;
    const first = fittedKey.current === "";
    fittedKey.current = key;
    const pending = pendingView.current;
    pendingView.current = null;
    if (topView) applyView(first ? "home" : "top", first);
    else applyView(pending ?? "home", first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topView, park.width, park.length, canvas.width, canvas.height]);

  const requestView = (view: ViewName) => {
    if (view === "top") {
      if (!topView) onTopViewChange?.(true);
      else applyView("top");
      return;
    }
    if (topView && view !== "home" && view !== "focus") {
      // Erst in die 3D-Ansicht wechseln; der Effekt oben richtet dann die gewünschte Ansicht aus.
      pendingView.current = view;
      onTopViewChange?.(false);
      return;
    }
    applyView(view);
  };
  const requestRef = useRef(requestView);
  useLayoutEffect(() => {
    requestRef.current = requestView;
  });

  // Befehle aus Werkzeugleiste und Gizmo.
  useEffect(() => {
    if (command?.type === "view") requestRef.current(command.view);
  }, [command]);

  // Ziffern wie auf dem Blender-Ziffernblock: 7 oben, 1 vorne, 3 rechts; Pos1 = alles, F = Auswahl.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, ViewName> = {
        Numpad7: "top",
        Digit7: "top",
        Numpad1: "front",
        Digit1: "front",
        Numpad3: "right",
        Digit3: "right",
        Home: "home",
        NumpadDecimal: "focus",
        KeyF: "focus",
      };
      const view = map[e.code];
      if (!view) return;
      e.preventDefault();
      requestRef.current(view);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => {
    if (animation.current) cancelAnimationFrame(animation.current);
  }, []);
  return null;
}

/**
 * Achsen-Gizmo wie in Blender (X rot, Y grün, Z blau). Ein Klick auf eine Achse richtet
 * die Kamera entlang dieser Achse aus. Liegt außerhalb des Canvas als SVG-Overlay.
 */
export function AxisGizmo({
  orientation,
  camera,
  onView,
}: {
  orientation: EventTarget;
  camera: THREE.Camera | null;
  onView: (view: ViewName) => void;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => force((n) => n + 1));
    };
    orientation.addEventListener("change", update);
    return () => {
      orientation.removeEventListener("change", update);
      cancelAnimationFrame(frame);
    };
  }, [orientation]);

  const cam = camera;
  const size = 88;
  const c = size / 2;
  const r = 30;
  const inverse = cam ? cam.quaternion.clone().invert() : new THREE.Quaternion();
  // Blender-Achsen in three.js-Richtungen: X = +x, Y = −z (Norden), Z = +y (oben).
  const axes = [
    { key: "x", label: "X", color: AXIS_COLORS.x, dir: new THREE.Vector3(1, 0, 0), view: "right" as ViewName, positive: true },
    { key: "y", label: "Y", color: AXIS_COLORS.y, dir: new THREE.Vector3(0, 0, -1), view: "back" as ViewName, positive: true },
    { key: "z", label: "Z", color: AXIS_COLORS.z, dir: new THREE.Vector3(0, 1, 0), view: "top" as ViewName, positive: true },
    { key: "-x", label: "", color: AXIS_COLORS.x, dir: new THREE.Vector3(-1, 0, 0), view: "left" as ViewName, positive: false },
    { key: "-y", label: "", color: AXIS_COLORS.y, dir: new THREE.Vector3(0, 0, 1), view: "front" as ViewName, positive: false },
  ].map((a) => {
    const v = a.dir.clone().applyQuaternion(inverse);
    return { ...a, sx: c + v.x * r, sy: c - v.y * r, depth: v.z };
  });
  axes.sort((a, b) => a.depth - b.depth);
  const titles: Record<string, string> = {
    x: "Ansicht von rechts (Osten, Taste 3)",
    y: "Ansicht von hinten (Norden)",
    z: "Draufsicht (Taste 7)",
    "-x": "Ansicht von links (Westen)",
    "-y": "Vorderansicht (Süden, Taste 1)",
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label="Achsen und Ansichten">
      <circle cx={c} cy={c} r={c - 2} fill="rgba(255,255,255,0.72)" stroke="rgba(7,24,45,0.12)" />
      {axes.map((a) => (
        <g
          key={a.key}
          role="button"
          tabIndex={0}
          aria-label={titles[a.key]}
          style={{ cursor: "pointer" }}
          onClick={() => onView(a.view)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onView(a.view)}
        >
          <title>{titles[a.key]}</title>
          {a.positive ? <line x1={c} y1={c} x2={a.sx} y2={a.sy} stroke={a.color} strokeWidth={2.5} /> : null}
          <circle
            cx={a.sx}
            cy={a.sy}
            r={a.positive ? 9 : 6}
            fill={a.positive ? a.color : "#ffffff"}
            stroke={a.color}
            strokeWidth={2}
            opacity={a.depth < -0.2 ? 0.75 : 1}
          />
          {a.label ? (
            <text x={a.sx} y={a.sy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
              {a.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** Reicht die Kamera an das Gizmo außerhalb des Canvas weiter. */
export function CameraBridge({ onCamera }: { onCamera: (camera: THREE.Camera) => void }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => onCamera(camera), [camera, onCamera]);
  return null;
}

// ---------------------------------------------------------------------------
// Boden antippen: Start/Ziel setzen, Polygon zeichnen, Auswahl aufheben
// ---------------------------------------------------------------------------

/** Markierung am Boden: Ring und kurzer Stab – zeigt exakt, wo ein Tipp landet. */
export function GroundMarker({ point, unit, color = TOOL_COLOR }: { point: THREE.Vector3; unit: number; color?: string }) {
  return (
    <group position={point} renderOrder={8}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.28 * unit, 0.4 * unit, 32]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.07 * unit, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

/**
 * Wertet Tipps und Klicks auf den Boden aus. Getroffen wird das Höhenfeld (Gelände oder
 * Scan) statt der Original-Dreiecke – das ist exakt, schnell und liefert dieselbe Höhe,
 * auf der Start/Ziel, Pins und Linien gezeichnet werden.
 */
export function GroundPicker({
  pick,
  consumed,
  onClick,
  onDoubleClick,
  showCursor,
  closeTarget,
  unit,
}: {
  pick: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
  /** Klicks, die bereits ein Obstacle oder Griff verarbeitet hat. */
  consumed: WeakSet<Event>;
  onClick?: (point: { x: number; y: number; z: number }, info: { closesPolygon: boolean }) => void;
  onDoubleClick?: () => void;
  showCursor: boolean;
  /** Erster Polygonpunkt: ein Klick in seiner Nähe schließt das Polygon. */
  closeTarget: THREE.Vector3 | null;
  unit: number;
}) {
  const element = useEventElement();
  const { camera, gl, invalidate } = useThree();
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null);
  const latest = useRef({ pick, onClick, onDoubleClick, showCursor, closeTarget });
  useLayoutEffect(() => {
    latest.current = { pick, onClick, onDoubleClick, showCursor, closeTarget };
  });

  useEffect(() => {
    let down: { x: number; y: number } | null = null;
    let frame = 0;
    const nearClose = (clientX: number, clientY: number) => {
      const target = latest.current.closeTarget;
      if (!target) return false;
      const rect = gl.domElement.getBoundingClientRect();
      const p = target.clone().project(camera);
      const sx = rect.left + ((p.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - p.y) / 2) * rect.height;
      return Math.hypot(sx - clientX, sy - clientY) < 16;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && e.isPrimary) down = { x: e.clientX, y: e.clientY };
    };
    const onClickEvent = (e: MouseEvent) => {
      const start = down;
      down = null;
      if (consumed.has(e) || !start || !latest.current.onClick) return;
      // Kamera wurde gedreht/verschoben: kein Tipp.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
      const closes = nearClose(e.clientX, e.clientY);
      const target = latest.current.closeTarget;
      const p = closes && target ? target : latest.current.pick(e.clientX, e.clientY);
      if (p) latest.current.onClick({ x: p.x, y: p.y, z: p.z }, { closesPolygon: closes });
    };
    const onDbl = (e: MouseEvent) => {
      if (!consumed.has(e)) latest.current.onDoubleClick?.();
    };
    const onMove = (e: PointerEvent) => {
      if (!latest.current.showCursor || e.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      const { clientX, clientY } = e;
      frame = requestAnimationFrame(() => {
        const target = latest.current.closeTarget;
        const p = target && nearClose(clientX, clientY) ? target : latest.current.pick(clientX, clientY);
        setCursor(p ? new THREE.Vector3(p.x, p.y, p.z) : null);
        invalidate();
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      setCursor(null);
      invalidate();
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("click", onClickEvent);
    element.addEventListener("dblclick", onDbl);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("click", onClickEvent);
      element.removeEventListener("dblclick", onDbl);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [element, camera, gl, consumed, invalidate]);

  const visible = showCursor ? cursor : null;
  return visible ? <GroundMarker point={visible} unit={unit} /> : null;
}

/** Vorschau eines Polygons beim Zeichnen: Punkte, Kanten und gestrichelte Schließkante. */
export function PolygonDraft({
  points,
  heightAt,
  unit,
}: {
  points: Point[];
  heightAt: (x: number, z: number) => number;
  unit: number;
}) {
  const world = useMemo(
    () => points.map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.06, p.z)),
    [points, heightAt],
  );
  // Kanten als Paare (lineSegments), damit kein SVG-<line> mit three.js kollidiert.
  const line = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(world.slice(1).flatMap((p, i) => [world[i], p])),
    [world],
  );
  const closing = useMemo(
    () => (world.length >= 3 ? new THREE.BufferGeometry().setFromPoints([world[world.length - 1], world[0]]) : null),
    [world],
  );
  useEffect(() => () => {
    line.dispose();
    closing?.dispose();
  }, [line, closing]);
  return (
    <group renderOrder={9}>
      <lineSegments geometry={line}>
        <lineBasicMaterial color={TOOL_COLOR} depthTest={false} />
      </lineSegments>
      {closing ? (
        <lineSegments geometry={closing} onUpdate={(self) => self.computeLineDistances()}>
          <lineDashedMaterial color={TOOL_COLOR} dashSize={0.4 * unit} gapSize={0.3 * unit} depthTest={false} />
        </lineSegments>
      ) : null}
      {world.map((p, i) => (
        <HandleSprite key={i} position={p} size={i === 0 ? 0.034 : 0.026} color={i === 0 ? "#159447" : TOOL_COLOR} />
      ))}
    </group>
  );
}

const handleTextures = new Map<string, THREE.Texture>();
function handleTexture(color: string, hollow: boolean) {
  const key = `${color}:${hollow}`;
  const hit = handleTextures.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = hollow ? "#ffffff" : color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = hollow ? color : "#ffffff";
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  handleTextures.set(key, texture);
  return texture;
}

/** Griff mit konstanter Bildschirmgröße (unabhängig vom Zoom) – gut treffbar. */
function HandleSprite({
  position,
  size,
  color,
  hollow = false,
  ...events
}: {
  position: THREE.Vector3;
  size: number;
  color: string;
  hollow?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useMemo(() => handleTexture(color, hollow), [color, hollow]);
  return (
    <sprite position={position} scale={[size, size, 1]} renderOrder={12} {...events}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  );
}

/**
 * Eckpunkte eines gewählten Bereichs wie in Illustrator: Punkte ziehen, auf die Mitte
 * einer Kante ziehen fügt einen Punkt ein, Doppelklick bzw. Alt-Klick entfernt ihn.
 */
export function ZoneHandles({
  zone,
  top,
  pick,
  consumed,
  controlsRef,
  onEdit,
}: {
  zone: Obstacle;
  /** Höhe der Oberkante des Bereichs in Weltkoordinaten. */
  top: number;
  pick: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
  consumed: WeakSet<Event>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onEdit: (next: Obstacle, phase: EditPhase) => void;
}) {
  const drag = useRef<{ index: number; dx: number; dz: number; moved: boolean } | null>(null);
  const zoneRef = useRef(zone);
  useLayoutEffect(() => {
    zoneRef.current = zone;
  }, [zone]);
  const outline = zoneOutline(zone);
  const world = outline.map((p) => localToWorld(zone, p));

  const begin = (e: ThreeEvent<PointerEvent>, index: number, from: Point) => {
    e.stopPropagation();
    consumed.add(e.nativeEvent);
    const ground = pick(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (controlsRef.current) controlsRef.current.enabled = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { index, dx: ground ? from.x - ground.x : 0, dz: ground ? from.z - ground.z : 0, moved: false };
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const ground = pick(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!ground) return;
    d.moved = true;
    onEdit(moveZoneVertex(zoneRef.current, d.index, { x: ground.x + d.dx, z: ground.z + d.dz }), "preview");
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (controlsRef.current) controlsRef.current.enabled = true;
    onEdit(zoneRef.current, d.moved ? "commit" : "cancel");
  };

  return (
    <group>
      {world.map((p, i) => (
        <HandleSprite
          key={`v${i}`}
          position={new THREE.Vector3(p.x, top, p.z)}
          size={0.04}
          color={TOOL_COLOR}
          onPointerDown={(e) => {
            if (e.nativeEvent.altKey) {
              e.stopPropagation();
              consumed.add(e.nativeEvent);
              onEdit(removeZoneVertex(zoneRef.current, i), "commit");
              return;
            }
            begin(e, i, p);
          }}
          onPointerMove={move}
          onPointerUp={end}
          onClick={(e) => {
            e.stopPropagation();
            consumed.add(e.nativeEvent);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            consumed.add(e.nativeEvent);
            onEdit(removeZoneVertex(zoneRef.current, i), "commit");
          }}
        />
      ))}
      {world.map((p, i) => {
        const q = world[(i + 1) % world.length];
        const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
        return (
          <HandleSprite
            key={`m${i}`}
            position={new THREE.Vector3(mid.x, top, mid.z)}
            size={0.032}
            color={TOOL_COLOR}
            hollow
            onPointerDown={(e) => {
              // Neuen Punkt einfügen und direkt weiterziehen.
              const inserted = insertZoneVertex(zoneRef.current, i, mid);
              onEdit(inserted, "preview");
              zoneRef.current = inserted;
              begin(e, i + 1, mid);
              if (drag.current) drag.current.moved = true;
            }}
            onPointerMove={move}
            onPointerUp={end}
            onClick={(e) => {
              e.stopPropagation();
              consumed.add(e.nativeEvent);
            }}
          />
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// G / R / S wie in Blender
// ---------------------------------------------------------------------------

interface Operation {
  kind: TransformKind;
  axis: TransformAxis;
  original: Obstacle;
  /** Bildschirmpunkt, an dem die Mausbewegung beginnt (null = wartet auf Ziehen). */
  start: { x: number; y: number } | null;
  pointer: { x: number; y: number } | null;
  /** Aufsummierter Drehwinkel (mehrere Umdrehungen möglich). */
  angle: number;
  lastAngle: number | null;
  typed: string;
  /** Zeiger ist gedrückt (Touch/Ziehen): Loslassen bestätigt. */
  dragging: boolean;
  noSnap: boolean;
}

/**
 * Modale Transformation des gewählten Obstacles:
 * G verschieben, R drehen, S skalieren; danach X/Y/Z für eine Achse, Zahlen für exakte
 * Werte, Enter/Klick bestätigt, Esc/Rechtsklick bricht ab, Strg/⌘ gedrückt = ohne Raster.
 * Auf Touch-Geräten wird nach dem Start über das Canvas gezogen; Loslassen bestätigt.
 */
export function TransformTool({
  selected,
  base,
  enabled,
  command,
  controlsRef,
  onEdit,
  onState,
}: {
  selected: Obstacle | null;
  /** Unterkante des gewählten Obstacles in Weltkoordinaten. */
  base: number;
  enabled: boolean;
  command: SceneCommand | null;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onEdit: (next: Obstacle, phase: EditPhase) => void;
  onState: (state: TransformState | null) => void;
}) {
  const element = useEventElement();
  const { camera, gl } = useThree();
  const op = useRef<Operation | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const props = useRef({ selected, base, enabled, onEdit, onState });
  useLayoutEffect(() => {
    props.current = { selected, base, enabled, onEdit, onState };
  });

  const api = useMemo(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const toNdc = (p: { x: number; y: number }) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
      return rect;
    };
    const onPlane = (p: { x: number; y: number }) => {
      toNdc(p);
      raycaster.setFromCamera(ndc, camera);
      plane.constant = -props.current.base;
      return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    };
    const center = (o: Obstacle) => {
      const rect = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3(o.x, props.current.base + o.height / 2, o.z).project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };

    const compute = (o: Operation) => {
      const typedValue = o.typed && o.typed !== "-" ? Number(o.typed.replace(",", ".")) : null;
      const typed = typedValue !== null && Number.isFinite(typedValue) ? typedValue : null;
      const base = { kind: o.kind, axis: o.axis, typed, snap: !o.noSnap };
      if (!o.start || !o.pointer) return applyTransform(o.original, base);
      if (o.kind === "move") {
        if (o.axis === "z") {
          const rect = gl.domElement.getBoundingClientRect();
          const distance = camera.position.distanceTo(
            new THREE.Vector3(o.original.x, props.current.base, o.original.z),
          );
          const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
          const perPixel = (2 * distance * Math.tan(fov / 2)) / rect.height;
          return applyTransform(o.original, { ...base, lift: -(o.pointer.y - o.start.y) * perPixel });
        }
        const a = onPlane(o.start);
        const b = onPlane(o.pointer);
        const ground = a && b ? { x: b.x - a.x, z: b.z - a.z } : { x: 0, z: 0 };
        return applyTransform(o.original, { ...base, ground });
      }
      const c = center(o.original);
      if (o.kind === "rotate") {
        const current = Math.atan2(o.pointer.y - c.y, o.pointer.x - c.x);
        if (o.lastAngle === null) o.lastAngle = Math.atan2(o.start.y - c.y, o.start.x - c.x);
        let delta = current - o.lastAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        o.angle += delta;
        o.lastAngle = current;
        return applyTransform(o.original, { ...base, angle: (o.angle * 180) / Math.PI });
      }
      const d0 = Math.max(8, Math.hypot(o.start.x - c.x, o.start.y - c.y));
      const d1 = Math.hypot(o.pointer.x - c.x, o.pointer.y - c.y);
      return applyTransform(o.original, { ...base, factor: d1 / d0 });
    };

    const report = () => {
      const o = op.current;
      if (!o) return props.current.onState(null);
      const next = compute(o);
      props.current.onEdit(next, "preview");
      const typed = o.typed ? ` · Eingabe: ${o.typed}` : "";
      props.current.onState({
        kind: o.kind,
        axis: o.axis,
        text: describeTransform(o.original, next, o.kind, o.axis) + typed,
        awaitingDrag: !o.start,
      });
    };

    const start = (kind: TransformKind, viaKeyboard: boolean) => {
      const { selected: sel, enabled: on } = props.current;
      if (!on || !sel) return;
      const running = op.current;
      if (running) {
        // Wechsel G → R → S während der Operation: vom Ausgangszustand neu beginnen.
        running.kind = kind;
        running.axis = null;
        running.typed = "";
        running.angle = 0;
        running.lastAngle = null;
        return report();
      }
      if (controlsRef.current) controlsRef.current.enabled = false;
      const pointer = viaKeyboard ? hover.current : null;
      op.current = {
        kind,
        axis: null,
        original: sel,
        start: pointer,
        pointer,
        angle: 0,
        lastAngle: null,
        typed: "",
        dragging: false,
        noSnap: false,
      };
      report();
    };

    const finish = (commit: boolean) => {
      const o = op.current;
      if (!o) return;
      op.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (commit) props.current.onEdit(compute(o), "commit");
      else props.current.onEdit(o.original, "cancel");
      props.current.onState(null);
    };

    const setAxis = (axis: Exclude<TransformAxis, null>) => {
      const o = op.current;
      if (!o) return;
      // Nochmaliges Drücken derselben Achse hebt die Einschränkung auf.
      o.axis = o.axis === axis ? null : axis;
      o.angle = 0;
      o.lastAngle = null;
      if (o.pointer && o.start && o.kind === "rotate") o.start = { ...o.pointer };
      report();
    };

    return { start, finish, setAxis, report };
  }, [camera, gl, controlsRef]);

  // Auswahl verschwindet oder Modus endet: laufende Operation abbrechen.
  useEffect(() => {
    if ((!enabled || !selected) && op.current) api.finish(false);
  }, [enabled, selected, api]);

  useEffect(() => {
    if (!command) return;
    if (command.type === "transform") api.start(command.kind, false);
    else if (command.type === "axis") api.setAxis(command.axis);
    else if (command.type === "confirm") api.finish(true);
    else if (command.type === "cancel") api.finish(false);
  }, [command, api]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const o = op.current;
      const key = e.key.toLowerCase();
      if (!o) {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const kind = key === "g" ? "move" : key === "r" ? "rotate" : key === "s" ? "scale" : null;
        if (!kind || !props.current.enabled || !props.current.selected) return;
        e.preventDefault();
        e.stopPropagation();
        api.start(kind, true);
        return;
      }
      if (e.key === "Control" || e.key === "Meta") {
        o.noSnap = true;
        api.report();
        return;
      }
      let handled = true;
      if (key === "x" || key === "y" || key === "z") api.setAxis(key);
      else if (key === "g") api.start("move", true);
      else if (key === "r") api.start("rotate", true);
      else if (key === "s") api.start("scale", true);
      else if (e.key === "Enter") api.finish(true);
      else if (e.key === "Escape") api.finish(false);
      else if (/^[0-9]$/.test(e.key)) {
        o.typed += e.key;
        api.report();
      } else if (
        e.key === "." ||
        e.key === "," ||
        ["Period", "Comma", "NumpadDecimal", "NumpadComma"].includes(e.code)
      ) {
        // Dezimaltrenner: Punkt oder Komma (deutsche Tastatur), nur einmal.
        if (!o.typed.includes(".")) o.typed += o.typed === "" || o.typed === "-" ? "0." : ".";
        api.report();
      } else if (e.key === "-") {
        o.typed = o.typed.startsWith("-") ? o.typed.slice(1) : `-${o.typed}`;
        api.report();
      } else if (e.key === "Backspace") {
        o.typed = o.typed.slice(0, -1);
        api.report();
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const o = op.current;
      if (o && (e.key === "Control" || e.key === "Meta")) {
        o.noSnap = false;
        api.report();
      }
    };
    // Capture-Phase: vor den Kürzeln des Planers und der Kamera.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [api]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover.current = { x: e.clientX, y: e.clientY };
      const o = op.current;
      if (!o) return;
      e.stopPropagation();
      if (!o.start) return;
      o.pointer = { x: e.clientX, y: e.clientY };
      o.noSnap = e.ctrlKey || e.metaKey;
      api.report();
    };
    const onLeave = () => {
      hover.current = null;
    };
    const onDown = (e: PointerEvent) => {
      const o = op.current;
      if (!o) return;
      // Während der Operation gehören Zeiger-Ereignisse nur dem Werkzeug (keine Kamera, kein Obstacle).
      e.stopPropagation();
      e.preventDefault();
      swallowClick.current = true;
      if (e.button === 2) return api.finish(false);
      if (!o.start) {
        // Ziehen beginnt: Ausgangspunkt setzen, Loslassen bestätigt.
        o.start = { x: e.clientX, y: e.clientY };
        o.pointer = { ...o.start };
        o.dragging = true;
        element.setPointerCapture?.(e.pointerId);
        return api.report();
      }
      if (e.button === 0) api.finish(true);
    };
    const onUp = (e: PointerEvent) => {
      const o = op.current;
      if (!o || !o.dragging) return;
      e.stopPropagation();
      element.releasePointerCapture?.(e.pointerId);
      api.finish(true);
    };
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const onContext = (e: MouseEvent) => {
      if (op.current || swallowClick.current) e.preventDefault();
    };
    element.addEventListener("pointermove", onMove, true);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("pointerdown", onDown, true);
    element.addEventListener("pointerup", onUp, true);
    element.addEventListener("click", onClick, true);
    element.addEventListener("contextmenu", onContext, true);
    return () => {
      element.removeEventListener("pointermove", onMove, true);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerdown", onDown, true);
      element.removeEventListener("pointerup", onUp, true);
      element.removeEventListener("click", onClick, true);
      element.removeEventListener("contextmenu", onContext, true);
    };
  }, [element, api]);

  return null;
}
