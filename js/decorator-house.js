/* js/decorator-house.js — the traced house.
 *
 * Reconstructed from the supplied floor plan. Every labelled room dimension is
 * honoured exactly; the stitching between rooms is a best reading of the
 * drawing, which (like every marketing floor plan) is not internally consistent
 * to the millimetre. That is why the app ships a dimmed backdrop of the source
 * plan and lets wall endpoints be dragged — correcting the trace is a UI
 * action, not a code change.
 *
 * Units: millimetres. +x = right on the drawing (which is north, per its "N →"
 * arrow), +y = down the drawing. Origin at the north-west corner of the main
 * residence block, whose 4800mm width is set by the Living/Dining room.
 *
 * Declared with `var`/`function` on purpose: tests load this through
 * tests/helpers/vmLoader.js, where top-level const/let do not become context
 * properties. Must stay DOM-free.
 */

var HOUSE_SCHEMA_VERSION = 1;

var WALL_EXTERIOR = 200;
var WALL_INTERIOR = 110;

/* Standard opening heights (mm above finished floor). */
var OPENING_PRESETS = {
  door:    { sill: 0,   head: 2040 },
  slider:  { sill: 0,   head: 2100 },
  garage:  { sill: 0,   head: 2100 },
  window:  { sill: 900, head: 2100 },
  highWindow: { sill: 1500, head: 2100 },
};

/* How a door moves, which is what the plan symbol has to show. */
var OPENING_STYLE = { door: 'swing', slider: 'slide', garage: 'roller', window: 'fixed' };

/* An opening in a wall. `offset` is measured in mm along the wall from (x1,y1).
 * `kind` is what it is for the elevation ('door' or 'window'); `style` is how it
 * opens, so the plan can draw a swing arc, a sliding panel or a roller door. */
function hpOpening(id, kind, offset, width, preset) {
  var p = OPENING_PRESETS[preset || kind] || OPENING_PRESETS.window;
  return {
    id: id,
    kind: kind === 'garage' || kind === 'slider' ? 'door' : kind,
    style: OPENING_STYLE[preset || kind] || OPENING_STYLE[kind] || 'fixed',
    offset: offset,
    width: width,
    sillHeight: p.sill,
    headHeight: p.head,
  };
}

function hpWall(id, x1, y1, x2, y2, thickness, openings) {
  return {
    id: id,
    x1: x1, y1: y1, x2: x2, y2: y2,
    thickness: thickness || WALL_INTERIOR,
    openings: openings || [],
  };
}

/* Rooms are axis-aligned rectangles, stored as polygons so a future
 * non-rectangular room needs no schema change. */
function hpRoom(id, name, x0, y0, x1, y1, kind) {
  return {
    id: id,
    name: name,
    kind: kind || 'room',
    polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  };
}

/* ---------------------------------------------------------------- ground --
 * Main block 4800 wide. West wall steps 700mm east at y=9600 where the garage
 * takes over, matching the stepped outline on the drawing.
 */
function groundFloor() {
  var rooms = [
    hpRoom('g-balcony',  'Balcony',        0,    -1600, 4800, 0,     'outdoor'),
    hpRoom('g-living',   'Living / Dining', 0,     0,    4800, 6400),
    hpRoom('g-kitchen',  'Kitchen',         0,     6400, 3400, 9600),
    hpRoom('g-store',    'Store',           3800,  6400, 4800, 8400),
    hpRoom('g-stair',    'Stair',           3800,  8400, 4800, 11000, 'stair'),
    hpRoom('g-hall',     'Hall',            3400,  8400, 3800, 11000),
    hpRoom('g-laundry',  'Laundry',         700,   9600, 2100, 11000),
    hpRoom('g-bath',     'Bath',            2100,  9600, 3400, 11000),
    hpRoom('g-lounge',   'Lounge',          700,   11000, 4800, 15200),
    hpRoom('g-garage',   'Garage',          -2800, 9600, 700,  15600),
    hpRoom('g-porch',    'Porch',           2400,  15200, 3700, 16100, 'outdoor'),
  ];

  var walls = [
    /* --- main block envelope, clockwise from the north-west corner --- */
    hpWall('g-w-north', 0, 0, 4800, 0, WALL_EXTERIOR, [
      hpOpening('g-o-slider-1', 'slider', 700, 1200),
      hpOpening('g-o-slider-2', 'slider', 2600, 1200),
    ]),
    hpWall('g-w-east', 4800, 0, 4800, 15200, WALL_EXTERIOR, [
      hpOpening('g-o-liv-e', 'window', 1800, 1500),
      hpOpening('g-o-lounge-e', 'window', 11800, 1500),
    ]),
    hpWall('g-w-south', 4800, 15200, 700, 15200, WALL_EXTERIOR, [
      hpOpening('g-o-entry', 'door', 500, 900),
      hpOpening('g-o-lounge-s', 'window', 1800, 1500),
    ]),
    hpWall('g-w-west-lower', 700, 15200, 700, 9600, WALL_EXTERIOR, []),
    hpWall('g-w-west-step', 700, 9600, 0, 9600, WALL_EXTERIOR, []),
    hpWall('g-w-west-upper', 0, 9600, 0, 0, WALL_EXTERIOR, [
      hpOpening('g-o-kit-w', 'window', 1400, 1500),
      hpOpening('g-o-liv-w', 'window', 6000, 1800),
    ]),

    /* --- garage envelope (its east wall is shared with the block above) --- */
    hpWall('g-w-gar-north', 700, 9600, -2800, 9600, WALL_EXTERIOR, [
      hpOpening('g-o-gar-int', 'door', 300, 870),
    ]),
    hpWall('g-w-gar-west', -2800, 9600, -2800, 15600, WALL_EXTERIOR, []),
    hpWall('g-w-gar-south', -2800, 15600, 700, 15600, WALL_EXTERIOR, [
      hpOpening('g-o-gar-door', 'garage', 550, 2400),
    ]),
    hpWall('g-w-gar-east', 700, 15600, 700, 15200, WALL_EXTERIOR, []),

    /* --- internal partitions --- */
    /* Living/kitchen is open plan: two stub walls leave a 2500 opening. */
    hpWall('g-w-kit-n-west', 0, 6400, 1100, 6400, WALL_INTERIOR, []),
    hpWall('g-w-kit-n-east', 3600, 6400, 4800, 6400, WALL_INTERIOR, []),
    hpWall('g-w-store-w', 3800, 6400, 3800, 8400, WALL_INTERIOR, [
      hpOpening('g-o-store', 'door', 600, 820),
    ]),
    hpWall('g-w-store-s', 3800, 8400, 4800, 8400, WALL_INTERIOR, []),
    hpWall('g-w-kit-s', 700, 9600, 3400, 9600, WALL_INTERIOR, [
      hpOpening('g-o-laundry', 'door', 300, 820),
    ]),
    hpWall('g-w-laundry-e', 2100, 9600, 2100, 11000, WALL_INTERIOR, [
      hpOpening('g-o-bath', 'door', 400, 770),
    ]),
    hpWall('g-w-bath-e', 3400, 9600, 3400, 11000, WALL_INTERIOR, []),
    hpWall('g-w-lounge-n', 700, 11000, 3800, 11000, WALL_INTERIOR, [
      hpOpening('g-o-lounge-n', 'door', 2000, 900),
    ]),
  ];

  return {
    id: 'ground',
    name: 'Ground floor',
    ceilingHeight: 2700,
    walls: walls,
    rooms: rooms,
    backdrop: { x: -7160, y: -9256, scaleX: 20.375, scaleY: 23.413 },
  };
}

/* ----------------------------------------------------------------- first --
 * 4200 wide: bedrooms run off the west wall with their robes to the east, and
 * the stair/landing strip occupies the eastern 1000mm.
 */
function firstFloor() {
  var rooms = [
    hpRoom('f-bed3',  'Bedroom 3',  0,    0,     3300, 2900),
    hpRoom('f-robe3', 'Robe',       3300, 0,     4200, 2900, 'robe'),
    hpRoom('f-bed2',  'Bedroom 2',  0,    2900,  3200, 6500),
    hpRoom('f-robe2', 'Robe',       0,    6500,  3200, 7100, 'robe'),
    hpRoom('f-cup1',  'Linen',      3200, 2900,  4200, 3500, 'robe'),
    hpRoom('f-hall-n', 'Landing',   3200, 3500,  4200, 4300),
    hpRoom('f-stair', 'Stair',      3200, 4300,  4200, 7100, 'stair'),
    hpRoom('f-hall-s', 'Landing',   3200, 7100,  4200, 8600),
    hpRoom('f-cup2',  'Linen',      3200, 8600,  4200, 9200, 'robe'),
    hpRoom('f-bath',  'Bath',       0,    7100,  3200, 9200),
    hpRoom('f-bed1',  'Bedroom 1',  0,    9200,  3600, 12800),
    hpRoom('f-robe1', 'Robe',       3600, 9200,  4200, 12800, 'robe'),
  ];

  var walls = [
    /* --- envelope --- */
    hpWall('f-w-north', 0, 0, 4200, 0, WALL_EXTERIOR, [
      hpOpening('f-o-bed3-n', 'window', 900, 1500),
    ]),
    hpWall('f-w-east', 4200, 0, 4200, 12800, WALL_EXTERIOR, [
      hpOpening('f-o-stair-e', 'window', 5200, 1200),
      hpOpening('f-o-bed1-e', 'window', 10400, 1200),
    ]),
    hpWall('f-w-south', 4200, 12800, 0, 12800, WALL_EXTERIOR, [
      hpOpening('f-o-bed1-s', 'window', 1200, 1800),
    ]),
    hpWall('f-w-west', 0, 12800, 0, 0, WALL_EXTERIOR, [
      hpOpening('f-o-bed1-w', 'window', 1200, 1200),
      hpOpening('f-o-bath-w', 'window', 4400, 900, 'highWindow'),
      hpOpening('f-o-bed2-w', 'window', 7600, 1500),
      hpOpening('f-o-bed3-w', 'window', 11400, 1200),
    ]),

    /* --- internal partitions --- */
    hpWall('f-w-bed3-robe', 3300, 0, 3300, 2900, WALL_INTERIOR, [
      hpOpening('f-o-robe3', 'door', 900, 1500),
    ]),
    hpWall('f-w-bed3-s', 0, 2900, 4200, 2900, WALL_INTERIOR, [
      hpOpening('f-o-bed3', 'door', 2600, 820),
    ]),
    hpWall('f-w-bed2-e', 3200, 2900, 3200, 7100, WALL_INTERIOR, [
      hpOpening('f-o-bed2', 'door', 500, 820),
    ]),
    hpWall('f-w-robe2-n', 0, 6500, 3200, 6500, WALL_INTERIOR, [
      hpOpening('f-o-robe2', 'door', 600, 1800),
    ]),
    hpWall('f-w-bath-n', 0, 7100, 3200, 7100, WALL_INTERIOR, []),
    hpWall('f-w-bath-e', 3200, 7100, 3200, 9200, WALL_INTERIOR, [
      hpOpening('f-o-bath', 'door', 1000, 820),
    ]),
    hpWall('f-w-bath-s', 0, 9200, 4200, 9200, WALL_INTERIOR, [
      hpOpening('f-o-bed1', 'door', 2500, 820),
    ]),
    hpWall('f-w-bed1-robe', 3600, 9200, 3600, 12800, WALL_INTERIOR, [
      hpOpening('f-o-robe1', 'door', 1200, 1800),
    ]),
    hpWall('f-w-cup1-s', 3200, 3500, 4200, 3500, WALL_INTERIOR, [
      hpOpening('f-o-cup1', 'door', 200, 700),
    ]),
    hpWall('f-w-cup2-n', 3200, 8600, 4200, 8600, WALL_INTERIOR, [
      hpOpening('f-o-cup2', 'door', 200, 700),
    ]),
  ];

  return {
    id: 'first',
    name: 'First floor',
    ceilingHeight: 2550,
    walls: walls,
    rooms: rooms,
    backdrop: { x: -14423, y: -9521, scaleX: 23.077, scaleY: 22.456 },
  };
}

/* ----------------------------------------------------------------- store --
 * The 4.8 x 5.3 under-house store, drawn on the plan as "NOT IN POSITION", so
 * it gets its own tab rather than a guessed location.
 */
function storeFloor() {
  return {
    id: 'store',
    name: 'Store (detached)',
    ceilingHeight: 2400,
    rooms: [hpRoom('s-store', 'Store', 0, 0, 4800, 5300)],
    walls: [
      hpWall('s-w-north', 0, 0, 4800, 0, WALL_EXTERIOR, [
        hpOpening('s-o-door', 'door', 3600, 900),
      ]),
      hpWall('s-w-east', 4800, 0, 4800, 5300, WALL_EXTERIOR, []),
      hpWall('s-w-south', 4800, 5300, 0, 5300, WALL_EXTERIOR, [
        hpOpening('s-o-door2', 'door', 3800, 900),
      ]),
      hpWall('s-w-west', 0, 5300, 0, 0, WALL_EXTERIOR, [
        hpOpening('s-o-win', 'window', 2000, 1200),
      ]),
    ],
    backdrop: { x: -1554, y: -7703, scaleX: 23.188, scaleY: 23.556 },
  };
}

/* The source plan image, and how each floor's drawing on it maps onto the trace.
 * Measured off the file: the three sub-drawings sit at pixel boxes
 *   store  (67,327)-(274,552)   ground (214,327)-(587,1083)   first (625,424)-(807,994)
 * and each backdrop stretches that box onto the traced floor's own bounds. The
 * scale differs per axis because the original drawing is not squared up — which
 * is exactly the kind of thing the backdrop exists to reveal. Nudge from here. */
var BACKDROP_IMAGE = { width: 1079, height: 1208 };

var HOUSE_PLAN = {
  schemaVersion: HOUSE_SCHEMA_VERSION,
  name: 'Home',
  backdropSrc: 'assets/floorplan-source.png',
  backdropImage: BACKDROP_IMAGE,
  floors: [groundFloor(), firstFloor(), storeFloor()],
};

/* A fresh deep copy, so the app can mutate walls without touching the original. */
function freshHousePlan() {
  return JSON.parse(JSON.stringify({
    schemaVersion: HOUSE_SCHEMA_VERSION,
    name: HOUSE_PLAN.name,
    backdropSrc: HOUSE_PLAN.backdropSrc,
    backdropImage: BACKDROP_IMAGE,
    floors: [groundFloor(), firstFloor(), storeFloor()],
  }));
}
