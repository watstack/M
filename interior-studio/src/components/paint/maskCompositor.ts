import { useEffect, useRef, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Room } from '../../types/project';
import { getSwatch, getSwatchFillStyle } from '../../lib/swatches';

// Capped working resolution: keeps recompositing/GPU-upload cost bounded
// regardless of the original upload's resolution. The full-resolution
// texture is used instead whenever a room has no masks (see Panorama.tsx).
const CANVAS_WIDTH = 2048;
const CANVAS_HEIGHT = 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load base image for mask compositing'));
    img.src = src;
  });
}

/** Composites a room's base photo with its material masks onto an offscreen
 * canvas and exposes it as a THREE.CanvasTexture. Recomposites (a full
 * canvas redraw) only when the base image or the masks change — never
 * per-frame — so the cost is negligible even though it redraws everything. */
export function useMaskedTexture(room: Room): CanvasTexture | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBaseImage(null);
    loadImage(room.imageDataUrl).then((img) => {
      if (!cancelled) setBaseImage(img);
    });
    return () => {
      cancelled = true;
    };
  }, [room.imageDataUrl]);

  useEffect(() => {
    if (!baseImage) return;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(baseImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const mask of room.masks) {
      if (mask.points.length < 3) continue;
      const swatch = getSwatch(mask.swatchId);
      if (!swatch) continue;

      const path = new Path2D();
      mask.points.forEach((p, i) => {
        const x = p.u * CANVAS_WIDTH;
        const y = p.v * CANVAS_HEIGHT;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();

      ctx.save();
      ctx.clip(path);
      ctx.globalAlpha = mask.opacity;
      ctx.globalCompositeOperation = mask.blendMode === 'normal' ? 'source-over' : mask.blendMode;
      ctx.fillStyle = getSwatchFillStyle(ctx, swatch);
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    setTexture((prev) => {
      if (prev) {
        prev.needsUpdate = true;
        return prev;
      }
      const next = new CanvasTexture(canvas);
      next.colorSpace = SRGBColorSpace;
      return next;
    });
  }, [baseImage, room.masks]);

  return texture;
}
