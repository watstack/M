import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { processUploadedPanorama } from '../../lib/imageUtils';
import { useProjectStore } from '../../store/useProjectStore';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface UploadResult {
  roomId: string;
  aspectWarning: boolean;
}

/** Processes a panorama file and adds it to the project as a new room.
 * Shared by the full-screen dropzone and the compact "add room" button. */
export async function uploadPanoramaFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  const processed = await processUploadedPanorama(file, onProgress);
  const roomId = useProjectStore.getState().addRoom({
    name: file.name.replace(/\.[^./]+$/, ''),
    imageDataUrl: processed.imageDataUrl,
    thumbnailDataUrl: processed.thumbnailDataUrl,
    aspectWarning: processed.aspectWarning,
  });
  useProjectStore.getState().setCurrentRoom(roomId);
  return { roomId, aspectWarning: processed.aspectWarning };
}

interface UploadDropzoneProps {
  compact?: boolean;
}

export function UploadDropzone({ compact = false }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.');
      return;
    }
    setError(null);
    setWarning(null);
    setProgress(0);
    try {
      const result = await uploadPanoramaFile(file, setProgress);
      if (result.aspectWarning) {
        setWarning('This image is not a standard 2:1 equirectangular panorama — it may not wrap correctly.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image.');
    } finally {
      setProgress(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_TYPES.join(',')}
      className="hidden"
      onChange={(e) => void handleFiles(e.target.files)}
    />
  );

  if (compact) {
    return (
      <div>
        {fileInput}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={progress !== null}
          className="w-full rounded-md border border-dashed border-white/25 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/50 hover:text-white disabled:opacity-60"
        >
          {progress !== null ? `Uploading… ${Math.round(progress)}%` : '+ Add room'}
        </button>
        {warning && <p className="mt-1 text-xs text-amber-400">{warning}</p>}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`flex h-full w-full flex-col items-center justify-center gap-5 border-2 border-dashed transition-colors ${
        isDragging ? 'border-sky-400 bg-sky-400/10' : 'border-white/15'
      }`}
    >
      {fileInput}
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-white">Interior Design Studio</h1>
        <p className="mt-2 text-white/60">
          Drop an equirectangular 360° panorama photo (JPG, PNG, or WEBP, ~2:1 aspect ratio) to walk into it.
        </p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-sky-500 px-5 py-2 font-medium text-white transition-colors hover:bg-sky-400"
      >
        Choose a photo
      </button>
      {progress !== null && (
        <div className="w-64">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-center text-xs text-white/50">Processing… {Math.round(progress)}%</p>
        </div>
      )}
      {warning && <p className="max-w-sm text-center text-sm text-amber-400">{warning}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
