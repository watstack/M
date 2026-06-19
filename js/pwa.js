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

  // Android / desktop Chromium: a real install prompt is available.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    section.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    section.hidden = true;
    deferredPrompt = null;
  });

  // Put the user's self-identifying deep link (code + participant token) into
  // the address bar so that when iOS captures the current URL for the home
  // screen, the installed app re-hooks them into their tournament.
  function stampDeepLink() {
    const dl = window.__kickoffDeepLink;
    if (dl) {
      try { history.replaceState(null, '', dl); } catch (_) {}
    }
  }

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      section.hidden = true;
      return;
    }
    // iOS (Safari/Chrome/etc. — all WebKit, no prompt API): reveal instructions.
    stampDeepLink();
    if (hint) hint.hidden = false;
  });

  // iOS has no beforeinstallprompt, so surface the button with the right gesture.
  if (isIOS) {
    const isCriOS = /CriOS/i.test(ua);   // Chrome on iOS
    const isFxOS = /FxiOS/i.test(ua);    // Firefox on iOS
    if (hint) {
      hint.textContent = (isCriOS || isFxOS)
        ? 'Tap the ⋯ / Share menu, then “Add to Home Screen”.'
        : 'Tap the Share icon, then “Add to Home Screen”.';
    }
    section.hidden = false;
  }
})();
