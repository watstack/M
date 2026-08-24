import { useCurrentRoom, useProjectStore } from '../../store/useProjectStore';
import { CalibrationDialog } from './CalibrationDialog';

/** Floating status/control strip for Measure mode: prompts calibration
 * before any room has one, otherwise guides the two-click measurement
 * capture. Renders CalibrationDialog once two reference points land. */
export function MeasurementTool() {
  const mode = useProjectStore((s) => s.mode);
  const room = useCurrentRoom();
  const measureDraftPoints = useProjectStore((s) => s.measureDraftPoints);
  const calibrating = useProjectStore((s) => s.calibrating);
  const setCalibrating = useProjectStore((s) => s.setCalibrating);
  const clearMeasureDraft = useProjectStore((s) => s.clearMeasureDraft);

  if (mode !== 'measure' || !room) return null;

  const needsCalibration = calibrating || !room.calibration;
  if (needsCalibration && measureDraftPoints.length === 2) {
    return <CalibrationDialog />;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
        {needsCalibration ? (
          <span>Calibrate: click two points of a known real-world distance ({measureDraftPoints.length}/2)</span>
        ) : (
          <>
            <span>
              Click two points to measure ({measureDraftPoints.length}/2) — calibrated at{' '}
              {room.calibration?.referenceLabel}
            </span>
            <button type="button" onClick={() => setCalibrating(true)} className="text-xs underline hover:text-sky-300">
              Recalibrate
            </button>
          </>
        )}
        {measureDraftPoints.length > 0 && (
          <button type="button" onClick={clearMeasureDraft} className="text-xs underline hover:text-sky-300">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
