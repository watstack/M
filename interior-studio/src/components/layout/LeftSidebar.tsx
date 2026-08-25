import { SceneListPanel } from './SceneListPanel';
import { FurnitureCatalogPanel } from './FurnitureCatalogPanel';

export function LeftSidebar() {
  return (
    <div className="flex w-64 flex-col divide-y divide-white/10 overflow-y-auto border-r border-white/10 bg-neutral-900/90 backdrop-blur">
      <SceneListPanel />
      <div className="p-3">
        <FurnitureCatalogPanel />
      </div>
    </div>
  );
}
