"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  pathArrows,
  pinLayout,
  runPath,
  type Obstacle,
  type ParkContent,
  type Point,
  type RunStep,
} from "@/domain/parks";
import { despike, footprintBase, footprintRange, refineGrid, terrainHeightAt, type TerrainGrid } from "@/domain/geodata";
import { obstacleParts } from "./obstacle-geometry";
import { applyUpAxis, loadModel, loadTerrain } from "./model-assets";

/**
 * Ruhige 3D-Darstellung eines Parks (Schritt 7): wenige Farben, flache Schattierung,
 * Beschriftung nur über nummerierte Pins. Bearbeitungswerkzeuge liegen außerhalb
 * des Canvas; hier werden nur Zeiger-Ereignisse an die Planer-Logik gemeldet.
 */

const COLORS = {
  ground: "#eef2f5",
  terrain: "#d9dfe5",
  zone: "#148cf2",
  grid: "#d2dae2",
  concrete: "#b9c3cd",
  edge: "#5b6b7d",
  metal: "#6b7785",
  selected: "#148cf2",
  used: "#9fcdf7",
  path: "#148cf2",
  pin: "#07182d",
  start: "#159447",
  end: "#d9363e",
};

export type ScenePlacement = "start" | "end" | null;

export interface ParkSceneProps {
  content: ParkContent;
  /** Signierte bzw. lokale URLs je Storage-Pfad (Luftbild, Höhenraster, Modelle). */
  assetUrls: Record<string, string>;
  topView: boolean;
  /** Obstacles dürfen gezogen werden (nur im Park-Bearbeitungsmodus). */
  editable: boolean;
  selectedObstacleId: string | null;
  onObstacleClick?: (id: string) => void;
  onObstacleMove?: (id: string, point: Point) => void;
  onGroundClick?: (point: Point) => void;
  run?: { start: Point; end: Point; steps: Pick<RunStep, "obstacle_id">[] } | null;
  activeStep?: number | null;
  label: string;
}

const deg = (d: number) => (-d * Math.PI) / 180;
const labelCache = new Map<string, THREE.Texture>();

/** Kreisförmiges Label als Sprite-Textur (Zahl bzw. S/Z), gecacht je Inhalt und Farbe. */
function labelTexture(text: string, color: string, ring = false) {
  const key = `${text}:${color}:${ring}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = ring ? 12 : 6;
  ctx.strokeStyle = ring ? "#148cf2" : "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${text.length > 1 ? 56 : 68}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, texture);
  return texture;
}

function Label({
  text,
  color,
  position,
  scale = 1.3,
  ring = false,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  scale?: number;
  ring?: boolean;
}) {
  const texture = useMemo(() => labelTexture(text, color, ring), [text, color, ring]);
  return (
    <sprite position={position} scale={[scale, scale, scale]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

/** OrbitControls aus three.js; in der Draufsicht nur Verschieben und Zoomen. */
function Controls({
  topView,
  park,
  controlsRef,
}: {
  topView: boolean;
  park: ParkContent["size"];
  controlsRef: React.MutableRefObject<OrbitControls | null>;
}) {
  const { camera, gl, invalidate, size: canvas } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 3;
    controls.maxDistance = 400;
    controls.addEventListener("change", () => invalidate());
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, controlsRef]);

  // Kamera beim Wechsel zwischen 3D und Draufsicht so ausrichten, dass der ganze
  // Park unabhängig vom Seitenverhältnis des Canvas sichtbar ist.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !canvas.width || !canvas.height) return;
    const vfov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (canvas.width / canvas.height));
    const fit =
      Math.max(park.width / 2 / Math.tan(hfov / 2), park.length / 2 / Math.tan(vfov / 2)) * 1.12;
    controls.target.set(0, 0, 0);
    if (topView) {
      camera.position.set(0, fit, 0.001);
      controls.enableRotate = false;
      controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      const tilt = new THREE.Vector3(0, 0.8, 0.75).normalize().multiplyScalar(fit * 1.1);
      camera.position.copy(tilt);
      controls.enableRotate = true;
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
    controls.update();
    invalidate();
  }, [topView, park.width, park.length, canvas.width, canvas.height, camera, controlsRef, invalidate]);
  return null;
}

/** Lädt eine Bildtextur (Luftbild) und löst beim Eintreffen ein Neuzeichnen aus. */
function useTexture(url: string | null | undefined) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, (t) => {
      if (!alive) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      setTexture(t);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [url, invalidate]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return url ? texture : null;
}

function AerialPlane({
  url,
  aerial,
  onClick,
}: {
  url: string;
  aerial: NonNullable<ParkContent["aerial"]>;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useTexture(url);
  if (!texture) return null;
  return (
    <mesh
      position={[aerial.offsetX, 0.005, aerial.offsetZ]}
      rotation={[-Math.PI / 2, 0, deg(aerial.rotation)]}
      onClick={onClick}
    >
      <planeGeometry args={[aerial.width, aerial.width * aerial.aspect]} />
      <meshBasicMaterial map={texture} transparent opacity={aerial.opacity} depthWrite={false} />
    </mesh>
  );
}

/** Höhenraster aus amtlichen Daten laden (Schritt 7b). */
function useTerrainGrid(content: ParkContent, assetUrls: Record<string, string>): TerrainGrid | null {
  const ground = content.ground?.kind === "terrain" ? content.ground : null;
  const url = ground ? assetUrls[ground.path] : undefined;
  const [grid, setGrid] = useState<{ key: string; grid: TerrainGrid } | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    if (!ground || !url) return;
    let alive = true;
    loadTerrain(url, ground.cols * ground.rows)
      .then((heights) => {
        if (!alive) return;
        setGrid({
          key: ground.path,
          // Ausreißer auch in bereits gespeicherten Rastern entfernen (idempotent).
          grid: { cols: ground.cols, rows: ground.rows, width: ground.width, length: ground.length, heights: despike(heights, ground.cols) },
        });
        invalidate();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ground, url, invalidate]);
  return ground && grid?.key === ground.path ? grid.grid : null;
}

/**
 * Gelände-Mesh aus dem Höhenraster. Ein vorhandenes Luftbild wird über seine
 * Lage (Versatz, Drehung, Breite) auf das Gelände projiziert.
 */
function TerrainMesh({
  grid,
  aerial,
  aerialUrl,
  onClick,
}: {
  grid: TerrainGrid;
  aerial: ParkContent["aerial"];
  aerialUrl: string | null;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useTexture(aerialUrl);
  const geometry = useMemo(() => {
    // Grobe Raster (≥ 0,8 m, z. B. Sachsen) für die Darstellung verfeinern, damit Bowls
    // und Rampen weich statt treppig wirken. Höchstens 512 Punkte je Achse.
    const source = grid.width / grid.cols;
    const factor = source >= 0.8 ? Math.max(1, Math.min(3, Math.floor(511 / Math.max(grid.cols, grid.rows)))) : 1;
    const mesh = refineGrid(grid, factor);
    // Rasterpunkte liegen in Zellmitten: Abstand Mitte–Mitte = Ausdehnung − eine Zelle.
    const cellX = mesh.width / mesh.cols;
    const cellZ = mesh.length / mesh.rows;
    const g = new THREE.PlaneGeometry(mesh.width - cellX, mesh.length - cellZ, mesh.cols - 1, mesh.rows - 1);
    g.rotateX(-Math.PI / 2); // Zeile 0 (Norden) liegt danach bei −z.
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, mesh.heights[i]);
    if (aerial) {
      // Weltposition → Bildkoordinaten über die inverse Luftbild-Transformation.
      const frame = new THREE.Object3D();
      frame.position.set(aerial.offsetX, 0, aerial.offsetZ);
      frame.rotation.set(-Math.PI / 2, 0, deg(aerial.rotation));
      frame.updateMatrixWorld(true);
      const inverse = frame.matrixWorld.clone().invert();
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      const aw = aerial.width;
      const al = aerial.width * aerial.aspect;
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), 0, pos.getZ(i)).applyMatrix4(inverse);
        uv.setXY(i, v.x / aw + 0.5, v.y / al + 0.5);
      }
    }
    g.computeVertexNormals();
    return g;
  }, [grid, aerial]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} onClick={onClick}>
      {/* Eigener key: beim Eintreffen der Textur entsteht ein neues Material samt Shader. */}
      {texture ? (
        <meshStandardMaterial key="aerial" map={texture} roughness={1} />
      ) : (
        <meshStandardMaterial key="plain" color={COLORS.terrain} roughness={1} />
      )}
    </mesh>
  );
}

/** Hochgeladenes 3D-Modell des ganzen Parks als Untergrund (Materialien bleiben erhalten). */
function GroundModel({
  ground,
  url,
  onClick,
}: {
  ground: Extract<NonNullable<ParkContent["ground"]>, { kind: "model" }>;
  url: string;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    let alive = true;
    loadModel(url, ground.format)
      .then((source) => {
        if (!alive) return;
        const copy = applyUpAxis(source.clone(true), ground.upAxis);
        copy.traverse((child) => {
          const mesh = child as THREE.Mesh;
          // OBJ bringt keine Materialien mit: ruhige Standardfarbe der App.
          if (mesh.isMesh && ground.format === "obj")
            mesh.material = new THREE.MeshStandardMaterial({ color: COLORS.concrete, flatShading: true, roughness: 0.9 });
        });
        setObject(copy);
        invalidate();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url, ground.format, ground.upAxis, invalidate]);
  if (!object) return null;
  return (
    <group
      position={[ground.offsetX, ground.offsetY, ground.offsetZ]}
      rotation={[0, deg(ground.rotation), 0]}
      scale={ground.scale}
      onClick={onClick}
    >
      <primitive object={object} />
    </group>
  );
}

/**
 * Eigenes Modell als Obstacle: auf die Grundfläche zentriert, auf Breite/Tiefe/Höhe
 * skaliert und im Obstacle-Farbschema eingefärbt (Auswahl und Run-Markierung bleiben sichtbar).
 */
function CustomModel({ obstacle, url, color }: { obstacle: Obstacle; url: string; color: string }) {
  const [source, setSource] = useState<THREE.Object3D | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    let alive = true;
    loadModel(url, obstacle.modelFormat ?? "glb")
      .then((object) => {
        if (!alive) return;
        setSource(object);
        invalidate();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url, obstacle.modelFormat, invalidate]);
  const fitted = useMemo(() => {
    if (!source) return null;
    const inner = applyUpAxis(source.clone(true), obstacle.upAxis);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Unterkante auf y = 0, Grundfläche mittig.
    const holder = new THREE.Group();
    inner.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    holder.add(inner);
    holder.scale.set(
      obstacle.width / Math.max(size.x, 1e-6),
      obstacle.height / Math.max(size.y, 1e-6),
      obstacle.length / Math.max(size.z, 1e-6),
    );
    const material = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
    holder.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.material = material;
    });
    return holder;
  }, [source, obstacle.upAxis, obstacle.width, obstacle.length, obstacle.height, color]);
  if (!fitted)
    return (
      <mesh position={[0, obstacle.height / 2, 0]}>
        <boxGeometry args={[obstacle.width, obstacle.height, obstacle.length]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    );
  return <primitive object={fitted} />;
}

/** Bereich: halbtransparente Markierung eines Gelände-Elements, an die Tricks angepinnt werden. */
function ZoneMarker({ obstacle, selected }: { obstacle: Obstacle; selected: boolean }) {
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.length)),
    [obstacle.width, obstacle.height, obstacle.length],
  );
  return (
    <group position={[0, obstacle.height / 2, 0]}>
      <mesh>
        <boxGeometry args={[obstacle.width, obstacle.height, obstacle.length]} />
        <meshBasicMaterial color={COLORS.zone} transparent opacity={selected ? 0.4 : 0.28} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={COLORS.zone} />
      </lineSegments>
    </group>
  );
}

function ObstacleMesh({
  obstacle,
  base,
  color,
  selected,
  modelUrl,
  editable,
  controlsRef,
  onClick,
  onMove,
}: {
  obstacle: Obstacle;
  /** Unterkante in Weltkoordinaten (Gelände + Höhenversatz). */
  base: number;
  color: string;
  selected: boolean;
  modelUrl?: string;
  editable: boolean;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onClick?: (id: string) => void;
  onMove?: (id: string, point: Point) => void;
}) {
  const drag = useRef<{ dx: number; dz: number } | null>(null);
  // Gezogen wird auf der Ebene der Unterkante, damit das Obstacle unter dem Zeiger bleibt.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -base), [base]);
  const hit = useMemo(() => new THREE.Vector3(), []);

  function groundPoint(e: ThreeEvent<PointerEvent>) {
    return e.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  let body: React.ReactNode;
  if (obstacle.type === "zone") body = <ZoneMarker obstacle={obstacle} selected={selected} />;
  else if (obstacle.type === "custom")
    body = modelUrl ? (
      <CustomModel obstacle={obstacle} url={modelUrl} color={color} />
    ) : (
      <mesh position={[0, obstacle.height / 2, 0]}>
        <boxGeometry args={[obstacle.width, obstacle.height, obstacle.length]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    );
  else {
    const parts = obstacleParts(obstacle);
    body = (
      <>
        {parts.map((part, i) =>
          part.edges ? (
            <lineSegments key={`e${i}`} geometry={part.edges}>
              <lineBasicMaterial color={COLORS.edge} transparent opacity={0.55} />
            </lineSegments>
          ) : null,
        )}
        {parts.map((part, i) => (
          <mesh key={i} geometry={part.geometry}>
            <meshStandardMaterial
              color={part.material === "metal" && color === COLORS.concrete ? COLORS.metal : color}
              flatShading
              roughness={0.9}
              metalness={part.material === "metal" ? 0.4 : 0}
              side={obstacle.type === "bowl" ? THREE.DoubleSide : THREE.FrontSide}
            />
          </mesh>
        ))}
      </>
    );
  }

  return (
    <group
      position={[obstacle.x, base, obstacle.z]}
      rotation={[0, deg(obstacle.rotation), 0]}
      onClick={(e) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        onClick?.(obstacle.id);
      }}
      onPointerDown={(e) => {
        if (!editable || !onMove) return;
        e.stopPropagation();
        const p = groundPoint(e);
        if (!p) return;
        // Während des Ziehens darf die Kamera nicht mitdrehen.
        if (controlsRef.current) controlsRef.current.enabled = false;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { dx: obstacle.x - p.x, dz: obstacle.z - p.z };
        onClick?.(obstacle.id);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        const p = groundPoint(e);
        if (p) onMove?.(obstacle.id, { x: p.x + drag.current.dx, z: p.z + drag.current.dz });
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        if (controlsRef.current) controlsRef.current.enabled = true;
      }}
    >
      {body}
    </group>
  );
}

/** Flaches Band zwischen zwei Punkten; dicker und besser sichtbar als eine 1-px-Linie. */
function Segment({ a, b, unit }: { a: THREE.Vector3; b: THREE.Vector3; unit: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir.clone().normalize(),
    );
    return {
      position: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quaternion: q,
      length: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={position} quaternion={quaternion} renderOrder={5}>
      <boxGeometry args={[0.16 * unit, 0.04 * unit, length]} />
      <meshBasicMaterial color={COLORS.path} transparent opacity={0.85} depthTest={false} />
    </mesh>
  );
}

function RunOverlay({
  run,
  obstacles,
  activeStep,
  baseOf,
  groundAt,
  unit,
}: {
  run: NonNullable<ParkSceneProps["run"]>;
  obstacles: Obstacle[];
  activeStep: number | null;
  baseOf: (o: Obstacle) => number;
  groundAt: (p: Point) => number;
  /** Maßstab für Pins, Linie und Pfeile, damit sie auch in großen Parks lesbar bleiben. */
  unit: number;
}) {
  const byId = useMemo(() => new Map(obstacles.map((o) => [o.id, o])), [obstacles]);
  const points = useMemo(() => {
    const path = runPath(run.start, run.end, run.steps, obstacles);
    // Dieselbe Reihenfolge wie runPath: aufeinanderfolgende Schritte am selben
    // Obstacle zählen einmal. Die Linie führt auf die Oberkante des Obstacles.
    const visited: Obstacle[] = [];
    for (const step of run.steps) {
      const o = byId.get(step.obstacle_id);
      if (o && o !== visited[visited.length - 1]) visited.push(o);
    }
    return path.map((p, i) => {
      const o = i > 0 && i < path.length - 1 ? visited[i - 1] : null;
      const y = o ? baseOf(o) + Math.min(o.height, 2) : groundAt(p);
      return new THREE.Vector3(p.x, y + 0.06, p.z);
    });
  }, [run, obstacles, byId, baseOf, groundAt]);
  const arrows = useMemo(
    () => pathArrows(points.map((p) => ({ x: p.x, z: p.z }))),
    [points],
  );
  const pins = useMemo(() => pinLayout(run.steps, obstacles), [run.steps, obstacles]);
  const startY = groundAt(run.start);
  const endY = groundAt(run.end);

  return (
    <group>
      {points.slice(1).map((p, i) => (
        <Segment key={i} a={points[i]} b={p} unit={unit} />
      ))}
      {arrows.map((a, i) => (
        <mesh
          key={i}
          position={[a.x, (points[i].y + points[i + 1].y) / 2 + 0.1, a.z]}
          // Kegel zuerst flach legen (Spitze nach +z), dann in Fahrtrichtung drehen.
          rotation={[Math.PI / 2, a.angle, 0, "YXZ"]}
          renderOrder={6}
        >
          <coneGeometry args={[0.35 * unit, 0.8 * unit, 3]} />
          <meshBasicMaterial color={COLORS.path} depthTest={false} />
        </mesh>
      ))}
      {pins.map((pin) => {
        const o = byId.get(pin.obstacleId);
        const base = o ? baseOf(o) : 0;
        const top = base + (o?.height ?? 0);
        // Abstand nebeneinanderliegender Pins und Schwebehöhe wachsen mit dem Maßstab.
        const x = o ? o.x + (pin.x - o.x) * unit : pin.x;
        const y = top + (pin.y - (o?.height ?? 0)) * unit;
        return (
          <group key={pin.number}>
            {o ? (
              <mesh position={[x, (top + y) / 2, pin.z]}>
                <cylinderGeometry args={[0.02 * unit, 0.02 * unit, y - top, 4]} />
                <meshBasicMaterial color={COLORS.pin} />
              </mesh>
            ) : null}
            <Label
              text={String(pin.number)}
              color={COLORS.pin}
              position={[x, y, pin.z]}
              scale={1.3 * unit}
              ring={activeStep === pin.number - 1}
            />
          </group>
        );
      })}
      <Label text="S" color={COLORS.start} position={[run.start.x, startY + 1.2 * unit, run.start.z]} scale={1.7 * unit} />
      <Label text="Z" color={COLORS.end} position={[run.end.x, endY + 1.2 * unit, run.end.z]} scale={1.7 * unit} />
    </group>
  );
}

function SceneContent(props: ParkSceneProps) {
  const { content, run, selectedObstacleId, onGroundClick, assetUrls } = props;
  const controlsRef = useRef<OrbitControls | null>(null);
  const grid = useTerrainGrid(content, assetUrls);
  const used = useMemo(
    () => new Set(run?.steps.map((s) => s.obstacle_id) ?? []),
    [run],
  );
  const groundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || !onGroundClick) return;
    e.stopPropagation();
    onGroundClick({ x: e.point.x, z: e.point.z });
  };
  // Bereiche auf dem Gelände reichen vom tiefsten bis zum höchsten Punkt darunter
  // (plus 0,2 m), damit z. B. eine Bowl vollständig markiert und anpinnbar ist.
  const obstacles = useMemo(
    () =>
      content.obstacles.map((o) => {
        if (o.type !== "zone" || !grid) return o;
        const range = footprintRange(grid, o);
        return { ...o, height: Math.max(o.height, Math.round((range.max - range.min + 0.2) * 100) / 100) };
      }),
    [content.obstacles, grid],
  );
  // Unterkante: niedrigster Geländepunkt unter der Grundfläche plus Höhenversatz.
  const baseOf = useMemo(
    () => (o: Obstacle) =>
      (grid ? (o.type === "zone" ? footprintRange(grid, o).min : footprintBase(grid, o)) : 0) +
      (o.elevation ?? 0),
    [grid],
  );
  const groundAt = useMemo(
    () => (p: Point) => (grid ? terrainHeightAt(grid, p.x, p.z) : 0),
    [grid],
  );
  const { width, length } = content.size;
  const ground = content.ground ?? null;
  const aerialUrl = content.aerial ? (assetUrls[content.aerial.path] ?? null) : null;

  return (
    <>
      <Controls topView={props.topView} park={content.size} controlsRef={controlsRef} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[12, 24, 16]} intensity={1.6} />
      {ground?.kind === "terrain" ? (
        grid ? (
          <TerrainMesh grid={grid} aerial={content.aerial} aerialUrl={aerialUrl} onClick={groundClick} />
        ) : null
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ground ? -0.02 : 0, 0]} onClick={groundClick}>
            <planeGeometry args={[width, length]} />
            <meshBasicMaterial color={COLORS.ground} />
          </mesh>
          {!ground ? (
            <gridHelper
              args={[Math.max(width, length), Math.max(width, length), COLORS.grid, COLORS.grid]}
              position={[0, 0.002, 0]}
              scale={[width / Math.max(width, length), 1, length / Math.max(width, length)]}
            />
          ) : null}
          {content.aerial && aerialUrl ? (
            <AerialPlane url={aerialUrl} aerial={content.aerial} onClick={groundClick} />
          ) : null}
          {ground?.kind === "model" && assetUrls[ground.path] ? (
            <GroundModel ground={ground} url={assetUrls[ground.path]} onClick={groundClick} />
          ) : null}
        </>
      )}
      {obstacles.map((o) => (
        <ObstacleMesh
          key={o.id}
          obstacle={o}
          base={baseOf(o)}
          selected={o.id === selectedObstacleId}
          modelUrl={o.modelPath ? assetUrls[o.modelPath] : undefined}
          color={
            o.id === selectedObstacleId
              ? COLORS.selected
              : used.has(o.id)
                ? COLORS.used
                : COLORS.concrete
          }
          editable={props.editable}
          controlsRef={controlsRef}
          onClick={props.onObstacleClick}
          onMove={props.onObstacleMove}
        />
      ))}
      {run ? (
        <RunOverlay
          run={run}
          obstacles={obstacles}
          activeStep={props.activeStep ?? null}
          baseOf={baseOf}
          groundAt={groundAt}
          unit={Math.max(1, Math.max(width, length) / 45)}
        />
      ) : null}
    </>
  );
}

export default function ParkScene(props: ParkSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 25, 30] }}
      aria-label={props.label}
      role="img"
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#f5f7f9"]} />
      <SceneContent {...props} />
    </Canvas>
  );
}
