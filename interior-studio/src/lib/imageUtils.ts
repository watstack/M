const ASPECT_TOLERANCE = 0.05;
const MAIN_MAX_DIM = 4096;
const MAIN_QUALITY = 0.85;
const THUMB_MAX_DIM = 256;
const THUMB_QUALITY = 0.8;

export function isEquirectangularAspect(width: number, height: number): boolean {
  const ratio = width / height;
  return Math.abs(ratio - 2) / 2 <= ASPECT_TOLERANCE;
}

function readFileAsDataUrl(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress((e.loaded / e.total) * 50);
    };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

function encodeScaled(img: HTMLImageElement, maxDim: number, quality: number): string {
  let { naturalWidth: width, naturalHeight: height } = img;
  if (width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export interface ProcessedUpload {
  imageDataUrl: string;
  thumbnailDataUrl: string;
  aspectWarning: boolean;
  width: number;
  height: number;
}

export async function processUploadedPanorama(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ProcessedUpload> {
  const dataUrl = await readFileAsDataUrl(file, onProgress);
  const img = await loadImage(dataUrl);
  onProgress?.(75);
  const imageDataUrl = encodeScaled(img, MAIN_MAX_DIM, MAIN_QUALITY);
  const thumbnailDataUrl = encodeScaled(img, THUMB_MAX_DIM, THUMB_QUALITY);
  onProgress?.(100);
  return {
    imageDataUrl,
    thumbnailDataUrl,
    aspectWarning: !isEquirectangularAspect(img.naturalWidth, img.naturalHeight),
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}
