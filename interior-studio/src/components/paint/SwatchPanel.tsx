import { SWATCHES, type Swatch } from '../../lib/swatches';

interface SwatchPanelProps {
  selectedSwatchId: string;
  onSelect: (swatchId: string) => void;
}

const PATTERN_PREVIEW: Record<string, string> = {
  'timber-oak': 'linear-gradient(100deg, #c9a066, #a9814d, #c9a066)',
  'timber-walnut': 'linear-gradient(100deg, #5b3a29, #3f281c, #5b3a29)',
  'stone-carrara': 'linear-gradient(100deg, #eceae6, #d7d3cc, #eceae6)',
  'stone-slate': 'linear-gradient(100deg, #5a6068, #42474d, #5a6068)',
};

function swatchStyle(swatch: Swatch): string {
  return swatch.kind === 'color' ? (swatch.hex ?? '#999999') : (PATTERN_PREVIEW[swatch.id] ?? '#999999');
}

export function SwatchPanel({ selectedSwatchId, onSelect }: SwatchPanelProps) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.id}
          type="button"
          title={swatch.name}
          onClick={() => onSelect(swatch.id)}
          className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
            selectedSwatchId === swatch.id ? 'border-sky-400' : 'border-white/20'
          }`}
          style={{ background: swatchStyle(swatch) }}
        />
      ))}
    </div>
  );
}
