import { useProjectStore } from '../../store/useProjectStore';
import type { Mode } from '../../types/project';

const MODES: { id: Mode; label: string }[] = [
  { id: 'look', label: 'Look' },
  { id: 'place', label: 'Place' },
  { id: 'paint', label: 'Paint' },
  { id: 'measure', label: 'Measure' },
];

export function Toolbar() {
  const mode = useProjectStore((s) => s.mode);
  const setMode = useProjectStore((s) => s.setMode);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-black/50 p-1 backdrop-blur">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === m.id ? 'bg-sky-500 text-white' : 'text-white/70 hover:bg-white/10'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
