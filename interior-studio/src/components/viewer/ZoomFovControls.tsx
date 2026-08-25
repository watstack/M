import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { useProjectStore } from '../../store/useProjectStore';

const MIN_FOV = 30;
const MAX_FOV = 90;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Maps wheel/pinch input to camera FOV (like real photosphere viewers)
 * instead of dollying the camera, which would break the "inside a sphere"
 * illusion since the camera must stay at the sphere's center. */
export function ZoomFovControls() {
  const { camera, gl } = useThree();
  const fov = useProjectStore((s) => s.fov);
  const setFov = useProjectStore((s) => s.setFov);
  const pinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [camera, fov]);

  useEffect(() => {
    const el = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFov(clamp(useProjectStore.getState().fov + e.deltaY * 0.05, MIN_FOV, MAX_FOV));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchDistanceRef.current = touchDistance(e.touches);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDistanceRef.current !== null) {
        e.preventDefault();
        const d = touchDistance(e.touches);
        const delta = pinchDistanceRef.current - d;
        pinchDistanceRef.current = d;
        setFov(clamp(useProjectStore.getState().fov + delta * 0.15, MIN_FOV, MAX_FOV));
      }
    };

    const onTouchEnd = () => {
      pinchDistanceRef.current = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [gl, setFov]);

  return null;
}
