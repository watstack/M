import { useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useSphereRaycast } from './useSphereRaycast';
import { DEFAULT_PLACEMENT_DEPTH, useProjectStore } from '../store/useProjectStore';
import { chordDistance } from '../lib/uvMath';

/** Central dispatch for clicks/drags on the panorama surface: resolves the
 * raycast hit once via useSphereRaycast, then routes it based on the
 * current mode / armed placement / active drag. Mask-drawing and
 * measurement clicks route through here too once those tools land. */
export function useSurfaceInteraction() {
  const { getHit } = useSphereRaycast();

  const handleSurfacePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const state = useProjectStore.getState();
      const { mode, armedPlacement, currentRoomId } = state;
      if (!currentRoomId) return;

      if (mode === 'place' && armedPlacement) {
        event.stopPropagation();
        const hit = getHit(event);

        if (armedPlacement.kind === 'portal') {
          state.addPortal(currentRoomId, {
            direction: hit.direction,
            targetRoomId: armedPlacement.targetRoomId,
            label: armedPlacement.label,
          });
          state.setArmedPlacement(null);
          state.setMode('look');
        } else if (armedPlacement.kind === 'furniture') {
          const placementId = state.addPlacement(currentRoomId, {
            modelId: armedPlacement.modelId,
            direction: hit.direction,
            depth: DEFAULT_PLACEMENT_DEPTH,
            rotationY: 0,
            scale: 1,
          });
          state.setArmedPlacement(null);
          state.setSelection({ type: 'placement', id: placementId });
        }
      } else if (mode === 'paint') {
        event.stopPropagation();
        const hit = getHit(event);
        if (hit.uv) {
          state.addDraftMaskPoint({ direction: hit.direction, uv: hit.uv });
        }
      } else if (mode === 'measure') {
        event.stopPropagation();
        if (state.measureDraftPoints.length >= 2) return;
        const hit = getHit(event);
        const points = [...state.measureDraftPoints, hit.point];
        state.addMeasureDraftPoint(hit.point);
        if (points.length !== 2) return;

        const room = state.rooms.find((r) => r.id === currentRoomId);
        const needsCalibration = state.calibrating || !room?.calibration;
        if (!needsCalibration && room?.calibration) {
          const chord = chordDistance(points[0], points[1]);
          state.addMeasurement(currentRoomId, {
            pointA: points[0],
            pointB: points[1],
            realDistanceMm: chord * room.calibration.scaleFactorMmPerUnit,
          });
          state.clearMeasureDraft();
        }
        // else: leave the 2 draft points in place — CalibrationDialog reads
        // them and finishes the flow via setCalibration + clearMeasureDraft.
      }
    },
    [getHit],
  );

  const handleSurfacePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const state = useProjectStore.getState();
      const { currentRoomId, draggingPlacementId } = state;
      if (!currentRoomId || !draggingPlacementId) return;

      const hit = getHit(event);
      state.updatePlacement(currentRoomId, draggingPlacementId, { direction: hit.direction });
    },
    [getHit],
  );

  return { handleSurfacePointerDown, handleSurfacePointerMove };
}
