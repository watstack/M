import { useRef, useState } from 'react';
import { toProjectFile, useProjectStore } from '../../store/useProjectStore';
import { exportProjectToFile, importProjectFromFile, saveProjectToStorage } from '../../lib/persistence';
import { exportCanvasScreenshot } from './screenshotExport';
import { orbitControlsRef } from '../../lib/viewControls';

const buttonClass = 'rounded-md px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10';

export function SaveExportPanel() {
  const loadProject = useProjectStore((s) => s.loadProject);
  const setFov = useProjectStore((s) => s.setFov);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    saveProjectToStorage(toProjectFile());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleImportFile = async (file: File) => {
    try {
      const project = await importProjectFromFile(file);
      loadProject(project);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import project file');
    }
  };

  const handleResetView = () => {
    orbitControlsRef.current?.reset();
    setFov(75);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-black/50 p-1 backdrop-blur">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={handleSave} className={buttonClass}>
        {savedFlash ? 'Saved ✓' : 'Save'}
      </button>
      <button type="button" onClick={() => exportProjectToFile(toProjectFile())} className={buttonClass}>
        Export
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonClass}>
        Import
      </button>
      <button type="button" onClick={() => exportCanvasScreenshot()} className={buttonClass}>
        PNG
      </button>
      <button type="button" onClick={handleResetView} className={buttonClass}>
        Reset view
      </button>
    </div>
  );
}
