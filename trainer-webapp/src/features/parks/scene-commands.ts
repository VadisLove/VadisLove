/**
 * Befehle und Zustände zwischen Planer, Werkzeugleiste und 3D-Szene. Bewusst ohne
 * three.js-Import, damit die Werkzeugleiste nicht die ganze 3D-Bibliothek lädt.
 */
import type { TransformAxis, TransformKind } from "@/domain/park-geometry";

export type ViewName = "top" | "front" | "back" | "right" | "left" | "home" | "focus";

/** Befehle aus der Werkzeugleiste an die Szene; `id` macht gleiche Befehle unterscheidbar. */
export type SceneCommand = { id: number } & (
  | { type: "transform"; kind: TransformKind }
  | { type: "axis"; axis: Exclude<TransformAxis, null> }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "view"; view: ViewName }
);

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type SceneCommandInput = Without<SceneCommand, "id">;
let commandSeq = 0;
/** Befehl mit fortlaufender ID (gleiche Befehle nacheinander lösen trotzdem aus). */
export const makeCommand = (c: SceneCommandInput) => ({ ...c, id: ++commandSeq }) as SceneCommand;

export interface TransformState {
  kind: TransformKind;
  axis: TransformAxis;
  text: string;
  /** Auf Touch-Geräten bzw. aus der Werkzeugleiste: Ziehen im Canvas statt Mausbewegung. */
  awaitingDrag: boolean;
}

export type EditPhase = "preview" | "commit" | "cancel";
