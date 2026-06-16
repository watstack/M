(function () {
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

  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: page, visitor_id: vid, tournament_code: params.get('code') }),
  }).catch(function () {});
})();
