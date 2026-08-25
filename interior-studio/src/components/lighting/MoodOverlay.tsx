import { useProjectStore } from '../../store/useProjectStore';

/** Visual-only lighting mood approximation: a tinted, opacity-adjustable
 * overlay blended on top of the canvas. Not physically accurate relighting
 * — brightness/saturation are applied separately as a CSS filter on the
 * canvas itself (see Scene.tsx). */
export function MoodOverlay() {
  const moodOverlay = useProjectStore((s) => s.moodOverlay);
  if (moodOverlay.opacity <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: moodOverlay.color,
        opacity: moodOverlay.opacity,
        mixBlendMode: 'soft-light',
      }}
    />
  );
}
