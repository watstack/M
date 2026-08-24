import { Html, useProgress } from '@react-three/drei';

export function LoadingOverlay() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex w-56 flex-col items-center gap-2 rounded-lg bg-black/70 px-4 py-3 text-white">
        <span className="text-sm">Loading panorama…</span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Html>
  );
}
