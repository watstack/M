import { useState } from 'react';
import { useCurrentRoom, useProjectStore } from '../../store/useProjectStore';
import { chordDistance } from '../../lib/uvMath';

/** Shown once two calibration reference points are captured: asks for the
 * known real-world distance between them (e.g. a 600mm cabinet width) and
 * derives the room's mm-per-world-unit scale factor from it. Measurements
 * are meaningless in real units until this has run once per room, since
 * the sphere's radius is fictitious — only the calibrated scale makes
 * distances real. */
export function CalibrationDialog() {
  const room = useCurrentRoom();
  const measureDraftPoints = useProjectStore((s) => s.measureDraftPoints);
  const setCalibration = useProjectStore((s) => s.setCalibration);
  const clearMeasureDraft = useProjectStore((s) => s.clearMeasureDraft);
  const setCalibrating = useProjectStore((s) => s.setCalibrating);
  const [mm, setMm] = useState('600');

  if (!room || measureDraftPoints.length !== 2) return null;

  const confirm = () => {
    const value = Number(mm);
    if (!value || value <= 0) return;
    const chord = chordDistance(measureDraftPoints[0], measureDraftPoints[1]);
    setCalibration(room.id, { scaleFactorMmPerUnit: value / chord, referenceLabel: `${value}mm reference` });
    clearMeasureDraft();
    setCalibrating(false);
  };

  const cancel = () => {
    clearMeasureDraft();
    setCalibrating(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
        <span>Real-world distance between those points:</span>
        <input
          type="number"
          value={mm}
          onChange={(e) => setMm(e.target.value)}
          className="w-20 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white"
        />
        <span>mm</span>
        <button
          type="button"
          onClick={confirm}
          className="rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-400"
        >
          Set scale
        </button>
        <button type="button" onClick={cancel} className="text-xs underline hover:text-sky-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
