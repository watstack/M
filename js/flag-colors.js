// Primary and secondary flag colours for all WC 2026 teams.
// primary  → jersey / main body colour
// secondary → trim / detail colour
// Used to recolour SVG avatars after the draw.

const FLAG_COLORS = {
  // UEFA – Europe
  ENG: { primary: '#CF011B', secondary: '#FFFFFF', name: 'England' },
  GER: { primary: '#000000', secondary: '#DD0000', name: 'Germany' },
  FRA: { primary: '#002395', secondary: '#ED2939', name: 'France' },
  ESP: { primary: '#AA151B', secondary: '#F1BF00', name: 'Spain' },
  NED: { primary: '#AE1C28', secondary: '#FFFFFF', name: 'Netherlands' },
  POR: { primary: '#006600', secondary: '#FF0000', name: 'Portugal' },
  BEL: { primary: '#000000', secondary: '#FDDA24', name: 'Belgium' },
  ITA: { primary: '#009246', secondary: '#003DA5', name: 'Italy' },
  POL: { primary: '#DC143C', secondary: '#FFFFFF', name: 'Poland' },
  SUI: { primary: '#FF0000', secondary: '#FFFFFF', name: 'Switzerland' },
  CRO: { primary: '#FF0000', secondary: '#003DA5', name: 'Croatia' },
  DEN: { primary: '#C60C30', secondary: '#FFFFFF', name: 'Denmark' },
  AUT: { primary: '#ED2939', secondary: '#FFFFFF', name: 'Austria' },
  SRB: { primary: '#C6363C', secondary: '#0C4076', name: 'Serbia' },
  TUR: { primary: '#E30A17', secondary: '#FFFFFF', name: 'Turkey' },
  SCO: { primary: '#003399', secondary: '#FFFFFF', name: 'Scotland' },
  HUN: { primary: '#CE2939', secondary: '#477050', name: 'Hungary' },
  SVN: { primary: '#003DA5', secondary: '#ED1C24', name: 'Slovenia' },

  // CONMEBOL – South America
  BRA: { primary: '#009C3B', secondary: '#FFDF00', name: 'Brazil' },
  ARG: { primary: '#74ACDF', secondary: '#FFFFFF', name: 'Argentina' },
  COL: { primary: '#FCD116', secondary: '#003087', name: 'Colombia' },
  URU: { primary: '#75AADB', secondary: '#FFFFFF', name: 'Uruguay' },
  CHI: { primary: '#D52B1E', secondary: '#003087', name: 'Chile' },
  ECU: { primary: '#FFD100', secondary: '#003087', name: 'Ecuador' },
  VEN: { primary: '#CF142B', secondary: '#FFD700', name: 'Venezuela' },
  PAR: { primary: '#D52B1E', secondary: '#0038A8', name: 'Paraguay' },
  BOL: { primary: '#D52B1E', secondary: '#F4E400', name: 'Bolivia' },
  PER: { primary: '#D91023', secondary: '#FFFFFF', name: 'Peru' },

  // CAF – Africa
  MAR: { primary: '#C1272D', secondary: '#006233', name: 'Morocco' },
  SEN: { primary: '#00853F', secondary: '#FDEF42', name: 'Senegal' },
  CMR: { primary: '#007A5E', secondary: '#CE1126', name: 'Cameroon' },
  NGA: { primary: '#008751', secondary: '#FFFFFF', name: 'Nigeria' },
  GHA: { primary: '#006B3F', secondary: '#FCD116', name: 'Ghana' },
  EGY: { primary: '#CE1126', secondary: '#FFFFFF', name: 'Egypt' },
  CIV: { primary: '#F77F00', secondary: '#009A44', name: "Côte d'Ivoire" },
  TUN: { primary: '#E70013', secondary: '#FFFFFF', name: 'Tunisia' },
  RSA: { primary: '#007A4D', secondary: '#FFB81C', name: 'South Africa' },
  COD: { primary: '#007FFF', secondary: '#CE1126', name: 'DR Congo' },
  MLI: { primary: '#14B53A', secondary: '#CE1126', name: 'Mali' },
  AGO: { primary: '#CC0000', secondary: '#000000', name: 'Angola' },
  ZAM: { primary: '#198A00', secondary: '#EF7D00', name: 'Zambia' },
  ALG: { primary: '#006233', secondary: '#D21034', name: 'Algeria' },
  BEN: { primary: '#008751', secondary: '#FFDD00', name: 'Benin' },
  MRT: { primary: '#006233', secondary: '#FFD700', name: 'Mauritania' },
  COM: { primary: '#3A75C4', secondary: '#009A44', name: 'Comoros' },

  // AFC – Asia
  JPN: { primary: '#BC002D', secondary: '#FFFFFF', name: 'Japan' },
  KOR: { primary: '#003478', secondary: '#CD2E3A', name: 'South Korea' },
  AUS: { primary: '#00008B', secondary: '#FFDD00', name: 'Australia' },
  IRN: { primary: '#239F40', secondary: '#DA0000', name: 'Iran' },
  KSA: { primary: '#006C35', secondary: '#FFFFFF', name: 'Saudi Arabia' },
  QAT: { primary: '#8D1B3D', secondary: '#FFFFFF', name: 'Qatar' },
  UZB: { primary: '#1EB53A', secondary: '#FFFFFF', name: 'Uzbekistan' },
  IRQ: { primary: '#007A3D', secondary: '#CE1126', name: 'Iraq' },
  JOR: { primary: '#007A3D', secondary: '#FFFFFF', name: 'Jordan' },
  UAE: { primary: '#00732F', secondary: '#FF0000', name: 'UAE' },
  OMA: { primary: '#DB161B', secondary: '#FFFFFF', name: 'Oman' },
  BHR: { primary: '#CE1126', secondary: '#FFFFFF', name: 'Bahrain' },
  KUW: { primary: '#007A3D', secondary: '#CE1126', name: 'Kuwait' },
  CHN: { primary: '#DE2910', secondary: '#FFDE00', name: 'China' },
  TJK: { primary: '#CC0000', secondary: '#006600', name: 'Tajikistan' },
  KGZ: { primary: '#E8112D', secondary: '#FFFF00', name: 'Kyrgyzstan' },
  PAL: { primary: '#000000', secondary: '#007A3D', name: 'Palestine' },
  BAN: { primary: '#006A4E', secondary: '#F42A41', name: 'Bangladesh' },
  IND: { primary: '#FF9933', secondary: '#138808', name: 'India' },
  THA: { primary: '#A51931', secondary: '#2D2A4A', name: 'Thailand' },
  IDN: { primary: '#CE1126', secondary: '#FFFFFF', name: 'Indonesia' },
  PHI: { primary: '#0038A8', secondary: '#CE1126', name: 'Philippines' },

  // CONCACAF – North & Central America / Caribbean
  USA: { primary: '#B22234', secondary: '#3C3B6E', name: 'USA' },
  MEX: { primary: '#006847', secondary: '#CE1126', name: 'Mexico' },
  CAN: { primary: '#FF0000', secondary: '#FFFFFF', name: 'Canada' },
  HON: { primary: '#0073CF', secondary: '#FFFFFF', name: 'Honduras' },
  PAN: { primary: '#DA121A', secondary: '#003087', name: 'Panama' },
  CRC: { primary: '#002B7F', secondary: '#CE1126', name: 'Costa Rica' },
  JAM: { primary: '#000000', secondary: '#FFD700', name: 'Jamaica' },
  GUA: { primary: '#4997D0', secondary: '#FFFFFF', name: 'Guatemala' },
  TRI: { primary: '#CE1126', secondary: '#000000', name: 'Trinidad & Tobago' },
  CUB: { primary: '#003DA5', secondary: '#CF142B', name: 'Cuba' },
  SLV: { primary: '#0F47AF', secondary: '#FFFFFF', name: 'El Salvador' },
  NCA: { primary: '#3E6EB4', secondary: '#FFFFFF', name: 'Nicaragua' },

  // OFC – Oceania
  NZL: { primary: '#00247D', secondary: '#CC0000', name: 'New Zealand' },
  FIJ: { primary: '#68BFE5', secondary: '#003DA5', name: 'Fiji' },
  PNG: { primary: '#000000', secondary: '#CE1126', name: 'Papua New Guinea' },

  // Fallback for unknown codes
  _DEFAULT: { primary: '#888888', secondary: '#cccccc', name: 'Unknown' },
};

function getFlagColors(code) {
  return FLAG_COLORS[code] || FLAG_COLORS._DEFAULT;
}
