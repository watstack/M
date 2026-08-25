/** Exports the current 3D view as a PNG. Relies on the Canvas being created
 * with gl={{ preserveDrawingBuffer: true }} (see Scene.tsx) — without that,
 * toBlob() on a WebGL canvas can capture a blank frame. */
export function exportCanvasScreenshot(filename = `interior-studio-view-${Date.now()}.png`): void {
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    console.error('No canvas available to export a screenshot from');
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
