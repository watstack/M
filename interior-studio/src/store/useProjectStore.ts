import { create } from 'zustand';
import { loadProjectFromStorage, saveProjectToStorage } from '../lib/persistence';
import type {
  ArmedPlacement,
  Calibration,
  DraftMaskPoint,
  MaskRegion,
  Measurement,
  Mode,
  MoodOverlayState,
  Placement,
  Portal,
  ProjectFile,
  Room,
  Selection,
  Vec3,
} from '../types/project';

// Real GLTF furniture models are modeled in meters, so a "depth" here reads
// as roughly meters from the camera — 4 puts furniture at a plausible
// across-the-room distance instead of shrinking it to a speck near the
// fictitious 50-unit panorama shell.
export const DEFAULT_PLACEMENT_DEPTH = 4;

function genId(): string {
  return crypto.randomUUID();
}

function newRoom(input: Pick<Room, 'name' | 'imageDataUrl' | 'thumbnailDataUrl' | 'aspectWarning'>): Room {
  return {
    id: genId(),
    name: input.name,
    imageDataUrl: input.imageDataUrl,
    thumbnailDataUrl: input.thumbnailDataUrl,
    aspectWarning: input.aspectWarning,
    calibration: null,
    portals: [],
    placements: [],
    masks: [],
    measurements: [],
  };
}

function updateRoom(rooms: Room[], roomId: string, updater: (room: Room) => Room): Room[] {
  return rooms.map((room) => (room.id === roomId ? updater(room) : room));
}

interface ProjectStore {
  schemaVersion: 1;
  projectName: string;
  rooms: Room[];
  currentRoomId: string | null;
  mode: Mode;
  selection: Selection;
  autoRotate: boolean;
  fov: number;
  moodOverlay: MoodOverlayState;
  armedPlacement: ArmedPlacement | null;
  draggingPlacementId: string | null;
  draftMaskPoints: DraftMaskPoint[];
  measureDraftPoints: Vec3[];
  calibrating: boolean;
  cameraYawDeg: number;

  addRoom: (input: Pick<Room, 'name' | 'imageDataUrl' | 'thumbnailDataUrl' | 'aspectWarning'>) => string;
  removeRoom: (roomId: string) => void;
  setCurrentRoom: (roomId: string) => void;

  addPortal: (roomId: string, input: Omit<Portal, 'id'>) => string;
  removePortal: (roomId: string, portalId: string) => void;

  addPlacement: (roomId: string, input: Omit<Placement, 'id'>) => string;
  updatePlacement: (roomId: string, placementId: string, patch: Partial<Omit<Placement, 'id'>>) => void;
  removePlacement: (roomId: string, placementId: string) => void;

  addMask: (roomId: string, input: Omit<MaskRegion, 'id'>) => string;
  updateMask: (roomId: string, maskId: string, patch: Partial<Omit<MaskRegion, 'id'>>) => void;
  removeMask: (roomId: string, maskId: string) => void;

  addMeasurement: (roomId: string, input: Omit<Measurement, 'id'>) => string;
  removeMeasurement: (roomId: string, measurementId: string) => void;
  setCalibration: (roomId: string, calibration: Calibration) => void;

  setMode: (mode: Mode) => void;
  setSelection: (selection: Selection) => void;
  setAutoRotate: (value: boolean) => void;
  setFov: (fov: number) => void;
  setMoodOverlay: (patch: Partial<MoodOverlayState>) => void;
  setProjectName: (name: string) => void;
  setArmedPlacement: (armed: ArmedPlacement | null) => void;
  setDraggingPlacementId: (placementId: string | null) => void;
  addDraftMaskPoint: (point: DraftMaskPoint) => void;
  clearDraftMask: () => void;
  addMeasureDraftPoint: (point: Vec3) => void;
  clearMeasureDraft: () => void;
  setCameraYawDeg: (deg: number) => void;
  setCalibrating: (value: boolean) => void;

  loadProject: (file: ProjectFile) => void;
  resetProject: () => void;
}

const persisted = loadProjectFromStorage();

const initialState = {
  schemaVersion: 1 as const,
  projectName: persisted?.projectName ?? 'Untitled Project',
  rooms: persisted?.rooms ?? [],
  currentRoomId: persisted?.currentRoomId ?? null,
  mode: 'look' as Mode,
  selection: { type: null, id: null } as Selection,
  autoRotate: false,
  fov: 75,
  moodOverlay: { color: '#ffffff', opacity: 0, brightness: 1, saturate: 1, presetId: null } as MoodOverlayState,
  cameraYawDeg: 0,
  armedPlacement: null as ArmedPlacement | null,
  draggingPlacementId: null as string | null,
  draftMaskPoints: [] as DraftMaskPoint[],
  measureDraftPoints: [] as Vec3[],
  calibrating: false,
};

export const useProjectStore = create<ProjectStore>((set) => ({
  ...initialState,

  addRoom: (input) => {
    const room = newRoom(input);
    set((state) => ({
      rooms: [...state.rooms, room],
      currentRoomId: state.currentRoomId ?? room.id,
    }));
    return room.id;
  },

  removeRoom: (roomId) => {
    set((state) => {
      const rooms = state.rooms.filter((r) => r.id !== roomId);
      const currentRoomId = state.currentRoomId === roomId ? (rooms[0]?.id ?? null) : state.currentRoomId;
      return { rooms, currentRoomId };
    });
  },

  setCurrentRoom: (roomId) =>
    set({
      currentRoomId: roomId,
      selection: { type: null, id: null },
      draftMaskPoints: [],
      measureDraftPoints: [],
      calibrating: false,
    }),

  addPortal: (roomId, input) => {
    const portal: Portal = { ...input, id: genId() };
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({ ...room, portals: [...room.portals, portal] })),
    }));
    return portal.id;
  },

  removePortal: (roomId, portalId) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        portals: room.portals.filter((p) => p.id !== portalId),
      })),
    }));
  },

  addPlacement: (roomId, input) => {
    const placement: Placement = { ...input, id: genId() };
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        placements: [...room.placements, placement],
      })),
    }));
    return placement.id;
  },

  updatePlacement: (roomId, placementId, patch) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        placements: room.placements.map((p) => (p.id === placementId ? { ...p, ...patch } : p)),
      })),
    }));
  },

  removePlacement: (roomId, placementId) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        placements: room.placements.filter((p) => p.id !== placementId),
      })),
    }));
  },

  addMask: (roomId, input) => {
    const mask: MaskRegion = { ...input, id: genId() };
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({ ...room, masks: [...room.masks, mask] })),
    }));
    return mask.id;
  },

  updateMask: (roomId, maskId, patch) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        masks: room.masks.map((m) => (m.id === maskId ? { ...m, ...patch } : m)),
      })),
    }));
  },

  removeMask: (roomId, maskId) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        masks: room.masks.filter((m) => m.id !== maskId),
      })),
    }));
  },

  addMeasurement: (roomId, input) => {
    const measurement: Measurement = { ...input, id: genId() };
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        measurements: [...room.measurements, measurement],
      })),
    }));
    return measurement.id;
  },

  removeMeasurement: (roomId, measurementId) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({
        ...room,
        measurements: room.measurements.filter((m) => m.id !== measurementId),
      })),
    }));
  },

  setCalibration: (roomId, calibration) => {
    set((state) => ({
      rooms: updateRoom(state.rooms, roomId, (room) => ({ ...room, calibration })),
    }));
  },

  setMode: (mode) =>
    set({
      mode,
      selection: { type: null, id: null },
      armedPlacement: null,
      draftMaskPoints: [],
      measureDraftPoints: [],
      calibrating: false,
    }),
  setSelection: (selection) => set({ selection }),
  setAutoRotate: (value) => set({ autoRotate: value }),
  setFov: (fov) => set({ fov }),
  setMoodOverlay: (patch) => set((state) => ({ moodOverlay: { ...state.moodOverlay, ...patch } })),
  setProjectName: (name) => set({ projectName: name }),
  setArmedPlacement: (armed) => set({ armedPlacement: armed }),
  setDraggingPlacementId: (placementId) => set({ draggingPlacementId: placementId }),
  addDraftMaskPoint: (point) => set((state) => ({ draftMaskPoints: [...state.draftMaskPoints, point] })),
  clearDraftMask: () => set({ draftMaskPoints: [] }),
  addMeasureDraftPoint: (point) => set((state) => ({ measureDraftPoints: [...state.measureDraftPoints, point] })),
  clearMeasureDraft: () => set({ measureDraftPoints: [] }),
  setCalibrating: (value) => set({ calibrating: value }),
  setCameraYawDeg: (deg) => set({ cameraYawDeg: deg }),

  loadProject: (file) =>
    set({
      projectName: file.projectName,
      rooms: file.rooms,
      currentRoomId: file.currentRoomId,
      selection: { type: null, id: null },
    }),

  resetProject: () =>
    set({
      projectName: 'Untitled Project',
      rooms: [],
      currentRoomId: null,
      selection: { type: null, id: null },
    }),
}));

export function useCurrentRoom(): Room | null {
  const rooms = useProjectStore((s) => s.rooms);
  const currentRoomId = useProjectStore((s) => s.currentRoomId);
  return rooms.find((r) => r.id === currentRoomId) ?? null;
}

export function toProjectFile(): ProjectFile {
  const state = useProjectStore.getState();
  return {
    schemaVersion: 1,
    projectName: state.projectName,
    updatedAt: new Date().toISOString(),
    currentRoomId: state.currentRoomId,
    rooms: state.rooms,
  };
}

// Debounced autosave: any change to persisted fields writes to localStorage.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
useProjectStore.subscribe(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveProjectToStorage(toProjectFile());
  }, 500);
});
