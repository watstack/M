import { useProjectStore } from '../../store/useProjectStore';

/** Bottom-left mini compass reacting to the camera's current look direction. */
export function CompassIndicator() {
  const yawDeg = useProjectStore((s) => s.cameraYawDeg);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur">
      <div className="relative h-11 w-11 transition-transform" style={{ transform: `rotate(${-yawDeg}deg)` }}>
        <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold text-red-400">N</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-white/50">S</span>
        <span className="absolute top-1/2 left-0 -translate-y-1/2 text-[10px] text-white/50">W</span>
        <span className="absolute top-1/2 right-0 -translate-y-1/2 text-[10px] text-white/50">E</span>
      </div>
      <div className="absolute top-1.5 h-2 w-0.5 rounded-full bg-sky-400" />
    </div>
  );
}
