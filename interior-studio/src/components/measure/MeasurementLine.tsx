import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Measurement } from '../../types/project';
import { vec3ToThree } from '../../lib/uvMath';

interface MeasurementLineProps {
  measurement: Measurement;
}

function formatDistance(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
}

/** A persistent floating measurement: a line between the two captured
 * points plus an always-facing distance label at the midpoint. */
export function MeasurementLine({ measurement }: MeasurementLineProps) {
  const a = useMemo(() => vec3ToThree(measurement.pointA).toArray() as [number, number, number], [measurement.pointA]);
  const b = useMemo(() => vec3ToThree(measurement.pointB).toArray() as [number, number, number], [measurement.pointB]);
  const midpoint = useMemo(
    () => vec3ToThree(measurement.pointA).lerp(vec3ToThree(measurement.pointB), 0.5).toArray() as [number, number, number],
    [measurement.pointA, measurement.pointB],
  );

  return (
    <group>
      <Line points={[a, b]} color="#facc15" lineWidth={2} />
      <Html position={midpoint} center>
        <div className="rounded-full bg-black/80 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow">
          {formatDistance(measurement.realDistanceMm)}
        </div>
      </Html>
    </group>
  );
}
