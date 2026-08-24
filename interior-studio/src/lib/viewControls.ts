/** Module-level handle to the mounted OrbitControls instance, set by
 * Scene.tsx, so the "Reset view" toolbar action (rendered outside the
 * Canvas) can call its imperative .reset(). There's only ever one Canvas
 * in this app, so a single shared ref is simpler than threading one
 * through React context. */
export const orbitControlsRef: { current: { reset: () => void } | null } = { current: null };
