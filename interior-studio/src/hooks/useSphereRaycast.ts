import { useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { UV, Vec3 } from '../types/project';

export interface SphereHit {
  point: Vec3;
  direction: Vec3;
  uv: UV | null;
}

/** Shared helper for turning a pointer event on the panorama sphere into a
 * placement-anchor direction and UV coordinate, reused by furniture
 * placement, mask drawing, and measurement clicks. */
export function useSphereRaycast() {
  const getHit = useCallback((event: ThreeEvent<PointerEvent | MouseEvent>): SphereHit => {
    const { point, uv } = event;
    const length = point.length() || 1;
    return {
      point: { x: point.x, y: point.y, z: point.z },
      direction: { x: point.x / length, y: point.y / length, z: point.z / length },
      uv: uv ? { u: uv.x, v: uv.y } : null,
    };
  }, []);

  return { getHit };
}
