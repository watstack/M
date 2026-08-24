import { useProjectStore } from '../../store/useProjectStore';

export function AutoRotateToggle() {
  const autoRotate = useProjectStore((s) => s.autoRotate);
  const setAutoRotate = useProjectStore((s) => s.setAutoRotate);

  return (
    <button
      type="button"
      onClick={() => setAutoRotate(!autoRotate)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        autoRotate ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
      }`}
    >
      {autoRotate ? 'Auto-rotate: On' : 'Auto-rotate: Off'}
    </button>
  );
}
