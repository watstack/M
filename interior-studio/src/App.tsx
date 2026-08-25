import { useEffect } from 'react';
import { AutoRotateToggle } from './components/viewer/AutoRotateToggle';
import { Scene } from './components/viewer/Scene';
import { UploadDropzone } from './components/upload/UploadDropzone';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { RightInspector } from './components/layout/RightInspector';
import { Toolbar } from './components/layout/Toolbar';
import { CompassIndicator } from './components/layout/CompassIndicator';
import { MeasurementTool } from './components/measure/MeasurementTool';
import { SaveExportPanel } from './components/export/SaveExportPanel';
import { MoodOverlay } from './components/lighting/MoodOverlay';
import { TimeOfDayPresets } from './components/lighting/TimeOfDayPresets';
import { useProjectStore } from './store/useProjectStore';
import { getFurnitureItem } from './lib/furnitureCatalog';
import { SWATCHES } from './lib/swatches';
import { importProjectFromFile } from './lib/persistence';

const DEFAULT_SWATCH_ID = SWATCHES[0].id;

export default function App() {
  const hasRooms = useProjectStore((s) => s.rooms.length > 0);
  const loadProject = useProjectStore((s) => s.loadProject);
  const mode = useProjectStore((s) => s.mode);
  const armedPlacement = useProjectStore((s) => s.armedPlacement);
  const setArmedPlacement = useProjectStore((s) => s.setArmedPlacement);
  const setMode = useProjectStore((s) => s.setMode);
  const currentRoomId = useProjectStore((s) => s.currentRoomId);
  const draftMaskPoints = useProjectStore((s) => s.draftMaskPoints);
  const clearDraftMask = useProjectStore((s) => s.clearDraftMask);
  const addMask = useProjectStore((s) => s.addMask);
  const setSelection = useProjectStore((s) => s.setSelection);
  const maskCount = useProjectStore((s) => {
    const room = s.rooms.find((r) => r.id === s.currentRoomId);
    return room?.masks.length ?? 0;
  });

  useEffect(() => {
    if (!armedPlacement) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setArmedPlacement(null);
        setMode('look');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [armedPlacement, setArmedPlacement, setMode]);

  if (!hasRooms) {
    return (
      <div className="relative h-screen w-screen bg-neutral-950">
        <UploadDropzone />
        <label className="absolute right-4 bottom-4 cursor-pointer text-xs text-white/40 underline hover:text-white/70">
          or import a saved project (.json)
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const project = await importProjectFromFile(file);
                loadProject(project);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to import project file');
              }
            }}
          />
        </label>
      </div>
    );
  }

  const armedLabel =
    armedPlacement?.kind === 'portal'
      ? `a portal to “${armedPlacement.label}”`
      : armedPlacement?.kind === 'furniture'
        ? `“${getFurnitureItem(armedPlacement.modelId)?.name ?? 'furniture'}”`
        : null;

  const finishShape = () => {
    if (!currentRoomId || draftMaskPoints.length < 3) return;
    const maskId = addMask(currentRoomId, {
      label: `Mask ${maskCount + 1}`,
      points: draftMaskPoints.map((p) => p.uv),
      swatchId: DEFAULT_SWATCH_ID,
      opacity: 0.85,
      blendMode: 'normal',
    });
    clearDraftMask();
    setSelection({ type: 'mask', id: maskId });
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-neutral-950">
      <LeftSidebar />
      <div className="relative flex-1">
        <Scene />
        <MoodOverlay />
        <CompassIndicator />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 p-4">
          <h1 className="pointer-events-auto flex-none text-sm font-medium tracking-wide whitespace-nowrap text-white/80">
            Interior Design Studio
          </h1>
          <div className="pointer-events-auto flex-none">
            <Toolbar />
          </div>
          <div className="pointer-events-auto flex flex-none items-center gap-2">
            <TimeOfDayPresets />
            <SaveExportPanel />
            <AutoRotateToggle />
          </div>
        </div>
        {armedLabel && (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
            <div className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
              Click anywhere in the scene to place {armedLabel} —{' '}
              <button
                type="button"
                className="underline hover:text-sky-300"
                onClick={() => {
                  setArmedPlacement(null);
                  setMode('look');
                }}
              >
                cancel (Esc)
              </button>
            </div>
          </div>
        )}
        {mode === 'paint' && (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
              {draftMaskPoints.length === 0 ? (
                <span>Click points around a surface to draw a material mask</span>
              ) : (
                <>
                  <span>{draftMaskPoints.length} point(s)</span>
                  <button
                    type="button"
                    disabled={draftMaskPoints.length < 3}
                    onClick={finishShape}
                    className="rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Finish shape
                  </button>
                  <button type="button" onClick={clearDraftMask} className="text-xs underline hover:text-sky-300">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <MeasurementTool />
      </div>
      <RightInspector />
    </div>
  );
}
