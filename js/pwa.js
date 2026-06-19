/* Kickoff PWA glue: registers the service worker and drives the on-page
 * "Install the app" entry point (rendered on overview.html). */
(function () {
  // ── 1. Register the service worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Relative path so it works under any base (Vercel root and GitHub Pages /M/).
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('[pwa] service worker registration failed:', err)
      );
    });
  }

  // ── 2. On-page install entry point (only present on the overview) ──
  const section = document.getElementById('ovInstall');
  const btn = document.getElementById('ovInstallBtn');
  const hint = document.getElementById('ovInstallHint');
  const btnWrap = document.getElementById('ovInstallBtnWrap'); // Android/desktop: one-tap
  const steps = document.getElementById('ovInstallSteps');     // iOS: manual steps
  if (!section || !btn) return;

  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Already installed → nothing to offer.
  if (isStandalone) return;

  let deferredPrompt = null;

  // Android / desktop Chromium: a real install prompt is available. Stash it so
  // the button can trigger it; the button itself stays visible regardless.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  // Keep the entry point visible after installing (so the tile can be re-added);
  // just acknowledge the install.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (hint) {
      hint.textContent = 'Installed ✓ — open Kickoff from your home screen.';
      hint.hidden = false;
    }
  });

  // Put a deep link carrying all of the user's browser tokens into the address
  // bar so that when iOS captures the current URL for the home screen, the
  // installed app launches fully hydrated with their tournaments + identities.
  function stampDeepLink() {
    const fn = window.__kickoffInstallLink;
    const dl = typeof fn === 'function' ? fn() : (typeof fn === 'string' ? fn : window.__kickoffDeepLink);
    if (dl) {
      try { history.replaceState(null, '', dl); } catch (_) {}
    }
  }

  btn.addEventListener('click', async () => {
    // Always carry the user's identity into the install (code + token bundle).
    stampDeepLink();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
    } else if (hint) {
      // No native prompt (e.g. already installed): show the manual fallback.
      hint.textContent = 'Open your browser menu, then “Install” / “Add to Home Screen”.';
      hint.hidden = false;
    }
  });

  // Split the UI by platform: iOS can't be triggered programmatically, so show
  // the manual steps; everyone else gets the one-tap Install button. (The iOS
  // tokens ride in via the personalised manifest, so no click is needed there.)
  if (isIOS) {
    if (steps) steps.hidden = false;
  } else if (btnWrap) {
    btnWrap.hidden = false;
  }

  // Persist the install entry point whenever we're in a browser tab (it's hidden
  // only when already running as the installed standalone app, handled above).
  section.hidden = false;
})();
