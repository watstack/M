import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { SPHERE_RADIUS, vec3ToThree } from '../../lib/uvMath';

/** Live preview of the polygon currently being drawn in Paint mode, drawn
 * directly on the sphere surface — UV space and sphere-surface space are
 * the same coordinate system for an equirectangular map, so no separate
 * 2D drawing UI is needed. */
export function MaskEditorOverlay() {
  const draftMaskPoints = useProjectStore((s) => s.draftMaskPoints);

  const points = useMemo(
    () =>
      draftMaskPoints.map((p) =>
        vec3ToThree(p.direction)
          .normalize()
          .multiplyScalar(SPHERE_RADIUS - 1)
          .toArray(),
      ),
    [draftMaskPoints],
  );

  if (points.length === 0) return null;

  return (
    <group>
      {points.length > 1 && <Line points={points as [number, number, number][]} color="#38bdf8" lineWidth={2} />}
      {points.map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color={i === 0 ? '#facc15' : '#38bdf8'} />
        </mesh>
      ))}
    </group>
  );
}
