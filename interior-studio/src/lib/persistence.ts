import type { ProjectFile } from '../types/project';

const STORAGE_KEY = 'interior-studio:project:v1';

export function saveProjectToStorage(project: ProjectFile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch (err) {
    console.error('Failed to save project to localStorage', err);
  }
}

export function loadProjectFromStorage(): ProjectFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.rooms)) return null;
    return parsed as ProjectFile;
  } catch (err) {
    console.error('Failed to load project from localStorage', err);
    return null;
  }
}

export function exportProjectToFile(project: ProjectFile): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = project.projectName.trim().replace(/\s+/g, '-').toLowerCase() || 'project';
  a.href = url;
  a.download = `interior-studio-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importProjectFromFile(file: File): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.rooms)) {
          reject(new Error('Unrecognized project file format'));
          return;
        }
        resolve(parsed as ProjectFile);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse project file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
