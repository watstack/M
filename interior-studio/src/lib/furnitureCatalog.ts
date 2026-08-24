export interface FurnitureCatalogItem {
  id: string;
  name: string;
  category: string;
  url: string;
}

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  { id: 'sheen-chair', name: 'Sheen Chair', category: 'Seating', url: '/models/sheen-chair.glb' },
  { id: 'glam-velvet-sofa', name: 'Glam Velvet Sofa', category: 'Seating', url: '/models/glam-velvet-sofa.glb' },
  { id: 'specular-silk-pouf', name: 'Silk Pouf', category: 'Seating', url: '/models/specular-silk-pouf.glb' },
];

export function getFurnitureItem(modelId: string): FurnitureCatalogItem | undefined {
  return FURNITURE_CATALOG.find((item) => item.id === modelId);
}
