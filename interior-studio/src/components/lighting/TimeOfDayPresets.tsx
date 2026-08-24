import { useProjectStore } from '../../store/useProjectStore';
import type { MoodOverlayState } from '../../types/project';

interface Preset extends Omit<MoodOverlayState, 'presetId'> {
  id: string;
  label: string;
}

const PRESETS: Preset[] = [
  { id: 'none', label: 'None', color: '#ffffff', opacity: 0, brightness: 1, saturate: 1 },
  { id: 'morning', label: 'Morning', color: '#ffe9c7', opacity: 0.18, brightness: 1.05, saturate: 1.05 },
  { id: 'midday', label: 'Midday', color: '#ffffff', opacity: 0.06, brightness: 1.12, saturate: 1 },
  { id: 'golden-hour', label: 'Golden Hour', color: '#ff9d4d', opacity: 0.28, brightness: 1.0, saturate: 1.1 },
  { id: 'evening', label: 'Evening', color: '#5a63c9', opacity: 0.22, brightness: 0.9, saturate: 0.95 },
  { id: 'night', label: 'Night', color: '#16224f', opacity: 0.45, brightness: 0.65, saturate: 0.85 },
];

export function TimeOfDayPresets() {
  const presetId = useProjectStore((s) => s.moodOverlay.presetId);
  const setMoodOverlay = useProjectStore((s) => s.setMoodOverlay);

  return (
    <select
      value={presetId ?? 'none'}
      onChange={(e) => {
        const preset = PRESETS.find((p) => p.id === e.target.value);
        if (!preset) return;
        setMoodOverlay({
          presetId: preset.id,
          color: preset.color,
          opacity: preset.opacity,
          brightness: preset.brightness,
          saturate: preset.saturate,
        });
      }}
      className="rounded-lg border-none bg-black/50 px-2 py-1.5 text-xs font-medium text-white/80 backdrop-blur outline-none"
    >
      {PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id} className="bg-neutral-900 text-white">
          {preset.label}
        </option>
      ))}
    </select>
  );
}
