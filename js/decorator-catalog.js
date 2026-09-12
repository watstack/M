/* js/decorator-catalog.js — starter furniture and elevation-item catalogues.
 *
 * Every entry carries real-world millimetre dimensions (w = across, d = depth
 * in plan, h = height) so a piece dropped on the plan is the size it would be
 * in the room. Declared with `var`/`function` for vmLoader; DOM-free.
 */

/* Plan furniture. `shape` is 'rect' or 'ellipse'. */
var FURNITURE_CATALOG = [
  /* Seating */
  { id: 'sofa-3',      group: 'Seating', name: 'Sofa (3 seat)',   w: 2100, d: 900,  h: 850,  shape: 'rect',    color: '#8fa9b8' },
  { id: 'sofa-2',      group: 'Seating', name: 'Sofa (2 seat)',   w: 1600, d: 900,  h: 850,  shape: 'rect',    color: '#8fa9b8' },
  { id: 'sofa-l',      group: 'Seating', name: 'Corner sofa',     w: 2600, d: 1700, h: 850,  shape: 'rect',    color: '#8fa9b8' },
  { id: 'armchair',    group: 'Seating', name: 'Armchair',        w: 850,  d: 850,  h: 800,  shape: 'rect',    color: '#9db4a8' },
  { id: 'ottoman',     group: 'Seating', name: 'Ottoman',         w: 700,  d: 500,  h: 420,  shape: 'rect',    color: '#9db4a8' },
  { id: 'dining-chair',group: 'Seating', name: 'Dining chair',    w: 450,  d: 500,  h: 900,  shape: 'rect',    color: '#c2a878' },

  /* Tables */
  { id: 'dining-6',    group: 'Tables',  name: 'Dining table (6)', w: 1800, d: 900,  h: 750, shape: 'rect',    color: '#c2a878' },
  { id: 'dining-8',    group: 'Tables',  name: 'Dining table (8)', w: 2200, d: 1000, h: 750, shape: 'rect',    color: '#c2a878' },
  { id: 'dining-round',group: 'Tables',  name: 'Round table',      w: 1200, d: 1200, h: 750, shape: 'ellipse', color: '#c2a878' },
  { id: 'coffee',      group: 'Tables',  name: 'Coffee table',     w: 1100, d: 600,  h: 420, shape: 'rect',    color: '#c2a878' },
  { id: 'side-table',  group: 'Tables',  name: 'Side table',       w: 450,  d: 450,  h: 550, shape: 'ellipse', color: '#c2a878' },
  { id: 'desk',        group: 'Tables',  name: 'Desk',             w: 1400, d: 700,  h: 740, shape: 'rect',    color: '#c2a878' },
  { id: 'console',     group: 'Tables',  name: 'Console',          w: 1200, d: 400,  h: 800, shape: 'rect',    color: '#c2a878' },

  /* Beds */
  { id: 'bed-king',    group: 'Beds',    name: 'King bed',        w: 1830, d: 2030, h: 600, shape: 'rect', color: '#b9a7c4' },
  { id: 'bed-queen',   group: 'Beds',    name: 'Queen bed',       w: 1530, d: 2030, h: 600, shape: 'rect', color: '#b9a7c4' },
  { id: 'bed-double',  group: 'Beds',    name: 'Double bed',      w: 1370, d: 1880, h: 600, shape: 'rect', color: '#b9a7c4' },
  { id: 'bed-king-single', group: 'Beds', name: 'King single bed', w: 1060, d: 2030, h: 600, shape: 'rect', color: '#b9a7c4' },
  { id: 'bed-single',  group: 'Beds',    name: 'Single bed',      w: 920,  d: 1880, h: 600, shape: 'rect', color: '#b9a7c4' },
  { id: 'cot',         group: 'Beds',    name: 'Cot',             w: 700,  d: 1320, h: 900, shape: 'rect', color: '#b9a7c4' },
  { id: 'bedside',     group: 'Beds',    name: 'Bedside table',   w: 450,  d: 400,  h: 550, shape: 'rect', color: '#c2a878' },

  /* Storage */
  { id: 'wardrobe',    group: 'Storage', name: 'Wardrobe',        w: 1200, d: 600,  h: 2100, shape: 'rect', color: '#b0a18e' },
  { id: 'chest',       group: 'Storage', name: 'Chest of drawers', w: 900, d: 450,  h: 1100, shape: 'rect', color: '#b0a18e' },
  { id: 'bookshelf',   group: 'Storage', name: 'Bookshelf',       w: 900,  d: 320,  h: 1800, shape: 'rect', color: '#b0a18e' },
  { id: 'tv-unit',     group: 'Storage', name: 'TV unit',         w: 1800, d: 450,  h: 550,  shape: 'rect', color: '#b0a18e' },
  { id: 'sideboard',   group: 'Storage', name: 'Sideboard',       w: 1600, d: 450,  h: 800,  shape: 'rect', color: '#b0a18e' },
  { id: 'shoe-rack',   group: 'Storage', name: 'Shoe rack',       w: 800,  d: 300,  h: 900,  shape: 'rect', color: '#b0a18e' },

  /* Kitchen & laundry */
  { id: 'fridge',      group: 'Appliances', name: 'Fridge',       w: 900,  d: 750,  h: 1800, shape: 'rect', color: '#cfd6da' },
  { id: 'oven-range',  group: 'Appliances', name: 'Range / oven',  w: 900,  d: 620,  h: 900,  shape: 'rect', color: '#cfd6da' },
  { id: 'dishwasher',  group: 'Appliances', name: 'Dishwasher',   w: 600,  d: 620,  h: 850,  shape: 'rect', color: '#cfd6da' },
  { id: 'washer',      group: 'Appliances', name: 'Washing machine', w: 600, d: 620, h: 850, shape: 'rect', color: '#cfd6da' },
  { id: 'dryer',       group: 'Appliances', name: 'Dryer',        w: 600,  d: 600,  h: 850,  shape: 'rect', color: '#cfd6da' },
  { id: 'island',      group: 'Appliances', name: 'Kitchen island', w: 2000, d: 900, h: 900,  shape: 'rect', color: '#b0a18e' },
  { id: 'bench-run',   group: 'Appliances', name: 'Bench run',    w: 2400, d: 600,  h: 900,  shape: 'rect', color: '#b0a18e' },

  /* Bathroom */
  { id: 'bath-tub',    group: 'Bathroom', name: 'Bath',           w: 1700, d: 750,  h: 550,  shape: 'rect',    color: '#c9dde4' },
  { id: 'shower',      group: 'Bathroom', name: 'Shower',         w: 900,  d: 900,  h: 2000, shape: 'rect',    color: '#c9dde4' },
  { id: 'vanity',      group: 'Bathroom', name: 'Vanity',         w: 900,  d: 460,  h: 850,  shape: 'rect',    color: '#c9dde4' },
  { id: 'toilet',      group: 'Bathroom', name: 'Toilet',         w: 400,  d: 700,  h: 780,  shape: 'ellipse', color: '#c9dde4' },
  { id: 'laundry-tub', group: 'Bathroom', name: 'Laundry tub',    w: 600,  d: 500,  h: 900,  shape: 'rect',    color: '#c9dde4' },

  /* Other */
  { id: 'rug-l',       group: 'Other',   name: 'Rug (large)',     w: 3000, d: 2000, h: 10,   shape: 'rect',    color: '#dcc9b0' },
  { id: 'rug-round',   group: 'Other',   name: 'Rug (round)',     w: 2000, d: 2000, h: 10,   shape: 'ellipse', color: '#dcc9b0' },
  { id: 'plant',       group: 'Other',   name: 'Plant',           w: 500,  d: 500,  h: 1400, shape: 'ellipse', color: '#93b58c' },
  { id: 'piano',       group: 'Other',   name: 'Upright piano',   w: 1500, d: 650,  h: 1250, shape: 'rect',    color: '#8d8478' },
  { id: 'car',         group: 'Other',   name: 'Car',             w: 1840, d: 4600, h: 1450, shape: 'rect',    color: '#a8b0b8' },
];

/* Items placed on a wall in the elevation view. `h` is the item's height and
 * `y` its default distance from the floor (mm), which is what makes a wall
 * cabinet hang and a base cabinet sit down. */
var ELEVATION_CATALOG = [
  { id: 'base-cab',   group: 'Joinery',  name: 'Base cabinet',   w: 600,  h: 870,  y: 0,    color: '#d8cfc0', kind: 'base' },
  { id: 'base-cab-2', group: 'Joinery',  name: 'Base cabinet 900', w: 900, h: 870, y: 0,    color: '#d8cfc0', kind: 'base' },
  { id: 'benchtop',   group: 'Joinery',  name: 'Benchtop',       w: 2400, h: 40,   y: 870,  color: '#8d8478', kind: 'bench' },
  { id: 'wall-cab',   group: 'Joinery',  name: 'Wall cabinet',   w: 600,  h: 720,  y: 1500, color: '#d8cfc0', kind: 'wall' },
  { id: 'wall-cab-2', group: 'Joinery',  name: 'Wall cabinet 900', w: 900, h: 720, y: 1500, color: '#d8cfc0', kind: 'wall' },
  { id: 'tall-cab',   group: 'Joinery',  name: 'Tall cabinet',   w: 600,  h: 2100, y: 0,    color: '#d8cfc0', kind: 'base' },
  { id: 'shelf',      group: 'Joinery',  name: 'Shelf',          w: 1200, h: 32,   y: 1400, color: '#8d8478', kind: 'shelf' },
  { id: 'open-shelves', group: 'Joinery', name: 'Open shelving', w: 900,  h: 900,  y: 1300, color: '#c7bba6', kind: 'shelf' },

  { id: 'art',        group: 'Decor',    name: 'Artwork',        w: 700,  h: 900,  y: 1100, color: '#e4d9c6', kind: 'art' },
  { id: 'mirror',     group: 'Decor',    name: 'Mirror',         w: 800,  h: 1000, y: 1000, color: '#d5e4ea', kind: 'mirror' },
  { id: 'tv',         group: 'Decor',    name: 'TV',             w: 1230, h: 710,  y: 900,  color: '#3c4148', kind: 'tv' },
  { id: 'heater',     group: 'Decor',    name: 'Heater',         w: 900,  h: 600,  y: 150,  color: '#cbd2d6', kind: 'heater' },

  { id: 'gpo',        group: 'Electrical', name: 'Power point',  w: 115,  h: 75,   y: 300,  color: '#f2efe8', kind: 'gpo' },
  { id: 'switch',     group: 'Electrical', name: 'Light switch', w: 115,  h: 115,  y: 1100, color: '#f2efe8', kind: 'switch' },
  { id: 'pendant',    group: 'Electrical', name: 'Wall light',   w: 200,  h: 250,  y: 1800, color: '#f5e6b8', kind: 'light' },
];

/* Paint / tile presets. Deliberately a small, usable set rather than a fan deck. */
var PAINT_SWATCHES = [
  { name: 'Chalk white',   hex: '#f4f2ec' },
  { name: 'Warm white',    hex: '#efe9dd' },
  { name: 'Soft grey',     hex: '#d9d9d4' },
  { name: 'Mid grey',      hex: '#a8a8a4' },
  { name: 'Charcoal',      hex: '#4a4d50' },
  { name: 'Sage',          hex: '#b6c2b0' },
  { name: 'Deep green',    hex: '#4c5f52' },
  { name: 'Sky',           hex: '#bcd0dc' },
  { name: 'Navy',          hex: '#38485c' },
  { name: 'Clay',          hex: '#cfae96' },
  { name: 'Terracotta',    hex: '#b5705a' },
  { name: 'Blush',         hex: '#e3cdc6' },
  { name: 'Mustard',       hex: '#d2a544' },
  { name: 'Oat',           hex: '#ded3bf' },
];

/* Groups, in the order the panels should show them. */
function catalogGroups(entries) {
  var seen = {};
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var g = entries[i].group || 'Other';
    if (!seen[g]) { seen[g] = true; out.push(g); }
  }
  return out;
}

function findCatalogEntry(id, extra) {
  var lists = [FURNITURE_CATALOG, ELEVATION_CATALOG, extra || []];
  for (var l = 0; l < lists.length; l++) {
    for (var i = 0; i < lists[l].length; i++) {
      if (lists[l][i].id === id) return lists[l][i];
    }
  }
  return null;
}
