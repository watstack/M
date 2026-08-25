import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import type { Portal } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { SPHERE_RADIUS, vec3ToThree } from '../../lib/uvMath';

interface PortalHotspotProps {
  portal: Portal;
}

export function PortalHotspot({ portal }: PortalHotspotProps) {
  const mode = useProjectStore((s) => s.mode);
  const setCurrentRoom = useProjectStore((s) => s.setCurrentRoom);

  const position = useMemo(() => {
    return vec3ToThree(portal.direction).normalize().multiplyScalar(SPHERE_RADIUS - 2);
  }, [portal.direction]);

  return (
    <Html position={position} center>
      <button
        type="button"
        onClick={() => {
          if (mode !== 'look') return;
          setCurrentRoom(portal.targetRoomId);
        }}
        className="flex flex-col items-center gap-0.5 rounded-full bg-sky-500/90 px-3 py-2 text-xs font-medium whitespace-nowrap text-white shadow-lg ring-2 ring-white/40 hover:bg-sky-400"
      >
        <span aria-hidden>🚪</span>
        <span>{portal.label}</span>
      </button>
    </Html>
  );
}
