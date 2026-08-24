import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
import { Panorama } from './Panorama';
import { LoadingOverlay } from './LoadingOverlay';
import { ZoomFovControls } from './ZoomFovControls';
import { PortalHotspot } from '../hotspots/PortalHotspot';
import { FurnitureObject } from '../hotspots/FurnitureObject';
import { MaskEditorOverlay } from '../paint/MaskEditorOverlay';
import { MeasurementLine } from '../measure/MeasurementLine';
import { useCurrentRoom, useProjectStore } from '../../store/useProjectStore';
import { useSurfaceInteraction } from '../../hooks/useSurfaceInteraction';
import { vec3ToThree } from '../../lib/uvMath';
import { orbitControlsRef } from '../../lib/viewControls';

/** Tracks the camera's azimuthal look direction for CompassIndicator.
 * Rounds to whole degrees and only writes on change to avoid re-rendering
 * the HTML compass every animation frame. */
function CameraYawTracker() {
  const setCameraYawDeg = useProjectStore((s) => s.setCameraYawDeg);
  const dir = useRef(new Vector3());
  const lastYaw = useRef(0);

  useFrame(({ camera }) => {
    camera.getWorldDirection(dir.current);
    const yaw = Math.round((Math.atan2(dir.current.x, -dir.current.z) * 180) / Math.PI);
    if (yaw !== lastYaw.current) {
      lastYaw.current = yaw;
      setCameraYawDeg(yaw);
    }
  });

  return null;
}

function MeasureDraftPreview() {
  const points = useProjectStore((s) => s.measureDraftPoints);
  const positions = useMemo(() => points.map((p) => vec3ToThree(p).toArray() as [number, number, number]), [points]);
  if (positions.length === 0) return null;
  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}
    </group>
  );
}

interface SceneProps {
  children?: ReactNode;
}

/** Full-bleed 3D canvas: camera sits at the panorama sphere's center and
 * only rotates (no pan/dolly) — zoom is remapped to FOV by ZoomFovControls. */
export function Scene({ children }: SceneProps) {
  const autoRotate = useProjectStore((s) => s.autoRotate);
  const initialFov = useProjectStore((s) => s.fov);
  const draggingPlacementId = useProjectStore((s) => s.draggingPlacementId);
  const setDraggingPlacementId = useProjectStore((s) => s.setDraggingPlacementId);
  const moodOverlay = useProjectStore((s) => s.moodOverlay);
  const room = useCurrentRoom();
  const { handleSurfacePointerDown, handleSurfacePointerMove } = useSurfaceInteraction();

  useEffect(() => {
    const onPointerUp = () => setDraggingPlacementId(null);
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, [setDraggingPlacementId]);

  return (
    <Canvas
      className="!absolute inset-0"
      style={{ filter: `brightness(${moodOverlay.brightness}) saturate(${moodOverlay.saturate})` }}
      camera={{ position: [0, 0, 0.01], fov: initialFov, near: 0.1, far: 200 }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} />
      <CameraYawTracker />
      <Suspense fallback={<LoadingOverlay />}>
        <Panorama onSurfacePointerDown={handleSurfacePointerDown} onSurfacePointerMove={handleSurfacePointerMove} />
      </Suspense>
      {room?.portals.map((portal) => (
        <PortalHotspot key={portal.id} portal={portal} />
      ))}
      {room?.placements.map((placement) => (
        <Suspense key={placement.id} fallback={null}>
          <FurnitureObject placement={placement} />
        </Suspense>
      ))}
      <MaskEditorOverlay />
      {room?.measurements.map((measurement) => (
        <MeasurementLine key={measurement.id} measurement={measurement} />
      ))}
      <MeasureDraftPreview />
      {children}
      <OrbitControls
        ref={(instance) => {
          orbitControlsRef.current = instance;
        }}
        enablePan={false}
        enableZoom={false}
        enableRotate
        enabled={!draggingPlacementId}
        autoRotate={autoRotate}
        autoRotateSpeed={1}
      />
      <ZoomFovControls />
    </Canvas>
  );
}
