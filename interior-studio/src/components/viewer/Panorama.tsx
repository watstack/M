import { useLoader, type ThreeEvent } from '@react-three/fiber';
import { DoubleSide, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { useEffect } from 'react';
import { useCurrentRoom } from '../../store/useProjectStore';
import { SPHERE_RADIUS } from '../../lib/uvMath';
import { useMaskedTexture } from '../paint/maskCompositor';
import type { Room } from '../../types/project';

interface PanoramaProps {
  onSurfacePointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onSurfacePointerMove?: (event: ThreeEvent<PointerEvent>) => void;
}

/** Renders the current room's equirectangular photo on the inside of a
 * sphere. scale.x = -1 flips the geometry's winding so the camera at the
 * sphere's center sees the inside surface, per the core-concept spec.
 * DoubleSide is set explicitly because the renderer's automatic
 * negative-determinant culling flip isn't reliable across all backends
 * (notably software/SwiftShader WebGL) — DoubleSide guarantees the inside
 * faces render regardless.
 *
 * Rooms with no material masks render the original full-resolution photo
 * for maximum sharpness. The moment a room gets its first mask, it switches
 * to the capped-resolution CanvasTexture compositing pipeline (see
 * maskCompositor.ts) so recompositing cost stays bounded regardless of the
 * source upload's resolution. */
export function Panorama({ onSurfacePointerDown, onSurfacePointerMove }: PanoramaProps) {
  const room = useCurrentRoom();
  if (!room) return null;
  return room.masks.length > 0 ? (
    <MaskedPanoramaSphere
      key={room.id}
      room={room}
      onSurfacePointerDown={onSurfacePointerDown}
      onSurfacePointerMove={onSurfacePointerMove}
    />
  ) : (
    <PlainPanoramaSphere
      key={room.id}
      imageDataUrl={room.imageDataUrl}
      onSurfacePointerDown={onSurfacePointerDown}
      onSurfacePointerMove={onSurfacePointerMove}
    />
  );
}

function PlainPanoramaSphere({
  imageDataUrl,
  onSurfacePointerDown,
  onSurfacePointerMove,
}: { imageDataUrl: string } & PanoramaProps) {
  const texture = useLoader(TextureLoader, imageDataUrl);
  useEffect(() => {
    applyColorSpace(texture);
  }, [texture]);

  return (
    <mesh scale={[-1, 1, 1]} onPointerDown={onSurfacePointerDown} onPointerMove={onSurfacePointerMove}>
      <sphereGeometry args={[SPHERE_RADIUS, 64, 40]} />
      <meshBasicMaterial map={texture} side={DoubleSide} />
    </mesh>
  );
}

function MaskedPanoramaSphere({
  room,
  onSurfacePointerDown,
  onSurfacePointerMove,
}: { room: Room } & PanoramaProps) {
  const texture = useMaskedTexture(room);
  if (!texture) return null;

  return (
    <mesh scale={[-1, 1, 1]} onPointerDown={onSurfacePointerDown} onPointerMove={onSurfacePointerMove}>
      <sphereGeometry args={[SPHERE_RADIUS, 64, 40]} />
      <meshBasicMaterial map={texture} side={DoubleSide} />
    </mesh>
  );
}

function applyColorSpace(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}
