import { Vector3 } from 'three';
import type { Vec3 } from '../types/project';

/** Radius of the panorama sphere; camera sits at its center. */
export const SPHERE_RADIUS = 50;

export function vec3ToThree(v: Vec3): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

export function threeToVec3(v: Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Straight-line (chord) distance between two points. Since both points are
 * hits on the same fictitious-radius sphere, only the angular separation
 * between them carries real information; chord length is a monotonic
 * function of that angle, which is why measurements require a per-room
 * calibration factor before they mean anything in real-world units.
 */
export function chordDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
