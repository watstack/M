import { UploadDropzone } from '../upload/UploadDropzone';
import { useProjectStore } from '../../store/useProjectStore';

export function SceneListPanel() {
  const rooms = useProjectStore((s) => s.rooms);
  const currentRoomId = useProjectStore((s) => s.currentRoomId);
  const armedPlacement = useProjectStore((s) => s.armedPlacement);
  const setCurrentRoom = useProjectStore((s) => s.setCurrentRoom);
  const setMode = useProjectStore((s) => s.setMode);
  const setArmedPlacement = useProjectStore((s) => s.setArmedPlacement);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-white/50 uppercase">Rooms</h2>
      <div className="flex flex-col gap-2">
        {rooms.map((room) => {
          const isCurrent = room.id === currentRoomId;
          const isPortalTarget = armedPlacement?.kind === 'portal' && armedPlacement.targetRoomId === room.id;
          return (
            <div
              key={room.id}
              className={`overflow-hidden rounded-lg border transition-colors ${
                isCurrent ? 'border-sky-400' : 'border-white/10'
              }`}
            >
              <button type="button" onClick={() => setCurrentRoom(room.id)} className="block w-full text-left">
                <img src={room.thumbnailDataUrl} alt={room.name} className="h-24 w-full object-cover" />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="truncate text-xs text-white/80">{room.name}</span>
                  {room.aspectWarning && (
                    <span title="Non-standard aspect ratio" className="text-amber-400">
                      ⚠
                    </span>
                  )}
                </div>
              </button>
              {!isCurrent && currentRoomId && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('place');
                    setArmedPlacement({ kind: 'portal', targetRoomId: room.id, label: room.name });
                  }}
                  className={`w-full border-t border-white/10 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    isPortalTarget ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {isPortalTarget ? 'Click scene to place…' : '+ Portal here'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <UploadDropzone compact />
    </div>
  );
}
