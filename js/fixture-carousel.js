// Shared fixture-card HTML builder. Used by overview.js and betting.html.
// Requires: window.WC2026_FIXTURES, teamFlagEmoji (optional global)

(function () {
  const CAROUSEL_LIVE_MS = 130 * 60000;

  /**
   * Build one HTML string per fixture card.
   *
   * @param {object} opts
   * @param {object}   opts.matchesByKey     { 'HOME_AWAY': { status, home_score, away_score } }
   * @param {Set}      opts.teamSet          user's allocated team codes
   * @param {object}   [opts.pendingByMatchNo] match_no → truthy when user has pending bet
   * @param {function} [opts.flagFn]         (side) → emoji; defaults to teamFlagEmoji global
   * @returns {string[]} one HTML string per fixture, sorted by kickoff_utc
   */
  // Static WC2026_FIXTURES kickoff_utc is a pre-tournament placeholder; the
  // broadcast schedule can shift once knockout slots are seeded, so prefer the
  // live-synced wc_matches.utc_date (ESPN/FBD) whenever it's available.
  function kickoffFor(f, matchData) {
    return (matchData && matchData.utc_date) || f.kickoff_utc;
  }

  function buildCarouselCards({ matchesByKey, teamSet, pendingByMatchNo, flagFn }) {
    const now = Date.now();
    const matchDataFor = f => {
      const matchKey = f.home.code && f.away.code ? `${f.home.code}_${f.away.code}` : null;
      return matchKey ? (matchesByKey || {})[matchKey] : null;
    };
    const all = (window.WC2026_FIXTURES || [])
      .slice()
      .sort((a, b) => new Date(kickoffFor(a, matchDataFor(a))) - new Date(kickoffFor(b, matchDataFor(b))));

    const flag = flagFn ||
      ((side) => (side && side.code && typeof teamFlagEmoji === 'function')
        ? teamFlagEmoji(side.code) : '🏳');

    return all.map(f => {
      const matchData = matchDataFor(f);
      const ko        = new Date(kickoffFor(f, matchData)).getTime();
      const dbStatus  = matchData?.status;
      // Treat SCHEDULED/TIMED as absent so time-based fallback fires for stale rows
      const effectiveStatus = (dbStatus && dbStatus !== 'SCHEDULED' && dbStatus !== 'TIMED') ? dbStatus : null;
      const isPast = effectiveStatus === 'FINISHED' ||
                     (!effectiveStatus && ko <= now && (now - ko) >= CAROUSEL_LIVE_MS);
      const isLive = (effectiveStatus === 'IN_PLAY' || effectiveStatus === 'PAUSED') ||
                     (!effectiveStatus && ko <= now && (now - ko) < CAROUSEL_LIVE_MS);
      const isMy   = (f.home.code && teamSet.has(f.home.code)) || (f.away.code && teamSet.has(f.away.code));
      const hasBet = !!(pendingByMatchNo || {})[f.match_no];

      const classes = ['fix-card',
        isPast ? 'past-card' : '',
        isLive ? 'live-card' : '',
        isMy   ? 'my-card'   : '',
      ].filter(Boolean).join(' ');

      const d = new Date(ko);
      const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      const tomMid = new Date(todayMid); tomMid.setDate(todayMid.getDate() + 1);
      const dayAfterMid = new Date(tomMid); dayAfterMid.setDate(tomMid.getDate() + 1);
      const timeStr = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
      let dateLabel;
      if (d >= todayMid && d < tomMid)         dateLabel = `Today ${timeStr}`;
      else if (d >= tomMid && d < dayAfterMid) dateLabel = `Tomorrow ${timeStr}`;
      else                                      dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      let scoreHtml = '';
      if (isLive) {
        const mins = Math.floor((now - ko) / 60000);
        const hs = matchData?.home_score ?? null;
        const as = matchData?.away_score ?? null;
        const scorePart = (hs !== null && as !== null) ? `${hs}-${as} ` : '';
        scoreHtml = `<div class="fix-card-score live">${scorePart}${mins}'</div>`;
      } else if (isPast && matchData) {
        const hs = matchData.home_score ?? null;
        const as = matchData.away_score ?? null;
        if (hs !== null && as !== null) scoreHtml = `<div class="fix-card-score">${hs}-${as}</div>`;
      }

      return `<div class="${classes}">
        <div class="fix-card-teams"><span>${flag(f.home)}</span><span>${flag(f.away)}</span></div>
        ${scoreHtml}
        <div class="fix-card-time">${dateLabel}</div>
        ${hasBet ? `<div class="fix-card-bet">🪙</div>` : ''}
      </div>`;
    });
  }

  window.FixtureCarousel = { buildCarouselCards, CAROUSEL_LIVE_MS };
})();
