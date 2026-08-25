export type Mode = 'look' | 'place' | 'paint' | 'measure';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface UV {
  u: number;
  v: number;
}

export interface Portal {
  id: string;
  direction: Vec3;
  targetRoomId: string;
  label: string;
  entryYaw?: number;
}

export interface Placement {
  id: string;
  modelId: string;
  direction: Vec3;
  depth: number;
  rotationY: number;
  scale: number;
}

export type BlendMode = 'normal' | 'multiply' | 'overlay';

export interface MaskRegion {
  id: string;
  label: string;
  points: UV[];
  swatchId: string;
  opacity: number;
  blendMode: BlendMode;
}

export interface Measurement {
  id: string;
  pointA: Vec3;
  pointB: Vec3;
  realDistanceMm: number;
  label?: string;
}

export interface Calibration {
  scaleFactorMmPerUnit: number;
  referenceLabel: string;
}

export interface Room {
  id: string;
  name: string;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  aspectWarning: boolean;
  calibration: Calibration | null;
  portals: Portal[];
  placements: Placement[];
  masks: MaskRegion[];
  measurements: Measurement[];
}

export type SelectionType = 'placement' | 'mask' | 'measurement' | 'portal';

export interface Selection {
  type: SelectionType | null;
  id: string | null;
}

export interface MoodOverlayState {
  color: string;
  opacity: number;
  brightness: number;
  saturate: number;
  presetId: string | null;
}

/** A placement "armed" by the user (picked from the furniture catalog or a
 * "link to room" action) waiting for the next click on the panorama surface
 * to resolve it — the click-to-arm-then-click-to-place pattern. */
export type ArmedPlacement =
  | { kind: 'furniture'; modelId: string }
  | { kind: 'portal'; targetRoomId: string; label: string };

/** One vertex of an in-progress mask polygon being drawn in Paint mode —
 * carries both the UV point (for the eventual stored MaskRegion) and the
 * world-space direction (to draw the live preview line on the sphere). */
export interface DraftMaskPoint {
  direction: Vec3;
  uv: UV;
}

/** The subset of state that gets persisted / exported as JSON (schemaVersion 1). */
export interface ProjectFile {
  schemaVersion: 1;
  projectName: string;
  updatedAt: string;
  currentRoomId: string | null;
  rooms: Room[];
}
