(function () {
  // Records a single page view straight into Supabase. The site is hosted on
  // GitHub Pages (static), so there is no /api/* server — we write directly with
  // the public anon key, the same way the rest of the app talks to Supabase.
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return;

  var KEY = 'wc26_visitor';
  var vid = localStorage.getItem(KEY);
  if (!vid) { vid = crypto.randomUUID(); localStorage.setItem(KEY, vid); }

  var p = location.pathname;
  var params = new URLSearchParams(location.search);
  var page =
    p === '/' || p.endsWith('index.html') ? 'home' :
    p.includes('sweepstake') || p.startsWith('/s/') ? 'sweepstake' :
    p.includes('betting') || p.startsWith('/b/') ? 'betting' :
    p.includes('admin') ? 'admin' : null;
  if (!page) return;

  fetch(CONFIG.SUPABASE_URL + '/rest/v1/page_views', {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ page: page, visitor_id: vid, tournament_code: params.get('code') }),
  }).catch(function () {});
})();
