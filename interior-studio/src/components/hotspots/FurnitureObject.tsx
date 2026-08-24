import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Placement } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { getFurnitureItem } from '../../lib/furnitureCatalog';
import { vec3ToThree } from '../../lib/uvMath';

interface FurnitureObjectProps {
  placement: Placement;
}

/** A placed furniture model. Reposition is a custom drag (pointer-down here
 * arms a room-level drag that Panorama's pointer-move re-raycasts against
 * the sphere), keeping the object anchored to the photo surface instead of
 * floating in free 3D space. Rotation/scale/depth are edited numerically
 * via RightInspector. */
export function FurnitureObject({ placement }: FurnitureObjectProps) {
  const item = getFurnitureItem(placement.modelId);
  const gltf = useGLTF(item?.url ?? '');
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const mode = useProjectStore((s) => s.mode);
  const selection = useProjectStore((s) => s.selection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const setDraggingPlacementId = useProjectStore((s) => s.setDraggingPlacementId);

  const isSelected = selection.type === 'placement' && selection.id === placement.id;

  const position = useMemo(
    () => vec3ToThree(placement.direction).normalize().multiplyScalar(placement.depth),
    [placement.direction, placement.depth],
  );

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== 'place') return;
    event.stopPropagation();
    setSelection({ type: 'placement', id: placement.id });
    setDraggingPlacementId(placement.id);
  };

  return (
    <group
      position={position}
      rotation={[0, placement.rotationY, 0]}
      scale={placement.scale}
      onPointerDown={onPointerDown}
    >
      <primitive object={cloned} />
      {/* Generously-sized invisible hit target centered on the exact
       * placement point: real GLTF models can be small/oddly-pivoted,
       * making them hard to click precisely once placed several world
       * units away. Also doubles as a selection ring. */}
      <mesh>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshBasicMaterial color={isSelected ? '#38bdf8' : '#ffffff'} transparent opacity={isSelected ? 0.2 : 0.01} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/models/sheen-chair.glb');
useGLTF.preload('/models/glam-velvet-sofa.glb');
useGLTF.preload('/models/specular-silk-pouf.glb');
