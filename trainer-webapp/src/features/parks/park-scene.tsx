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
import { obstacleParts } from "./obstacle-geometry";

/**
 * Ruhige 3D-Darstellung eines Parks (Schritt 7): wenige Farben, flache Schattierung,
 * Beschriftung nur über nummerierte Pins. Bearbeitungswerkzeuge liegen außerhalb
 * des Canvas; hier werden nur Zeiger-Ereignisse an die Planer-Logik gemeldet.
 */

const COLORS = {
  ground: "#eef2f5",
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
  aerialUrl?: string | null;
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

function AerialPlane({
  url,
  aerial,
  onClick,
}: {
  url: string;
  aerial: NonNullable<ParkContent["aerial"]>;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
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

function ObstacleMesh({
  obstacle,
  color,
  editable,
  controlsRef,
  onClick,
  onMove,
}: {
  obstacle: Obstacle;
  color: string;
  editable: boolean;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  onClick?: (id: string) => void;
  onMove?: (id: string, point: Point) => void;
}) {
  const parts = obstacleParts(obstacle);
  const drag = useRef<{ dx: number; dz: number } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  function groundPoint(e: ThreeEvent<PointerEvent>) {
    return e.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  return (
    <group
      position={[obstacle.x, 0, obstacle.z]}
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
    </group>
  );
}

/** Flaches Band zwischen zwei Punkten; dicker und besser sichtbar als eine 1-px-Linie. */
function Segment({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
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
      <boxGeometry args={[0.16, 0.04, length]} />
      <meshBasicMaterial color={COLORS.path} transparent opacity={0.85} depthTest={false} />
    </mesh>
  );
}

function RunOverlay({
  run,
  obstacles,
  activeStep,
}: {
  run: NonNullable<ParkSceneProps["run"]>;
  obstacles: Obstacle[];
  activeStep: number | null;
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
      return new THREE.Vector3(p.x, (o ? Math.min(o.height, 2) : 0) + 0.06, p.z);
    });
  }, [run, obstacles, byId]);
  const arrows = useMemo(
    () => pathArrows(points.map((p) => ({ x: p.x, z: p.z }))),
    [points],
  );
  const pins = useMemo(() => pinLayout(run.steps, obstacles), [run.steps, obstacles]);

  return (
    <group>
      {points.slice(1).map((p, i) => (
        <Segment key={i} a={points[i]} b={p} />
      ))}
      {arrows.map((a, i) => (
        <mesh
          key={i}
          position={[a.x, (points[i].y + points[i + 1].y) / 2 + 0.1, a.z]}
          // Kegel zuerst flach legen (Spitze nach +z), dann in Fahrtrichtung drehen.
          rotation={[Math.PI / 2, a.angle, 0, "YXZ"]}
          renderOrder={6}
        >
          <coneGeometry args={[0.35, 0.8, 3]} />
          <meshBasicMaterial color={COLORS.path} depthTest={false} />
        </mesh>
      ))}
      {pins.map((pin) => {
        const o = byId.get(pin.obstacleId);
        return (
          <group key={pin.number}>
            {o ? (
              <mesh position={[pin.x, (o.height + pin.y) / 2, pin.z]}>
                <cylinderGeometry args={[0.02, 0.02, pin.y - o.height, 4]} />
                <meshBasicMaterial color={COLORS.pin} />
              </mesh>
            ) : null}
            <Label
              text={String(pin.number)}
              color={COLORS.pin}
              position={[pin.x, pin.y, pin.z]}
              ring={activeStep === pin.number - 1}
            />
          </group>
        );
      })}
      <Label text="S" color={COLORS.start} position={[run.start.x, 1.2, run.start.z]} scale={1.7} />
      <Label text="Z" color={COLORS.end} position={[run.end.x, 1.2, run.end.z]} scale={1.7} />
    </group>
  );
}

function SceneContent(props: ParkSceneProps) {
  const { content, run, selectedObstacleId, onGroundClick } = props;
  const controlsRef = useRef<OrbitControls | null>(null);
  const used = useMemo(
    () => new Set(run?.steps.map((s) => s.obstacle_id) ?? []),
    [run],
  );
  const groundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || !onGroundClick) return;
    e.stopPropagation();
    onGroundClick({ x: e.point.x, z: e.point.z });
  };
  const { width, length } = content.size;

  return (
    <>
      <Controls topView={props.topView} park={content.size} controlsRef={controlsRef} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[12, 24, 16]} intensity={1.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={groundClick}>
        <planeGeometry args={[width, length]} />
        <meshBasicMaterial color={COLORS.ground} />
      </mesh>
      <gridHelper
        args={[Math.max(width, length), Math.max(width, length), COLORS.grid, COLORS.grid]}
        position={[0, 0.002, 0]}
        scale={[width / Math.max(width, length), 1, length / Math.max(width, length)]}
      />
      {content.aerial && props.aerialUrl ? (
        <AerialPlane url={props.aerialUrl} aerial={content.aerial} onClick={groundClick} />
      ) : null}
      {content.obstacles.map((o) => (
        <ObstacleMesh
          key={o.id}
          obstacle={o}
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
        <RunOverlay run={run} obstacles={content.obstacles} activeStep={props.activeStep ?? null} />
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
