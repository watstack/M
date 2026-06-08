// 10 pixel-art avatar sprite definitions.
// Each avatar maps to a static SVG file in assets/avatars/.
// renderAvatar() keeps the same signature as before so existing DB rows
// with avatar_type 1–7 still resolve to a valid sprite.

const AVATARS = [
  { id: 1,  label: 'Striker',     src: 'assets/avatars/striker.svg' },
  { id: 2,  label: 'Playmaker',   src: 'assets/avatars/playmaker.svg' },
  { id: 3,  label: 'Winger',      src: 'assets/avatars/winger.svg' },
  { id: 4,  label: 'Keeper',      src: 'assets/avatars/keeper.svg' },
  { id: 5,  label: 'Captain',     src: 'assets/avatars/captain.svg' },
  { id: 6,  label: 'Manager',     src: 'assets/avatars/manager.svg' },
  { id: 7,  label: 'Commentator', src: 'assets/avatars/commentator.svg' },
  { id: 8,  label: 'Ultra',       src: 'assets/avatars/ultra.svg' },
  { id: 9,  label: 'Fan',         src: 'assets/avatars/fan.svg' },
  { id: 10, label: 'Mascot',      src: 'assets/avatars/mascot.svg' },
];

// Returns an <img> tag for the given avatar ID at the requested size.
// teamCode is accepted for backward compat but no longer used.
function renderAvatar(avatarType, teamCode = null, size = 60) {
  const avatar = AVATARS.find(a => a.id === avatarType) || AVATARS[0];
  return `<img class="avatar-sprite" src="${avatar.src}" alt="${avatar.label}" style="width:${size}px;height:${Math.round(size * 1.2)}px;image-rendering:pixelated;filter:drop-shadow(0 3px 0 rgba(0,0,0,.4))">`;
}
