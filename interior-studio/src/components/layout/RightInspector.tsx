import type { ReactNode } from 'react';
import { useCurrentRoom, useProjectStore } from '../../store/useProjectStore';
import { getFurnitureItem } from '../../lib/furnitureCatalog';
import { SwatchPanel } from '../paint/SwatchPanel';
import type { BlendMode } from '../../types/project';

export function RightInspector() {
  const selection = useProjectStore((s) => s.selection);
  const room = useCurrentRoom();
  const setSelection = useProjectStore((s) => s.setSelection);

  if (!room) return null;

  let body: ReactNode = null;
  if (selection.type === 'placement') {
    const placement = room.placements.find((p) => p.id === selection.id);
    if (placement) body = <PlacementFields roomId={room.id} placementId={placement.id} />;
  } else if (selection.type === 'mask') {
    const mask = room.masks.find((m) => m.id === selection.id);
    if (mask) body = <MaskFields roomId={room.id} maskId={mask.id} />;
  }

  if (!body) return null;

  return (
    <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-neutral-900/90 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-white/50 uppercase">Selected</h2>
        <button
          type="button"
          onClick={() => setSelection({ type: null, id: null })}
          className="text-white/40 hover:text-white"
        >
          ✕
        </button>
      </div>
      {body}
    </div>
  );
}

function PlacementFields({ roomId, placementId }: { roomId: string; placementId: string }) {
  const room = useCurrentRoom();
  const updatePlacement = useProjectStore((s) => s.updatePlacement);
  const removePlacement = useProjectStore((s) => s.removePlacement);
  const setSelection = useProjectStore((s) => s.setSelection);
  const placement = room?.placements.find((p) => p.id === placementId);
  if (!placement) return null;
  const item = getFurnitureItem(placement.modelId);
  const rotationDeg = Math.round((placement.rotationY * 180) / Math.PI);

  return (
    <>
      <p className="text-sm text-white">{item?.name ?? placement.modelId}</p>

      <label className="flex flex-col gap-1 text-xs text-white/60">
        Depth ({placement.depth.toFixed(1)}m)
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.25}
          value={placement.depth}
          onChange={(e) => updatePlacement(roomId, placementId, { depth: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-white/60">
        Rotation ({rotationDeg}°)
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={rotationDeg}
          onChange={(e) => updatePlacement(roomId, placementId, { rotationY: (Number(e.target.value) * Math.PI) / 180 })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-white/60">
        Scale ({placement.scale.toFixed(2)}x)
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={placement.scale}
          onChange={(e) => updatePlacement(roomId, placementId, { scale: Number(e.target.value) })}
        />
      </label>

      <button
        type="button"
        onClick={() => {
          removePlacement(roomId, placementId);
          setSelection({ type: null, id: null });
        }}
        className="mt-2 rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
      >
        Delete
      </button>
    </>
  );
}

function MaskFields({ roomId, maskId }: { roomId: string; maskId: string }) {
  const room = useCurrentRoom();
  const updateMask = useProjectStore((s) => s.updateMask);
  const removeMask = useProjectStore((s) => s.removeMask);
  const setSelection = useProjectStore((s) => s.setSelection);
  const mask = room?.masks.find((m) => m.id === maskId);
  if (!mask) return null;

  return (
    <>
      <p className="text-sm text-white">{mask.label}</p>

      <div className="flex flex-col gap-1.5 text-xs text-white/60">
        Material
        <SwatchPanel selectedSwatchId={mask.swatchId} onSelect={(swatchId) => updateMask(roomId, maskId, { swatchId })} />
      </div>

      <label className="flex flex-col gap-1 text-xs text-white/60">
        Opacity ({Math.round(mask.opacity * 100)}%)
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mask.opacity}
          onChange={(e) => updateMask(roomId, maskId, { opacity: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-white/60">
        Blend mode
        <select
          value={mask.blendMode}
          onChange={(e) => updateMask(roomId, maskId, { blendMode: e.target.value as BlendMode })}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white"
        >
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="overlay">Overlay</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() => {
          removeMask(roomId, maskId);
          setSelection({ type: null, id: null });
        }}
        className="mt-2 rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
      >
        Delete
      </button>
    </>
  );
}
