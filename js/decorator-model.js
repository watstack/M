/* js/decorator-model.js — the pure model behind the 2D decorator.
 *
 * Geometry, snapping, wall→elevation projection, and persistence. Deliberately
 * DOM-free: this is the layer tests/decorator-model.test.js loads through
 * tests/helpers/vmLoader.js, whose vm context has no document, Blob, FileReader,
 * URL or structuredClone. All rendering and file I/O lives in decorator.html.
 *
 * Declared with `var`/`function` so the vm context exposes them.
 *
 * Units are millimetres throughout; angles are degrees unless a name says rad.
 */

var DESIGN_SCHEMA_VERSION = 1;
var DESIGN_STORAGE_KEY = 'decorator:design:v1';
var DEFAULT_GRID = 100;
var DEFAULT_WALL_SNAP = 250;   /* how close an item must be to stick to a wall */
var DEFAULT_GHOST_RANGE = 600; /* how near a wall plan furniture is ghosted in elevation */

/* ------------------------------------------------------------------ maths */

function degToRad(deg) { return deg * Math.PI / 180; }

function roundTo(value, places) {
  var f = Math.pow(10, places || 0);
  return Math.round(value * f) / f;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* A grid of 0 (or less) means "no snapping", which is how the UI turns it off. */
function snapToGrid(value, grid) {
  var g = grid == null ? DEFAULT_GRID : grid;
  if (g <= 0) return value;
  return Math.round(value / g) * g;
}

function wallLength(wall) {
  var dx = wall.x2 - wall.x1;
  var dy = wall.y2 - wall.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/* Angle of the wall in degrees, measured from +x toward +y. */
function wallAngle(wall) {
  return Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI;
}

/* Unit vector along the wall, and its left-hand normal. */
function wallAxes(wall) {
  var len = wallLength(wall);
  if (len === 0) return { ux: 1, uy: 0, nx: 0, ny: 1, length: 0 };
  var ux = (wall.x2 - wall.x1) / len;
  var uy = (wall.y2 - wall.y1) / len;
  return { ux: ux, uy: uy, nx: -uy, ny: ux, length: len };
}

/* Distance from a point to a wall's *line segment*. */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  var lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  var t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  var cx = x1 + t * dx;
  var cy = y1 + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

/* Project a plan point onto a wall.
 * `along` is the unclamped distance from (x1,y1) in mm; `clamped` is trimmed to
 * the wall; `perp` is the signed offset along the wall's left-hand normal. */
function projectPointOntoWall(px, py, wall) {
  var a = wallAxes(wall);
  var vx = px - wall.x1;
  var vy = py - wall.y1;
  var along = vx * a.ux + vy * a.uy;
  var perp = vx * a.nx + vy * a.ny;
  return {
    along: along,
    clamped: clamp(along, 0, a.length),
    perp: perp,
    length: a.length,
  };
}

/* The four corners of an item's footprint, honouring its rotation.
 * `x`,`y` are the centre; `w` is across the item and `d` its depth. */
function rotateRectCorners(item) {
  var hw = item.w / 2;
  var hd = item.d / 2;
  var r = degToRad(item.rotation || 0);
  var cos = Math.cos(r);
  var sin = Math.sin(r);
  var pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    out.push([
      item.x + pts[i][0] * cos - pts[i][1] * sin,
      item.y + pts[i][0] * sin + pts[i][1] * cos,
    ]);
  }
  return out;
}

function itemBounds(item) {
  var c = rotateRectCorners(item);
  var minX = c[0][0], maxX = c[0][0], minY = c[0][1], maxY = c[0][1];
  for (var i = 1; i < c.length; i++) {
    if (c[i][0] < minX) minX = c[i][0];
    if (c[i][0] > maxX) maxX = c[i][0];
    if (c[i][1] < minY) minY = c[i][1];
    if (c[i][1] > maxY) maxY = c[i][1];
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

function polygonBounds(polygon) {
  var minX = polygon[0][0], maxX = polygon[0][0];
  var minY = polygon[0][1], maxY = polygon[0][1];
  for (var i = 1; i < polygon.length; i++) {
    if (polygon[i][0] < minX) minX = polygon[i][0];
    if (polygon[i][0] > maxX) maxX = polygon[i][0];
    if (polygon[i][1] < minY) minY = polygon[i][1];
    if (polygon[i][1] > maxY) maxY = polygon[i][1];
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

/* Shoelace area in m². */
function roomArea(room) {
  var p = room.polygon;
  var sum = 0;
  for (var i = 0; i < p.length; i++) {
    var j = (i + 1) % p.length;
    sum += p[i][0] * p[j][1] - p[j][0] * p[i][1];
  }
  return Math.abs(sum / 2) / 1e6;
}

function roomCentroid(room) {
  var b = polygonBounds(room.polygon);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

function floorBounds(floor) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function take(x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (var i = 0; i < floor.walls.length; i++) {
    take(floor.walls[i].x1, floor.walls[i].y1);
    take(floor.walls[i].x2, floor.walls[i].y2);
  }
  for (var r = 0; r < floor.rooms.length; r++) {
    var p = floor.rooms[r].polygon;
    for (var k = 0; k < p.length; k++) take(p[k][0], p[k][1]);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

/* ---------------------------------------------------------------- snapping */

/* Push an item flush against the nearest wall it is already close to.
 * Returns a new {x, y} — never mutates. Falls back to the original position
 * when no wall is in range, so callers can apply it unconditionally. */
function snapItemToWalls(item, walls, tolerance) {
  var tol = tolerance == null ? DEFAULT_WALL_SNAP : tolerance;
  var best = null;

  for (var i = 0; i < walls.length; i++) {
    var wall = walls[i];
    var a = wallAxes(wall);
    if (a.length === 0) continue;

    var corners = rotateRectCorners(item);
    var alongMin = Infinity, alongMax = -Infinity, halfExtent = 0;
    for (var c = 0; c < corners.length; c++) {
      var vx = corners[c][0] - wall.x1;
      var vy = corners[c][1] - wall.y1;
      var al = vx * a.ux + vy * a.uy;
      if (al < alongMin) alongMin = al;
      if (al > alongMax) alongMax = al;
      var pe = Math.abs((corners[c][0] - item.x) * a.nx + (corners[c][1] - item.y) * a.ny);
      if (pe > halfExtent) halfExtent = pe;
    }
    /* Only snap to a wall the item actually sits alongside. */
    if (alongMax < 0 || alongMin > a.length) continue;

    var centre = projectPointOntoWall(item.x, item.y, wall);
    var side = centre.perp >= 0 ? 1 : -1;
    var target = side * ((wall.thickness || 0) / 2 + halfExtent);
    var delta = target - centre.perp;

    if (Math.abs(delta) <= tol && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
      best = { delta: delta, nx: a.nx, ny: a.ny, wallId: wall.id };
    }
  }

  if (!best) return { x: item.x, y: item.y, wallId: null };
  return {
    x: item.x + best.nx * best.delta,
    y: item.y + best.ny * best.delta,
    wallId: best.wallId,
  };
}

/* The wall nearest a plan point, within `tolerance`. */
function wallAtPoint(px, py, walls, tolerance) {
  var tol = tolerance == null ? 300 : tolerance;
  var best = null;
  for (var i = 0; i < walls.length; i++) {
    var w = walls[i];
    var d = pointToSegmentDistance(px, py, w.x1, w.y1, w.x2, w.y2);
    if (d <= tol && (best === null || d < best.distance)) best = { wall: w, distance: d };
  }
  return best ? best.wall : null;
}

/* -------------------------------------------------------------- elevation */

/* The face-on view of one wall: its extent, plus every opening placed on it.
 * `flip` views the wall from its other side, mirroring x — which is what you
 * want when the room you care about is on the far side. */
function elevationGeometry(wall, floor, opts) {
  var options = opts || {};
  var length = wallLength(wall);
  var height = (floor && floor.ceilingHeight) || 2400;
  var openings = [];
  var list = wall.openings || [];

  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    var x = options.flip ? length - o.offset - o.width : o.offset;
    openings.push({
      id: o.id,
      kind: o.kind,
      x: x,
      width: o.width,
      /* y is measured up from the floor; renderers flip it. */
      y: o.sillHeight,
      height: Math.max(0, o.headHeight - o.sillHeight),
      sillHeight: o.sillHeight,
      headHeight: o.headHeight,
    });
  }
  openings.sort(function (a, b) { return a.x - b.x; });

  return { wallId: wall.id, length: length, height: height, flipped: !!options.flip, openings: openings };
}

/* Plan furniture standing against a wall, projected into that wall's elevation
 * so joinery can be laid out around the actual sofa or bed. */
function ghostItemsOnWall(items, wall, opts) {
  var options = opts || {};
  var range = options.range == null ? DEFAULT_GHOST_RANGE : options.range;
  var a = wallAxes(wall);
  var out = [];
  if (a.length === 0) return out;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var corners = rotateRectCorners(item);
    var alongMin = Infinity, alongMax = -Infinity, nearest = Infinity;

    for (var c = 0; c < corners.length; c++) {
      var vx = corners[c][0] - wall.x1;
      var vy = corners[c][1] - wall.y1;
      var al = vx * a.ux + vy * a.uy;
      var pe = Math.abs(vx * a.nx + vy * a.ny);
      if (al < alongMin) alongMin = al;
      if (al > alongMax) alongMax = al;
      if (pe < nearest) nearest = pe;
    }

    if (nearest > range) continue;
    if (alongMax <= 0 || alongMin >= a.length) continue;

    var x0 = clamp(alongMin, 0, a.length);
    var x1 = clamp(alongMax, 0, a.length);
    if (x1 - x0 < 1) continue;

    out.push({
      itemId: item.id,
      name: item.name,
      x: options.flip ? a.length - x1 : x0,
      width: x1 - x0,
      height: item.h || 0,
      distance: nearest,
    });
  }
  return out;
}

/* ------------------------------------------------------------ wall finish */

function defaultWallFinish() {
  return {
    paint: '#f4f2ec',
    zones: [],
    cabinets: [],
    fixtures: [],
    skirting: { on: true, height: 90 },
    cornice: { on: false, height: 75 },
  };
}

/* Read-or-create, so callers never have to null-check. Mutates `design`. */
function wallFinishFor(design, wallId) {
  if (!design.wallFinishes) design.wallFinishes = {};
  if (!design.wallFinishes[wallId]) design.wallFinishes[wallId] = defaultWallFinish();
  return design.wallFinishes[wallId];
}

/* ------------------------------------------------------------------ items */

function newId(prefix) {
  var rand;
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
    rand = crypto.randomUUID().slice(0, 8);
  } else {
    rand = Math.random().toString(36).slice(2, 10);
  }
  return (prefix || 'id') + '-' + rand;
}

function createItem(entry, x, y, floorId) {
  return {
    id: newId('it'),
    catalogId: entry.id,
    name: entry.name,
    x: x,
    y: y,
    w: entry.w,
    d: entry.d,
    h: entry.h,
    rotation: 0,
    shape: entry.shape || 'rect',
    color: entry.color || '#b9b2a4',
    floorId: floorId,
  };
}

function createElevationItem(entry, x) {
  return {
    id: newId('el'),
    catalogId: entry.id,
    name: entry.name,
    kind: entry.kind || 'base',
    x: x,
    y: entry.y || 0,
    w: entry.w,
    h: entry.h,
    color: entry.color || '#d8cfc0',
  };
}

/* Validate a "add your own furniture" spec. Returns {ok:true, entry} or
 * {ok:false, error} — the dialog shows `error` verbatim. */
function validateFurnitureSpec(spec) {
  var name = (spec && spec.name ? String(spec.name) : '').trim();
  if (!name) return { ok: false, error: 'Give it a name.' };

  var dims = [['width', spec.w], ['depth', spec.d], ['height', spec.h]];
  for (var i = 0; i < dims.length; i++) {
    var v = Number(dims[i][1]);
    if (!isFinite(v) || v <= 0) return { ok: false, error: 'The ' + dims[i][0] + ' must be a number greater than zero.' };
    if (v > 20000) return { ok: false, error: 'The ' + dims[i][0] + ' looks too big — use millimetres (a 2m sofa is 2000).' };
  }

  return {
    ok: true,
    entry: {
      id: newId('custom'),
      group: 'My furniture',
      name: name,
      w: Number(spec.w),
      d: Number(spec.d),
      h: Number(spec.h),
      shape: spec.shape === 'ellipse' ? 'ellipse' : 'rect',
      color: spec.color || '#b9b2a4',
      custom: true,
    },
  };
}

/* Adds a validated entry to the design's reusable catalogue. Mutates `design`. */
function addCustomCatalogEntry(design, spec) {
  var result = validateFurnitureSpec(spec);
  if (!result.ok) return result;
  if (!design.customCatalog) design.customCatalog = [];
  design.customCatalog.push(result.entry);
  return result;
}

/* --------------------------------------------------------------- persistence */

function defaultDesign(house) {
  var plan = house || freshHousePlan();
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    savedAt: null,
    house: plan,
    items: [],
    wallFinishes: {},
    customCatalog: [],
    view: {
      floorId: plan.floors[0].id,
      mode: 'plan',
      wallId: null,
      grid: DEFAULT_GRID,
      snap: true,
      backdrop: { visible: false, opacity: 0.35 },
    },
  };
}

function cloneDesign(design) {
  return JSON.parse(JSON.stringify(design));
}

function serializeDesign(design) {
  var copy = cloneDesign(design);
  copy.schemaVersion = DESIGN_SCHEMA_VERSION;
  copy.savedAt = new Date().toISOString();
  return JSON.stringify(copy);
}

/* Parse a design, refusing anything this build cannot understand rather than
 * half-loading it. Throws with a message fit to show the user. */
function deserializeDesign(json) {
  var raw;
  try {
    raw = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a saved design.');
  if (raw.schemaVersion !== DESIGN_SCHEMA_VERSION) {
    throw new Error('That design was saved by a different version of the tool (v' +
      raw.schemaVersion + ', expected v' + DESIGN_SCHEMA_VERSION + ').');
  }
  if (!raw.house || !Array.isArray(raw.house.floors) || !raw.house.floors.length) {
    throw new Error('That design has no floor plan in it.');
  }

  var base = defaultDesign(raw.house);
  base.items = Array.isArray(raw.items) ? raw.items : [];
  base.wallFinishes = (raw.wallFinishes && typeof raw.wallFinishes === 'object') ? raw.wallFinishes : {};
  base.customCatalog = Array.isArray(raw.customCatalog) ? raw.customCatalog : [];
  base.savedAt = raw.savedAt || null;
  if (raw.view && typeof raw.view === 'object') {
    base.view.floorId = raw.view.floorId || base.view.floorId;
    base.view.mode = raw.view.mode === 'elevation' ? 'elevation' : 'plan';
    base.view.wallId = raw.view.wallId || null;
    if (typeof raw.view.grid === 'number' && raw.view.grid > 0) base.view.grid = raw.view.grid;
    if (typeof raw.view.snap === 'boolean') base.view.snap = raw.view.snap;
    if (raw.view.backdrop && typeof raw.view.backdrop === 'object') {
      base.view.backdrop.visible = !!raw.view.backdrop.visible;
      if (typeof raw.view.backdrop.opacity === 'number') {
        base.view.backdrop.opacity = clamp(raw.view.backdrop.opacity, 0, 1);
      }
    }
  }
  /* A floor id from an older save may no longer exist. */
  if (!findFloor(base, base.view.floorId)) base.view.floorId = base.house.floors[0].id;
  return base;
}

/* Never let a storage failure (private mode, quota) take the app down. */
function saveDesign(design) {
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, serializeDesign(design));
    return true;
  } catch (e) {
    return false;
  }
}

function loadDesign() {
  var raw;
  try {
    raw = localStorage.getItem(DESIGN_STORAGE_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  try {
    return deserializeDesign(raw);
  } catch (e) {
    return null;
  }
}

function clearSavedDesign() {
  try { localStorage.removeItem(DESIGN_STORAGE_KEY); return true; } catch (e) { return false; }
}

/* ------------------------------------------------------------------ lookup */

function findFloor(design, floorId) {
  var floors = design.house.floors;
  for (var i = 0; i < floors.length; i++) {
    if (floors[i].id === floorId) return floors[i];
  }
  return null;
}

function findWall(floor, wallId) {
  if (!floor) return null;
  for (var i = 0; i < floor.walls.length; i++) {
    if (floor.walls[i].id === wallId) return floor.walls[i];
  }
  return null;
}

function findWallInDesign(design, wallId) {
  var floors = design.house.floors;
  for (var i = 0; i < floors.length; i++) {
    var w = findWall(floors[i], wallId);
    if (w) return { floor: floors[i], wall: w };
  }
  return null;
}

function itemsOnFloor(design, floorId) {
  var out = [];
  for (var i = 0; i < design.items.length; i++) {
    if (design.items[i].floorId === floorId) out.push(design.items[i]);
  }
  return out;
}

/* Restore the original walls and rooms without throwing away furniture or
 * finishes — the "I dragged a wall somewhere silly" escape hatch. */
function resetHouseGeometry(design) {
  design.house = freshHousePlan();
  if (!findFloor(design, design.view.floorId)) design.view.floorId = design.house.floors[0].id;
  return design;
}
