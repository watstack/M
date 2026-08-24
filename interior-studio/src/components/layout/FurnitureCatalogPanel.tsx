import { FURNITURE_CATALOG } from '../../lib/furnitureCatalog';
import { useProjectStore } from '../../store/useProjectStore';

const ICONS: Record<string, string> = {
  'sheen-chair': '🪑',
  'glam-velvet-sofa': '🛋️',
  'specular-silk-pouf': '🟤',
};

export function FurnitureCatalogPanel() {
  const armedPlacement = useProjectStore((s) => s.armedPlacement);
  const setArmedPlacement = useProjectStore((s) => s.setArmedPlacement);
  const setMode = useProjectStore((s) => s.setMode);
  const currentRoomId = useProjectStore((s) => s.currentRoomId);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-white/50 uppercase">Furniture</h2>
      <div className="grid grid-cols-2 gap-2">
        {FURNITURE_CATALOG.map((item) => {
          const isArmed = armedPlacement?.kind === 'furniture' && armedPlacement.modelId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!currentRoomId}
              onClick={() => {
                setMode('place');
                setArmedPlacement({ kind: 'furniture', modelId: item.id });
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-[11px] transition-colors disabled:opacity-40 ${
                isArmed
                  ? 'border-sky-400 bg-sky-500/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <span className="text-xl" aria-hidden>
                {ICONS[item.id] ?? '🪑'}
              </span>
              <span>{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
