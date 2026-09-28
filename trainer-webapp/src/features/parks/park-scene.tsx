"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  clampToPark,
  pinLayout,
  snap,
  type Obstacle,
  type ParkContent,
  type Point,
  type RunStep,
} from "@/domain/parks";
import {
  HeightRaster,
  despike,
  footprintBase,
  footprintRange,
  refineGrid,
  terrainHeightAt,
  type TerrainGrid,
} from "@/domain/geodata";
import { zoneOutline } from "@/domain/park-geometry";
import {
  insertWaypoint,
  moveWaypoint,
  playSchedule,
  playState,
  removeWaypoint,
  runControls,
  type RunControl,
  type Waypoint,
} from "@/domain/run-path";
import { obstacleParts } from "./obstacle-geometry";
import { applyUpAxis, loadModel, loadTerrain } from "./model-assets";
import {
  AxisGizmo,
  CameraBridge,
  CameraRig,
  DragHandle,
  GroundMarker,
  GroundPicker,
  PolygonDraft,
  ReferenceGrid,
  TransformTool,
  ZoneHandles,
  useGroundPick,
} from "./scene-tools";
import { makeCommand, type EditPhase, type SceneCommand, type TransformState, type ViewName } from "./scene-commands";

/**
 * Ruhige 3D-Darstellung eines Parks (Schritt 7): wenige Farben, flache Schattierung,
 * Beschriftung nur über nummerierte Pins. Seit dem Steuerungs-Update gibt es ein
 * Referenzraster mit Achsen, ein Achsen-Gizmo, Blender-Kürzel (G/R/S) und frei
 * gezeichnete Bereiche; Änderungen werden als Vorschau/Bestätigung an den Planer gemeldet.
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
  onTopViewChange?: (top: boolean) => void;
  /** Obstacles dürfen gezogen und transformiert werden (nur im Park-Bearbeitungsmodus). */
  editable: boolean;
  selectedObstacleId: string | null;
  /** Tipp auf ein Obstacle; `point` ist die Tippposition (bei Bereichen auf dem Gelände). */
  onObstacleClick?: (id: string, point: Point) => void;
  /** Änderung an einem Obstacle: Vorschau während des Ziehens, dann Bestätigung oder Abbruch. */
  onObstacleEdit?: (next: Obstacle, phase: EditPhase) => void;
  /** Tipp auf den Boden (Position auf Gelände bzw. Scan). */
  onGroundClick?: (point: Point, info: { closesPolygon: boolean }) => void;
  onGroundDoubleClick?: () => void;
  /** Obstacles ignorieren Tipps (z. B. beim Setzen von Start/Ziel oder Zeichnen). */
  pickThrough?: boolean;
  /** Bodenmarkierung unter dem Mauszeiger (zeigt, wo ein Klick landet). */
  showCursor?: boolean;
  /** Ausgewählte Eckpunkte des gewählten Bereichs (G/R/S wirken dann auf diese Punkte). */
  selectedVertices?: number[];
  onSelectVertices?: (indices: number[]) => void;
  /** Punkte eines Bereichs, der gerade gezeichnet wird. */
  draftPolygon?: Point[] | null;
  showGrid?: boolean;
  /** Meldet die Maße eines hochgeladenen Park-Modells (für den Größenhinweis im Editor). */
  onModelBounds?: (bounds: ModelBounds | null) => void;
  command?: SceneCommand | null;
  onTransformState?: (state: TransformState | null) => void;
  run?: {
    start: Point | null;
    end: Point | null;
    steps: (Pick<RunStep, "obstacle_id"> & { point?: Point | null })[];
    via?: Waypoint[];
  } | null;
  /** Start, Ziel und Zwischenpunkte der Fahrlinie ziehbar machen (Run planen). */
  onRunPathEdit?: (patch: RunPathEdit, phase: EditPhase) => void;
  /** Run-Animation: jede neue Zahl startet sie neu, null = aus. */
  play?: number | null;
  onPlayStep?: (step: number | null) => void;
  onPlayEnd?: () => void;
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

/**
 * Beschriftung mit fester Bildschirmgröße (Anteil der Canvas-Höhe): Pins und S/Z bleiben
 * lesbar – unabhängig von Parkgröße und Zoom.
 */
function Label({
  text,
  color,
  position,
  size = 0.05,
  ring = false,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  size?: number;
  ring?: boolean;
}) {
  const texture = useMemo(() => labelTexture(text, color, ring), [text, color, ring]);
  return (
    <sprite position={position} scale={[size, size, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
    </sprite>
  );
}

/** Höhe (m), in der Pins und Start/Ziel-Labels über ihrem Punkt schweben. */
const LABEL_LIFT = 1.2;

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

function AerialPlane({ url, aerial }: { url: string; aerial: NonNullable<ParkContent["aerial"]> }) {
  const texture = useTexture(url);
  if (!texture) return null;
  return (
    <mesh
      position={[aerial.offsetX, 0.005, aerial.offsetZ]}
      rotation={[-Math.PI / 2, 0, deg(aerial.rotation)]}
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
}: {
  grid: TerrainGrid;
  aerial: ParkContent["aerial"];
  aerialUrl: string | null;
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
    <mesh geometry={geometry}>
      {/* Eigener key: beim Eintreffen der Textur entsteht ein neues Material samt Shader. */}
      {texture ? (
        <meshStandardMaterial key="aerial" map={texture} roughness={1} />
      ) : (
        <meshStandardMaterial key="plain" color={COLORS.terrain} roughness={1} />
      )}
    </mesh>
  );
}

/** Positionen eines Meshes als einfache Float-Liste (auch bei verschachtelten/quantisierten Daten). */
function plainPositions(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): ArrayLike<number> {
  if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !attribute.normalized)
    return attribute.array as ArrayLike<number>;
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
}

/**
 * Hochgeladenes 3D-Modell des ganzen Parks als Untergrund (Materialien bleiben erhalten).
 * Aus den Dreiecken entsteht einmalig ein Höhenfeld; darauf landen Tipps, Start/Ziel,
 * Pins, Raster und Bereiche – genau auf der sichtbaren Oberfläche.
 */
function GroundModel({
  ground,
  url,
  size,
  onHeights,
  onBounds,
}: {
  ground: Extract<NonNullable<ParkContent["ground"]>, { kind: "model" }>;
  url: string;
  size: ParkContent["size"];
  onHeights: (grid: TerrainGrid | null) => void;
  onBounds?: (bounds: ModelBounds | null) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const groupRef = useRef<THREE.Group>(null);
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

  // Höhenfeld nach Laden bzw. Verschieben/Drehen/Skalieren (kurz entprellt) neu berechnen.
  useEffect(() => {
    if (!object) return;
    const timer = setTimeout(() => {
      const group = groupRef.current;
      if (!group) return;
      group.updateMatrixWorld(true);
      const cell = Math.max(0.2, Math.max(size.width, size.length) / 400);
      const raster = new HeightRaster(size.width, size.length, cell);
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const position = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
        if (!position) return;
        raster.addMesh(plainPositions(position), mesh.geometry.index?.array ?? null, mesh.matrixWorld.elements);
      });
      // Außerhalb des Scans liegt die flache Grundfläche (y ≈ 0).
      onHeights(raster.finish(0));
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty())
        onBounds?.({
          minX: box.min.x,
          maxX: box.max.x,
          minZ: box.min.z,
          maxZ: box.max.z,
          height: box.max.y - box.min.y,
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [
    object,
    ground.offsetX,
    ground.offsetY,
    ground.offsetZ,
    ground.rotation,
    ground.scale,
    size.width,
    size.length,
    onHeights,
    onBounds,
  ]);
  useEffect(() => () => onHeights(null), [onHeights]);

  if (!object) return null;
  return (
    <group
      ref={groupRef}
      position={[ground.offsetX, ground.offsetY, ground.offsetZ]}
      rotation={[0, deg(ground.rotation), 0]}
      scale={ground.scale}
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

/**
 * Bereich: halbtransparente Markierung eines Gelände-Elements, an die Tricks angepinnt
 * werden. Der Umriss ist ein Rechteck oder ein frei gezeichnetes Polygon, hochgezogen
 * von der Unterkante bis zur Höhe.
 */
function ZoneMarker({ obstacle, selected }: { obstacle: Obstacle; selected: boolean }) {
  const { points, width, length, height } = obstacle;
  const { body, edges } = useMemo(() => {
    const outline = zoneOutline({ points, width, length });
    // Shape liegt in x/y; nach der Drehung um −90° um X wird y zu −z und die Extrusion zu +y.
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return { body: g, edges: new THREE.EdgesGeometry(g) };
  }, [points, width, length, height]);
  useEffect(() => () => {
    body.dispose();
    edges.dispose();
  }, [body, edges]);
  return (
    <group>
      <mesh geometry={body}>
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
  interactive,
  parkSize,
  consumed,
  controlsRef,
  onClick,
  onEdit,
  pickGround,
}: {
  obstacle: Obstacle;
  /** Unterkante in Weltkoordinaten (Gelände + Höhenversatz). */
  base: number;
  color: string;
  selected: boolean;
  modelUrl?: string;
  editable: boolean;
  /** false: Obstacle nimmt keine Zeiger-Ereignisse an (Tipps gehen auf den Boden). */
  interactive: boolean;
  parkSize: ParkContent["size"];
  consumed: WeakSet<Event>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onClick?: (id: string, point: Point) => void;
  onEdit?: (next: Obstacle, phase: EditPhase) => void;
  /** Bodenpunkt unter dem Zeiger (Höhenfeld), für Tipps in Bereiche. */
  pickGround: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
}) {
  const drag = useRef<{ dx: number; dz: number; moved: boolean } | null>(null);
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

  // Griffe (Eckpunkte, Kurvenpunkte) liegen auf bzw. vor dem Obstacle: Ein Treffer darauf
  // hat Vorrang, auch wenn die Oberfläche des Bereichs minimal näher an der Kamera liegt.
  const onHandle = (e: ThreeEvent<MouseEvent>) => e.intersections.some((i) => i.object.userData?.handle);
  const handlers = interactive
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6 || onHandle(e)) return;
          e.stopPropagation();
          consumed.add(e.nativeEvent);
          // Bereiche sind durchsichtige Kästen: maßgeblich ist der Geländepunkt unter dem Finger,
          // nicht der Treffer auf der Oberseite des Kastens (sonst perspektivisch versetzt).
          const ground = obstacle.type === "zone" ? pickGround(e.nativeEvent.clientX, e.nativeEvent.clientY) : null;
          const hit = ground ?? e.point;
          onClick?.(obstacle.id, { x: Math.round(hit.x * 100) / 100, z: Math.round(hit.z * 100) / 100 });
        },
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          if (!editable || !onEdit || e.button !== 0 || onHandle(e)) return;
          e.stopPropagation();
          const p = groundPoint(e);
          if (!p) return;
          // Während des Ziehens darf die Kamera nicht mitdrehen.
          if (controlsRef.current) controlsRef.current.enabled = false;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { dx: obstacle.x - p.x, dz: obstacle.z - p.z, moved: false };
          onClick?.(obstacle.id, { x: e.point.x, z: e.point.z });
        },
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          if (!drag.current) return;
          e.stopPropagation();
          const p = groundPoint(e);
          if (!p) return;
          drag.current.moved = true;
          const next = clampToPark({ x: snap(p.x + drag.current.dx), z: snap(p.z + drag.current.dz) }, parkSize);
          onEdit?.({ ...obstacle, ...next }, "preview");
        },
        onPointerUp: (e: ThreeEvent<PointerEvent>) => {
          if (!drag.current) return;
          const moved = drag.current.moved;
          drag.current = null;
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          if (controlsRef.current) controlsRef.current.enabled = true;
          if (moved) onEdit?.(obstacle, "commit");
        },
      }
    : {};

  return (
    <group
      position={[obstacle.x, base, obstacle.z]}
      // YXZ: erst um die Hochachse drehen, dann um die eigenen Achsen kippen.
      rotation={[deg(obstacle.pitch ?? 0), deg(obstacle.rotation), deg(obstacle.roll ?? 0), "YXZ"]}
      {...handlers}
    >
      {body}
    </group>
  );
}

/** Flaches Band entlang abgetasteter Punkte (eine Geometrie statt vieler Einzelteile). */
function Ribbon({ points, width }: { points: THREE.Vector3[]; width: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const index: number[] = [];
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      side.subVectors(b, a).setY(0).normalize().cross(up).multiplyScalar(width / 2);
      positions.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
      if (i > 0) {
        const k = i * 2;
        index.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    return g;
  }, [points, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={5}>
      <meshBasicMaterial color={COLORS.path} transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Umriss des hochgeladenen Park-Modells in Parkkoordinaten (für Größenhinweise). */
export interface ModelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface RunPathEdit {
  start?: Point;
  end?: Point;
  via?: Waypoint[];
}

/** Fahrender Punkt der Run-Animation; meldet den gerade gezeigten Trick. */
function PlayMarker({
  curve,
  stops,
  length,
  groundAt,
  unit,
  play,
  onStep,
  onEnd,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  stops: { at: number; steps: number[] }[];
  length: number;
  groundAt: (p: Point) => number;
  unit: number;
  play: number;
  onStep?: (step: number | null) => void;
  onEnd?: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const started = useRef(0);
  const lastStep = useRef<number | null>(null);
  const finished = useRef(false);
  const schedule = useMemo(() => playSchedule(length, stops), [length, stops]);
  const invalidate = useThree((s) => s.invalidate);
  const callbacks = useRef({ onStep, onEnd });
  useLayoutEffect(() => {
    callbacks.current = { onStep, onEnd };
  });
  useEffect(() => {
    started.current = performance.now();
    lastStep.current = null;
    finished.current = false;
    invalidate();
  }, [play, schedule, invalidate]);
  useFrame(() => {
    if (finished.current || !ref.current) return;
    const state = playState(schedule, (performance.now() - started.current) / 1000);
    const p = curve.getPointAt(Math.min(1, Math.max(0, state.at)));
    ref.current.position.set(p.x, Math.max(p.y, groundAt({ x: p.x, z: p.z }) + 0.06), p.z);
    if (state.step !== lastStep.current) {
      lastStep.current = state.step;
      callbacks.current.onStep?.(state.step);
    }
    if (state.done) {
      finished.current = true;
      callbacks.current.onEnd?.();
    } else invalidate();
  });
  return (
    <group ref={ref} renderOrder={11}>
      <mesh position={[0, 0.4 * unit, 0]}>
        <sphereGeometry args={[0.45 * unit, 20, 12]} />
        <meshBasicMaterial color="#f59f00" depthTest={false} transparent />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.55 * unit, 0.75 * unit, 28]} />
        <meshBasicMaterial color="#f59f00" depthTest={false} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function RunOverlay({
  run,
  obstacles,
  activeStep,
  baseOf,
  groundAt,
  unit,
  editing,
  play,
  onPlayStep,
  onPlayEnd,
}: {
  run: NonNullable<ParkSceneProps["run"]>;
  obstacles: Obstacle[];
  activeStep: number | null;
  baseOf: (o: Obstacle) => number;
  groundAt: (p: Point) => number;
  /** Maßstab für Pins, Linie und Pfeile, damit sie auch in großen Parks lesbar bleiben. */
  unit: number;
  /** Griffe für Start, Ziel und Zwischenpunkte (nur beim Planen eines Runs). */
  editing: {
    pick: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
    consumed: WeakSet<Event>;
    controlsRef: React.MutableRefObject<OrbitControls | null>;
    onEdit: (patch: RunPathEdit, phase: EditPhase) => void;
  } | null;
  play: number | null;
  onPlayStep?: (step: number | null) => void;
  onPlayEnd?: () => void;
}) {
  const byId = useMemo(() => new Map(obstacles.map((o) => [o.id, o])), [obstacles]);
  const via = useMemo(() => run.via ?? [], [run.via]);
  const controls = useMemo(
    () => runControls(run.start, run.end, run.steps, obstacles, via),
    [run.start, run.end, run.steps, obstacles, via],
  );
  // Kontrollpunkte in 3D: an Obstacles auf deren Oberkante, sonst auf dem Boden.
  const { curve, samples, length, anchorsU } = useMemo(() => {
    const points = controls.map((c) => {
      const o = c.obstacleId ? byId.get(c.obstacleId) : null;
      // Bereiche: am Tipppunkt auf dem Gelände; feste Obstacles: auf der Oberkante.
      const y = o && o.type !== "zone" ? baseOf(o) + Math.min(o.height, 2) : groundAt(c);
      return new THREE.Vector3(c.x, y + 0.06, c.z);
    });
    // Noch kein Abschnitt (z. B. nur Start gesetzt): keine Linie.
    if (points.length < 2) return { curve: null, samples: [], length: 0, anchorsU: points.map(() => 0) };
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
    const length = curve.getLength();
    const count = Math.min(1500, Math.max(24, Math.ceil(length / 0.25)));
    // Die Linie darf nicht unter Gelände oder Scan tauchen.
    const samples = curve.getSpacedPoints(count).map((p) => {
      p.y = Math.max(p.y, groundAt({ x: p.x, z: p.z }) + 0.06);
      return p;
    });
    // Anteil der Länge an jedem Kontrollpunkt (für Pfeile und Animation).
    const divisions = 400;
    const lengths = curve.getLengths(divisions);
    const anchorsU = controls.map((_, i) =>
      controls.length > 1 ? lengths[Math.round((i / (controls.length - 1)) * divisions)] / Math.max(1e-6, length) : 0,
    );
    return { curve, samples, length, anchorsU };
  }, [controls, byId, baseOf, groundAt]);

  // Ein Pfeil in der Mitte jedes Abschnitts zwischen Start, Obstacles und Ziel.
  const arrows = useMemo(() => {
    if (!curve) return [];
    const anchors = controls.map((c, i) => ({ c, u: anchorsU[i] })).filter((a) => a.c.kind !== "via");
    const out: { position: THREE.Vector3; angle: number }[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const u0 = anchors[i - 1].u;
      const u1 = anchors[i].u;
      if ((u1 - u0) * length < 0.5) continue;
      const u = (u0 + u1) / 2;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      p.y = Math.max(p.y, groundAt({ x: p.x, z: p.z }) + 0.06) + 0.1;
      out.push({ position: p, angle: Math.atan2(t.x, t.z) });
    }
    return out;
  }, [controls, anchorsU, curve, length, groundAt]);
  const stops = useMemo(
    () => controls.flatMap((c, i) => (c.kind === "obstacle" ? [{ at: anchorsU[i], steps: c.steps ?? [] }] : [])),
    [controls, anchorsU],
  );

  const pins = useMemo(() => pinLayout(run.steps, obstacles), [run.steps, obstacles]);

  return (
    <group>
      {samples.length ? <Ribbon points={samples} width={0.16 * unit} /> : null}
      {arrows.map((a, i) => (
        <mesh
          key={i}
          position={a.position}
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
        // Fußpunkt: bei Bereichen das Gelände am Tipppunkt, sonst die Oberkante des Obstacles.
        const top =
          o && o.type === "zone" && pin.spot
            ? groundAt({ x: pin.x, z: pin.z })
            : (o ? baseOf(o) : 0) + (o?.height ?? 0);
        const y = top + LABEL_LIFT;
        const active = activeStep === pin.number - 1;
        return (
          <group key={pin.number}>
            <mesh position={[pin.x, (top + y) / 2, pin.z]}>
              <cylinderGeometry args={[0.02, 0.02, y - top, 4]} />
              <meshBasicMaterial color={COLORS.pin} />
            </mesh>
            <Label
              text={String(pin.number)}
              color={COLORS.pin}
              position={[pin.x, y, pin.z]}
              size={active ? 0.06 : 0.045}
              ring={active}
            />
          </group>
        );
      })}
      {/* Start/Ziel: Ring genau am gesetzten Punkt, Stab nach oben zum Label. */}
      {[
        { text: "S", color: COLORS.start, p: run.start },
        { text: "Z", color: COLORS.end, p: run.end },
      ].map((m) => {
        if (!m.p) return null;
        const y = groundAt(m.p);
        return (
          <group key={m.text}>
            <GroundMarker point={new THREE.Vector3(m.p.x, y, m.p.z)} unit={unit * 0.8} color={m.color} />
            <mesh position={[m.p.x, y + LABEL_LIFT / 2, m.p.z]} renderOrder={7}>
              <cylinderGeometry args={[0.03, 0.03, LABEL_LIFT, 6]} />
              <meshBasicMaterial color={m.color} depthTest={false} transparent />
            </mesh>
            <Label text={m.text} color={m.color} position={[m.p.x, y + LABEL_LIFT, m.p.z]} size={0.05} />
          </group>
        );
      })}
      {editing && curve ? <PathHandles controls={controls} curve={curve} via={via} groundAt={groundAt} {...editing} /> : null}
      {play !== null && curve ? (
        <PlayMarker
          curve={curve}
          stops={stops}
          length={length}
          groundAt={groundAt}
          unit={unit}
          play={play}
          onStep={onPlayStep}
          onEnd={onPlayEnd}
        />
      ) : null}
    </group>
  );
}

/**
 * Griffe der Fahrlinie: Start/Ziel und Zwischenpunkte ziehen, auf die hohlen Punkte in
 * der Mitte eines Abschnitts ziehen fügt einen Zwischenpunkt ein (Linie wird zur Kurve),
 * Doppelklick bzw. Alt-Klick entfernt ihn.
 */
function PathHandles({
  controls,
  curve,
  via,
  groundAt,
  pick,
  consumed,
  controlsRef,
  onEdit,
}: {
  controls: RunControl[];
  curve: THREE.Curve<THREE.Vector3>;
  via: Waypoint[];
  groundAt: (p: Point) => number;
  pick: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
  consumed: WeakSet<Event>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onEdit: (patch: RunPathEdit, phase: EditPhase) => void;
}) {
  // Beim Einfügen: Liste nach dem Einfügen und Index des neuen Punkts, bis losgelassen wird.
  const inserting = useRef<{ via: Waypoint[]; index: number } | null>(null);
  const common = { pick, consumed, controlsRef };
  const at = (p: Point, lift = 0.1) => new THREE.Vector3(p.x, groundAt(p) + lift, p.z);
  const round = (p: Point) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
  return (
    <group>
      {controls.map((c) => {
        if (c.kind === "obstacle") return null;
        if (c.kind === "via")
          return (
            <DragHandle
              key={`v${c.viaIndex}`}
              {...common}
              position={at(c)}
              onDrag={(p, phase) => onEdit({ via: moveWaypoint(via, c.viaIndex!, round(p)) }, phase)}
              onRemove={() => onEdit({ via: removeWaypoint(via, c.viaIndex!) }, "commit")}
            />
          );
        const key = c.kind === "start" ? "start" : "end";
        return (
          <DragHandle
            key={key}
            {...common}
            size={0.042}
            color={c.kind === "start" ? COLORS.start : COLORS.end}
            position={at(c, 0.04)}
            onDrag={(p, phase) => onEdit({ [key]: round(p) }, phase)}
          />
        );
      })}
      {controls.slice(1).map((_, i) => {
        const mid = curve.getPoint((i + 0.5) / (controls.length - 1));
        return (
          <DragHandle
            key={`m${i}`}
            {...common}
            size={0.028}
            hollow
            position={new THREE.Vector3(mid.x, Math.max(mid.y, groundAt(mid) + 0.1), mid.z)}
            onDragStart={() => {
              const result = insertWaypoint(via, controls, i, round(mid));
              if (result.index < 0) return;
              inserting.current = result;
              onEdit({ via: result.via }, "preview");
            }}
            onDrag={(p, phase) => {
              const current = inserting.current;
              if (!current) return;
              if (phase === "preview") {
                current.via = moveWaypoint(current.via, current.index, round(p));
                return onEdit({ via: current.via }, "preview");
              }
              // Loslassen: letzte Vorschau übernehmen (der Mittelgriff selbst ist inzwischen gewandert).
              inserting.current = null;
              onEdit({ via: current.via }, "commit");
            }}
          />
        );
      })}
    </group>
  );
}

function SceneContent(
  props: ParkSceneProps & { orientation: EventTarget; onCamera: (camera: THREE.Camera) => void },
) {
  const { content, run, selectedObstacleId, assetUrls, editable } = props;
  const controlsRef = useRef<OrbitControls | null>(null);
  // Klicks, die ein Obstacle oder Griff bereits verarbeitet hat (sonst zählen sie als Bodentipp).
  const consumed = useMemo(() => new WeakSet<Event>(), []);
  const terrain = useTerrainGrid(content, assetUrls);
  const [modelGrid, setModelGrid] = useState<TerrainGrid | null>(null);
  const onModelHeights = useCallback((g: TerrainGrid | null) => setModelGrid(g), []);
  const ground = content.ground ?? null;
  // Höhenfeld für alles, was auf dem Boden liegt: amtliches Gelände oder hochgeladener Scan.
  const grid = terrain ?? (ground?.kind === "model" ? modelGrid : null);
  const used = useMemo(
    () => new Set(run?.steps.map((s) => s.obstacle_id) ?? []),
    [run],
  );
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
  const heightAt = useMemo(
    () => (grid ? (x: number, z: number) => terrainHeightAt(grid, x, z) : null),
    [grid],
  );
  const groundAt = useMemo(
    () => (p: Point) => (heightAt ? heightAt(p.x, p.z) : 0),
    [heightAt],
  );
  const flatHeight = useCallback((x: number, z: number) => (heightAt ? heightAt(x, z) : 0), [heightAt]);
  const pick = useGroundPick(heightAt, grid ? Math.min(0.25, grid.width / grid.cols) : 0.25);
  const { width, length } = content.size;
  const aerialUrl = content.aerial ? (assetUrls[content.aerial.path] ?? null) : null;
  // Maßstab für Linie, Pfeile und Markierungen aus dem tatsächlich genutzten Bereich
  // (Obstacles, Start/Ziel) – nicht aus der Grundfläche, die viel größer sein kann als ein Scan.
  const unit = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const o of content.obstacles) {
      const r = Math.max(o.width, o.length) / 2;
      xs.push(o.x - r, o.x + r);
      zs.push(o.z - r, o.z + r);
    }
    for (const p of [run?.start, run?.end]) {
      if (!p) continue;
      xs.push(p.x);
      zs.push(p.z);
    }
    const extent = xs.length
      ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
      : Math.max(width, length);
    return Math.min(3, Math.max(0.5, extent / 40));
  }, [content.obstacles, run?.start, run?.end, width, length]);

  // Gewähltes Obstacle (mit berechneter Bereichshöhe) für Werkzeuge und „Auswahl zentrieren“.
  const selected = obstacles.find((o) => o.id === selectedObstacleId) ?? null;
  const selectedRaw = content.obstacles.find((o) => o.id === selectedObstacleId) ?? null;
  const selectedBase = selected ? baseOf(selected) : 0;
  const focus = selected
    ? {
        x: selected.x,
        y: selectedBase + selected.height / 2,
        z: selected.z,
        size: Math.max(selected.width, selected.length, selected.height),
      }
    : null;
  const [transforming, setTransforming] = useState(false);
  const onTransformState = props.onTransformState;
  const reportTransform = useCallback(
    (state: TransformState | null) => {
      setTransforming(Boolean(state));
      onTransformState?.(state);
    },
    [onTransformState],
  );
  const draft = props.draftPolygon ?? null;
  const closeTarget =
    draft && draft.length >= 3 ? new THREE.Vector3(draft[0].x, flatHeight(draft[0].x, draft[0].z), draft[0].z) : null;

  return (
    <>
      <CameraRig
        topView={props.topView}
        onTopViewChange={props.onTopViewChange}
        park={content.size}
        controlsRef={controlsRef}
        orientation={props.orientation}
        command={props.command ?? null}
        focus={focus}
      />
      <CameraBridge onCamera={props.onCamera} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[12, 24, 16]} intensity={1.6} />
      {ground?.kind === "terrain" ? (
        grid ? <TerrainMesh grid={grid} aerial={content.aerial} aerialUrl={aerialUrl} /> : null
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ground ? -0.02 : 0, 0]}>
            <planeGeometry args={[width, length]} />
            <meshBasicMaterial color={COLORS.ground} />
          </mesh>
          {content.aerial && aerialUrl ? <AerialPlane url={aerialUrl} aerial={content.aerial} /> : null}
          {ground?.kind === "model" && assetUrls[ground.path] ? (
            <GroundModel
              ground={ground}
              url={assetUrls[ground.path]}
              size={content.size}
              onHeights={onModelHeights}
              onBounds={props.onModelBounds}
            />
          ) : null}
        </>
      )}
      {props.showGrid !== false ? <ReferenceGrid width={width} length={length} heightAt={heightAt} /> : null}
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
          editable={editable && !transforming}
          interactive={!props.pickThrough && !transforming && Boolean(props.onObstacleClick || props.onObstacleEdit)}
          parkSize={content.size}
          consumed={consumed}
          controlsRef={controlsRef}
          onClick={props.onObstacleClick}
          pickGround={pick}
          // Mit der Maus gezogen wird das Original (ohne berechnete Bereichshöhe) geändert.
          onEdit={(next, phase) => {
            const raw = content.obstacles.find((x) => x.id === next.id);
            props.onObstacleEdit?.(raw ? { ...raw, x: next.x, z: next.z } : next, phase);
          }}
        />
      ))}
      {editable && selectedRaw?.type === "zone" && selected && !transforming && !draft ? (
        <ZoneHandles
          zone={selectedRaw}
          top={selectedBase + selected.height}
          selected={props.selectedVertices ?? []}
          onSelect={(indices) => props.onSelectVertices?.(indices)}
          pick={pick}
          consumed={consumed}
          controlsRef={controlsRef}
          onEdit={(next, phase) => props.onObstacleEdit?.(next, phase)}
        />
      ) : null}
      <TransformTool
        selected={selectedRaw}
        vertices={props.selectedVertices ?? []}
        base={selectedBase}
        enabled={editable && !draft && Boolean(props.onObstacleEdit)}
        command={props.command ?? null}
        controlsRef={controlsRef}
        onEdit={(next, phase) => props.onObstacleEdit?.(next, phase)}
        onState={reportTransform}
      />
      <GroundPicker
        pick={pick}
        consumed={consumed}
        onClick={
          props.onGroundClick && !transforming
            ? (p, info) => props.onGroundClick?.({ x: p.x, z: p.z }, info)
            : undefined
        }
        onDoubleClick={props.onGroundDoubleClick}
        showCursor={Boolean(props.showCursor)}
        closeTarget={closeTarget}
        unit={unit}
      />
      {draft && draft.length ? <PolygonDraft points={draft} heightAt={flatHeight} unit={unit} /> : null}
      {run ? (
        <RunOverlay
          run={run}
          obstacles={obstacles}
          activeStep={props.activeStep ?? null}
          baseOf={baseOf}
          groundAt={groundAt}
          unit={unit}
          editing={
            props.onRunPathEdit && !props.pickThrough
              ? { pick, consumed, controlsRef, onEdit: props.onRunPathEdit }
              : null
          }
          play={props.play ?? null}
          onPlayStep={props.onPlayStep}
          onPlayEnd={props.onPlayEnd}
        />
      ) : null}
    </>
  );
}

export default function ParkScene(props: ParkSceneProps) {
  // Kamera-Drehungen werden über dieses Ereignisziel an das Gizmo gemeldet (ohne React-Neuaufbau der Szene).
  const orientation = useMemo(() => new EventTarget(), []);
  const [camera, setCamera] = useState<THREE.Camera | null>(null);
  const [gizmoCommand, setGizmoCommand] = useState<SceneCommand | null>(null);
  const onView = useCallback((view: ViewName) => setGizmoCommand(makeCommand({ type: "view", view })), []);
  // Befehle aus Planer und Gizmo zusammenführen: der jüngere gewinnt.
  const command =
    gizmoCommand && (!props.command || gizmoCommand.id > props.command.id) ? gizmoCommand : (props.command ?? null);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 2000, position: [0, 25, 30] }}
        aria-label={props.label}
        role="img"
        style={{ touchAction: "none", cursor: props.showCursor ? "crosshair" : undefined }}
      >
        <color attach="background" args={["#f5f7f9"]} />
        <SceneContent {...props} command={command} orientation={orientation} onCamera={setCamera} />
      </Canvas>
      <div style={{ position: "absolute", right: 8, top: 54, zIndex: 2 }}>
        <AxisGizmo orientation={orientation} camera={camera} onView={onView} />
      </div>
    </div>
  );
}
