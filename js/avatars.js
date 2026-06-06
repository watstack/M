// 7 SVG avatar definitions.
// Each SVG uses CSS custom properties --av-primary and --av-secondary
// for the two recolorable zones. Before draw: neutral grey palette.
// After draw: flag colours applied via setAvatarColors().

const AVATARS = [
  {
    id: 1,
    label: 'The Fan',
    // Jersey + scarf
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- hair -->
  <ellipse cx="30" cy="4" rx="11" ry="5" fill="#5C3A1E"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- jersey body -->
  <path d="M14 28 L10 48 L50 48 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#888)"/>
  <!-- jersey stripe -->
  <rect x="14" y="28" width="32" height="5" fill="var(--av-secondary,#bbb)" opacity="0.6"/>
  <!-- scarf left -->
  <rect x="10" y="25" width="12" height="5" rx="2" fill="var(--av-secondary,#bbb)"/>
  <!-- scarf right -->
  <rect x="38" y="25" width="12" height="5" rx="2" fill="var(--av-secondary,#bbb)"/>
  <!-- left arm -->
  <path d="M14 28 L6 42 L12 44 L18 30 Z" fill="var(--av-primary,#888)"/>
  <!-- right arm (raised) -->
  <path d="M46 28 L54 18 L58 22 L52 34 Z" fill="var(--av-primary,#888)"/>
  <!-- legs -->
  <rect x="19" y="48" width="10" height="16" rx="3" fill="#333"/>
  <rect x="31" y="48" width="10" height="16" rx="3" fill="#333"/>
  <!-- boots -->
  <rect x="17" y="60" width="14" height="5" rx="2" fill="#222"/>
  <rect x="29" y="60" width="14" height="5" rx="2" fill="#222"/>
</svg>`,
  },
  {
    id: 2,
    label: 'The Manager',
    // Suit + clipboard
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- hair -->
  <ellipse cx="30" cy="4" rx="11" ry="4" fill="#222"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- suit jacket -->
  <path d="M14 28 L10 58 L50 58 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#333)"/>
  <!-- shirt/tie -->
  <rect x="27" y="25" width="6" height="22" fill="#FFFFFF"/>
  <polygon points="30,28 28,40 32,40" fill="var(--av-secondary,#ccc)"/>
  <!-- lapels -->
  <polygon points="22,24 14,34 22,34" fill="var(--av-secondary,#555)"/>
  <polygon points="38,24 46,34 38,34" fill="var(--av-secondary,#555)"/>
  <!-- left arm -->
  <path d="M14 28 L8 48 L14 50 L20 32 Z" fill="var(--av-primary,#333)"/>
  <!-- right arm with clipboard -->
  <path d="M46 28 L52 42 L58 40 L54 26 Z" fill="var(--av-primary,#333)"/>
  <!-- clipboard -->
  <rect x="48" y="36" width="13" height="18" rx="2" fill="#F5DEB3"/>
  <rect x="50" y="33" width="9" height="4" rx="1" fill="#888"/>
  <line x1="50" y1="42" x2="59" y2="42" stroke="#999" stroke-width="1.5"/>
  <line x1="50" y1="46" x2="59" y2="46" stroke="#999" stroke-width="1.5"/>
  <line x1="50" y1="50" x2="59" y2="50" stroke="#999" stroke-width="1.5"/>
  <!-- legs -->
  <rect x="19" y="58" width="10" height="8" rx="2" fill="var(--av-primary,#333)"/>
  <rect x="31" y="58" width="10" height="8" rx="2" fill="var(--av-primary,#333)"/>
  <!-- shoes -->
  <rect x="17" y="63" width="13" height="4" rx="2" fill="#111"/>
  <rect x="30" y="63" width="13" height="4" rx="2" fill="#111"/>
</svg>`,
  },
  {
    id: 3,
    label: 'The Commentator',
    // Blazer + microphone
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- headphones -->
  <path d="M19 10 Q19 0 30 0 Q41 0 41 10" fill="none" stroke="#222" stroke-width="3"/>
  <rect x="15" y="8" width="6" height="9" rx="2" fill="#333"/>
  <rect x="39" y="8" width="6" height="9" rx="2" fill="#333"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- blazer -->
  <path d="M14 28 L10 55 L50 55 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#1a3a5c)"/>
  <!-- shirt -->
  <rect x="27" y="25" width="6" height="20" fill="#FFFFFF"/>
  <!-- lapels -->
  <polygon points="22,24 14,36 24,34" fill="var(--av-secondary,#2255aa)"/>
  <polygon points="38,24 46,36 36,34" fill="var(--av-secondary,#2255aa)"/>
  <!-- left arm -->
  <path d="M14 28 L8 46 L14 48 L20 32 Z" fill="var(--av-primary,#1a3a5c)"/>
  <!-- right arm holding mic -->
  <path d="M46 28 L54 20 L58 24 L52 34 Z" fill="var(--av-primary,#1a3a5c)"/>
  <!-- microphone -->
  <rect x="50" y="12" width="8" height="14" rx="4" fill="#888"/>
  <rect x="52" y="26" width="4" height="8" fill="#666"/>
  <path d="M48 32 L56 32" stroke="#666" stroke-width="2"/>
  <!-- legs -->
  <rect x="19" y="55" width="10" height="10" rx="2" fill="var(--av-primary,#1a3a5c)"/>
  <rect x="31" y="55" width="10" height="10" rx="2" fill="var(--av-primary,#1a3a5c)"/>
  <!-- shoes -->
  <rect x="17" y="62" width="13" height="4" rx="2" fill="#111"/>
  <rect x="30" y="62" width="13" height="4" rx="2" fill="#111"/>
</svg>`,
  },
  {
    id: 4,
    label: 'The Goalkeeper',
    // Long-sleeve jersey + gloves
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- hair -->
  <path d="M19 7 Q30 2 41 7 Q41 15 30 16 Q19 15 19 7 Z" fill="#8B6914"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- long-sleeve jersey -->
  <path d="M14 28 L10 50 L50 50 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#f0a500)"/>
  <!-- number on back/chest -->
  <text x="30" y="43" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="var(--av-secondary,#fff)">1</text>
  <!-- left sleeve / arm (long) -->
  <path d="M14 28 L6 48 L12 50 L20 32 Z" fill="var(--av-primary,#f0a500)"/>
  <!-- right sleeve / arm (long) -->
  <path d="M46 28 L54 44 L60 42 L52 26 Z" fill="var(--av-primary,#f0a500)"/>
  <!-- left glove -->
  <ellipse cx="9" cy="50" rx="6" ry="5" fill="var(--av-secondary,#fff)"/>
  <!-- right glove (catching pose) -->
  <ellipse cx="57" cy="43" rx="6" ry="5" fill="var(--av-secondary,#fff)"/>
  <!-- glove fingers (right) -->
  <line x1="54" y1="39" x2="52" y2="36" stroke="#ddd" stroke-width="2"/>
  <line x1="57" y1="38" x2="55" y2="35" stroke="#ddd" stroke-width="2"/>
  <line x1="60" y1="39" x2="59" y2="36" stroke="#ddd" stroke-width="2"/>
  <!-- shorts -->
  <rect x="18" y="50" width="24" height="8" fill="var(--av-secondary,#fff)"/>
  <!-- legs -->
  <rect x="19" y="58" width="10" height="8" rx="2" fill="#444"/>
  <rect x="31" y="58" width="10" height="8" rx="2" fill="#444"/>
  <!-- boots -->
  <rect x="17" y="63" width="13" height="4" rx="2" fill="#222"/>
  <rect x="30" y="63" width="13" height="4" rx="2" fill="#222"/>
</svg>`,
  },
  {
    id: 5,
    label: 'The Referee',
    // Black uniform + whistle
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- hair -->
  <ellipse cx="30" cy="4" rx="11" ry="4.5" fill="#111"/>
  <!-- whistle cord around neck -->
  <path d="M21 22 Q30 28 39 22" fill="none" stroke="var(--av-secondary,#ffd700)" stroke-width="2"/>
  <!-- whistle -->
  <rect x="27" y="26" width="9" height="5" rx="2" fill="var(--av-secondary,#ffd700)"/>
  <!-- neck -->
  <rect x="26" y="21" width="8" height="7" fill="#FDBCB4"/>
  <!-- black jersey -->
  <path d="M14 28 L10 52 L50 52 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#111)"/>
  <!-- yellow/secondary badge -->
  <circle cx="22" cy="32" r="4" fill="var(--av-secondary,#ffd700)"/>
  <!-- left arm raised (yellow card / sending off) -->
  <path d="M14 28 L4 18 L8 14 L20 26 Z" fill="var(--av-primary,#111)"/>
  <!-- yellow card -->
  <rect x="0" y="8" width="9" height="12" rx="1.5" fill="var(--av-secondary,#ffd700)"/>
  <!-- right arm -->
  <path d="M46 28 L54 44 L60 42 L52 28 Z" fill="var(--av-primary,#111)"/>
  <!-- shorts -->
  <rect x="18" y="52" width="24" height="8" fill="var(--av-primary,#111)"/>
  <!-- legs -->
  <rect x="19" y="60" width="10" height="7" rx="2" fill="#222"/>
  <rect x="31" y="60" width="10" height="7" rx="2" fill="#222"/>
  <!-- socks/boots -->
  <rect x="17" y="64" width="13" height="4" rx="2" fill="#111"/>
  <rect x="30" y="64" width="13" height="4" rx="2" fill="#111"/>
</svg>`,
  },
  {
    id: 6,
    label: 'The Star',
    // Number 10 jersey + arm raised in celebration
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- stylish hair -->
  <path d="M19 6 Q30 0 41 6 L40 14 Q36 10 30 10 Q24 10 20 14 Z" fill="#111"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- star jersey -->
  <path d="M14 28 L10 50 L50 50 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#0057A8)"/>
  <!-- number 10 -->
  <text x="30" y="44" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="13" font-weight="900" fill="var(--av-secondary,#fff)">10</text>
  <!-- both arms raised in celebration -->
  <path d="M14 28 L4 14 L8 10 L20 26 Z" fill="var(--av-primary,#0057A8)"/>
  <path d="M46 28 L56 14 L60 18 L50 32 Z" fill="var(--av-primary,#0057A8)"/>
  <!-- shorts -->
  <rect x="18" y="50" width="24" height="9" fill="var(--av-secondary,#FFFFFF)"/>
  <!-- legs -->
  <rect x="19" y="59" width="10" height="8" rx="2" fill="#333"/>
  <rect x="31" y="59" width="10" height="8" rx="2" fill="#333"/>
  <!-- boots -->
  <rect x="16" y="64" width="14" height="4" rx="2" fill="var(--av-primary,#0057A8)"/>
  <rect x="30" y="64" width="14" height="4" rx="2" fill="var(--av-primary,#0057A8)"/>
</svg>`,
  },
  {
    id: 7,
    label: 'The Ultras',
    // Face paint + banner/flag
    svg: `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
  <!-- head -->
  <circle cx="30" cy="13" r="11" fill="#FDBCB4"/>
  <!-- face paint stripe (primary colour) -->
  <rect x="19" y="9" width="22" height="8" rx="2" fill="var(--av-primary,#e00)" opacity="0.85"/>
  <!-- hair (mohawk style) -->
  <path d="M24 4 Q30 0 36 4 L34 8 Q30 5 26 8 Z" fill="#111"/>
  <!-- neck -->
  <rect x="26" y="22" width="8" height="5" fill="#FDBCB4"/>
  <!-- jersey -->
  <path d="M14 28 L10 50 L50 50 L46 28 L38 24 L22 24 Z" fill="var(--av-primary,#e00)"/>
  <!-- jersey number -->
  <text x="30" y="43" text-anchor="middle" font-family="Arial Black" font-size="12" font-weight="900" fill="var(--av-secondary,#fff)">12</text>
  <!-- left arm -->
  <path d="M14 28 L8 44 L14 46 L20 32 Z" fill="var(--av-primary,#e00)"/>
  <!-- right arm raised holding banner -->
  <path d="M46 28 L52 10 L57 12 L52 32 Z" fill="var(--av-primary,#e00)"/>
  <!-- banner pole -->
  <line x1="54" y1="4" x2="54" y2="24" stroke="#8B6914" stroke-width="2.5"/>
  <!-- banner flag -->
  <rect x="54" y="4" width="14" height="10" fill="var(--av-secondary,#fff)"/>
  <rect x="54" y="4" width="14" height="5" fill="var(--av-primary,#e00)"/>
  <!-- shorts -->
  <rect x="18" y="50" width="24" height="8" fill="var(--av-secondary,#fff)"/>
  <!-- legs -->
  <rect x="19" y="58" width="10" height="9" rx="2" fill="#333"/>
  <rect x="31" y="58" width="10" height="9" rx="2" fill="#333"/>
  <!-- boots -->
  <rect x="17" y="64" width="13" height="4" rx="2" fill="#111"/>
  <rect x="30" y="64" width="13" height="4" rx="2" fill="#111"/>
</svg>`,
  },
];

// Render an avatar with optional flag colours applied.
// Returns an HTML string ready for innerHTML.
function renderAvatar(avatarType, teamCode = null, size = 60) {
  const avatar = AVATARS.find(a => a.id === avatarType) || AVATARS[0];
  const colors = teamCode ? getFlagColors(teamCode) : { primary: '#888888', secondary: '#bbbbbb' };
  const style = `--av-primary:${colors.primary};--av-secondary:${colors.secondary};width:${size}px;height:${Math.round(size * 1.2)}px`;
  return `<span class="avatar-wrap" style="${style}">${avatar.svg}</span>`;
}

// Apply flag colours to an existing avatar wrapper element.
function setAvatarColors(el, teamCode) {
  const colors = getFlagColors(teamCode);
  el.style.setProperty('--av-primary', colors.primary);
  el.style.setProperty('--av-secondary', colors.secondary);
}
