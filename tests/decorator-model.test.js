import { describe, it, expect, beforeEach } from 'vitest';
import { loadFiles, makeStorageMock } from './helpers/vmLoader.js';

const storage = makeStorageMock();
const ctx = loadFiles(
  ['js/decorator-house.js', 'js/decorator-catalog.js', 'js/decorator-model.js'],
  { localStorage: storage, Infinity, isFinite },
);

/* A horizontal wall 4000 long running east, and a vertical one running south. */
const hWall = { id: 'h', x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 100, openings: [] };
const vWall = { id: 'v', x1: 0, y1: 0, x2: 0, y2: 3000, thickness: 100, openings: [] };

function item(overrides) {
  return Object.assign(
    { id: 'i1', name: 'Sofa', x: 2000, y: 1000, w: 2000, d: 900, h: 850, rotation: 0, shape: 'rect' },
    overrides,
  );
}

describe('geometry helpers', () => {
  it('measures wall length and angle', () => {
    expect(ctx.wallLength(hWall)).toBe(4000);
    expect(ctx.wallLength(vWall)).toBe(3000);
    expect(ctx.wallAngle(hWall)).toBe(0);
    expect(ctx.wallAngle(vWall)).toBe(90);
    expect(ctx.wallLength({ x1: 0, y1: 0, x2: 3000, y2: 4000 })).toBe(5000);
  });

  it('measures distance to the segment, not the infinite line', () => {
    /* Alongside the middle: a plain perpendicular drop. */
    expect(ctx.pointToSegmentDistance(2000, 500, 0, 0, 4000, 0)).toBe(500);
    /* Past the end: distance to the endpoint, not to the line (which would be 0). */
    expect(ctx.pointToSegmentDistance(5000, 0, 0, 0, 4000, 0)).toBe(1000);
    expect(ctx.pointToSegmentDistance(-300, 400, 0, 0, 4000, 0)).toBe(500);
  });

  it('projects a point onto a wall, clamping past each end', () => {
    const mid = ctx.projectPointOntoWall(1500, 600, hWall);
    expect(mid.along).toBe(1500);
    expect(mid.clamped).toBe(1500);
    expect(Math.abs(mid.perp)).toBe(600);

    const past = ctx.projectPointOntoWall(6000, 0, hWall);
    expect(past.along).toBe(6000);
    expect(past.clamped).toBe(4000);

    const before = ctx.projectPointOntoWall(-800, 0, hWall);
    expect(before.along).toBe(-800);
    expect(before.clamped).toBe(0);
  });

  it('rotates an item footprint about its centre', () => {
    const square = item({ x: 0, y: 0, w: 1000, d: 1000, rotation: 0 });
    const b0 = ctx.itemBounds(square);
    expect(b0.minX).toBe(-500);
    expect(b0.maxY).toBe(500);

    /* A 2000x1000 item turned 90° occupies 1000 across and 2000 deep. */
    const turned = item({ x: 0, y: 0, w: 2000, d: 1000, rotation: 90 });
    const b1 = ctx.itemBounds(turned);
    expect(Math.round(b1.maxX - b1.minX)).toBe(1000);
    expect(Math.round(b1.maxY - b1.minY)).toBe(2000);
  });

  it('snaps to the grid, including exactly on a boundary', () => {
    expect(ctx.snapToGrid(1249, 100)).toBe(1200);
    expect(ctx.snapToGrid(1250, 100)).toBe(1300);
    expect(ctx.snapToGrid(1300, 100)).toBe(1300);
    expect(ctx.snapToGrid(-1250, 100)).toBe(-1200);
    expect(ctx.snapToGrid(1234, 0)).toBe(1234);
  });

  it('computes room area in square metres', () => {
    const room = { polygon: [[0, 0], [4800, 0], [4800, 6400], [0, 6400]] };
    expect(ctx.roomArea(room)).toBeCloseTo(30.72, 2);
  });
});

describe('snapItemToWalls', () => {
  it('pulls an item flush against a wall face', () => {
    /* Sofa 900 deep, centre 600 below a 100-thick wall: 600 - (50 + 450) = 100 to close. */
    const sofa = item({ x: 2000, y: 600, w: 2000, d: 900, rotation: 0 });
    const snapped = ctx.snapItemToWalls(sofa, [hWall], 250);
    expect(snapped.wallId).toBe('h');
    expect(snapped.y).toBeCloseTo(500, 6);
    expect(snapped.x).toBe(2000);
  });

  it('leaves an item alone when no wall is within tolerance', () => {
    const sofa = item({ x: 2000, y: 3000, w: 2000, d: 900 });
    const snapped = ctx.snapItemToWalls(sofa, [hWall], 250);
    expect(snapped.wallId).toBeNull();
    expect(snapped.y).toBe(3000);
  });

  it('ignores a wall the item does not sit alongside', () => {
    /* Beyond the east end of the horizontal wall. */
    const sofa = item({ x: 6000, y: 500, w: 1000, d: 900 });
    const snapped = ctx.snapItemToWalls(sofa, [hWall], 250);
    expect(snapped.wallId).toBeNull();
  });

  it('snaps to the nearer of two walls', () => {
    const chair = item({ x: 480, y: 2000, w: 800, d: 800, rotation: 0 });
    const snapped = ctx.snapItemToWalls(chair, [hWall, vWall], 300);
    expect(snapped.wallId).toBe('v');
    expect(snapped.x).toBeCloseTo(450, 6);
  });
});

describe('elevationGeometry', () => {
  const floor = { ceilingHeight: 2700 };
  const wall = {
    id: 'w1', x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200,
    openings: [
      { id: 'win', kind: 'window', offset: 2500, width: 1500, sillHeight: 900, headHeight: 2100 },
      { id: 'dr', kind: 'door', offset: 300, width: 900, sillHeight: 0, headHeight: 2040 },
    ],
  };

  it('places openings at their offset and height', () => {
    const el = ctx.elevationGeometry(wall, floor);
    expect(el.length).toBe(4000);
    expect(el.height).toBe(2700);
    /* Sorted left to right regardless of declaration order. */
    expect(el.openings.map((o) => o.id)).toEqual(['dr', 'win']);

    const win = el.openings[1];
    expect(win.x).toBe(2500);
    expect(win.width).toBe(1500);
    expect(win.y).toBe(900);
    expect(win.height).toBe(1200);
  });

  it('mirrors x when viewed from the other side', () => {
    const el = ctx.elevationGeometry(wall, floor, { flip: true });
    expect(el.flipped).toBe(true);
    const win = el.openings.find((o) => o.id === 'win');
    /* 4000 - 2500 - 1500 = 0: the window ends up hard against the left edge. */
    expect(win.x).toBe(0);
    const door = el.openings.find((o) => o.id === 'dr');
    expect(door.x).toBe(2800);
  });

  it('falls back to a sane ceiling height without a floor', () => {
    expect(ctx.elevationGeometry(wall, null).height).toBe(2400);
  });
});

describe('ghostItemsOnWall', () => {
  it('projects nearby furniture onto the wall span', () => {
    const sofa = item({ id: 'sofa', x: 2000, y: 500, w: 2000, d: 900, h: 850 });
    const ghosts = ctx.ghostItemsOnWall([sofa], hWall, { range: 600 });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].x).toBe(1000);
    expect(ghosts[0].width).toBe(2000);
    expect(ghosts[0].height).toBe(850);
  });

  it('excludes furniture further away than the range', () => {
    const sofa = item({ x: 2000, y: 2500, w: 2000, d: 900 });
    expect(ctx.ghostItemsOnWall([sofa], hWall, { range: 600 })).toHaveLength(0);
  });

  it('clips furniture that overhangs the end of the wall', () => {
    const bench = item({ x: 3800, y: 300, w: 2000, d: 400 });
    const ghosts = ctx.ghostItemsOnWall([bench], hWall, { range: 600 });
    expect(ghosts[0].x).toBe(2800);
    expect(ghosts[0].width).toBe(1200); /* clipped at the 4000 end */
  });
});

describe('custom furniture', () => {
  it('accepts a sensible spec', () => {
    const res = ctx.validateFurnitureSpec({ name: 'Dining table', w: 1800, d: 900, h: 750 });
    expect(res.ok).toBe(true);
    expect(res.entry.w).toBe(1800);
    expect(res.entry.shape).toBe('rect');
  });

  it('rejects a missing name', () => {
    expect(ctx.validateFurnitureSpec({ name: '  ', w: 100, d: 100, h: 100 }).ok).toBe(false);
  });

  it('rejects zero, negative and non-numeric dimensions', () => {
    expect(ctx.validateFurnitureSpec({ name: 'A', w: 0, d: 100, h: 100 }).ok).toBe(false);
    expect(ctx.validateFurnitureSpec({ name: 'A', w: 100, d: -5, h: 100 }).ok).toBe(false);
    expect(ctx.validateFurnitureSpec({ name: 'A', w: 100, d: 100, h: 'tall' }).ok).toBe(false);
  });

  it('catches metres typed where millimetres were meant, in the other direction', () => {
    const res = ctx.validateFurnitureSpec({ name: 'A', w: 999999, d: 100, h: 100 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/millimetres/);
  });

  it('appends to the design catalogue', () => {
    const design = ctx.defaultDesign();
    ctx.addCustomCatalogEntry(design, { name: 'Bar stool', w: 380, d: 380, h: 760, shape: 'ellipse' });
    expect(design.customCatalog).toHaveLength(1);
    expect(design.customCatalog[0].shape).toBe('ellipse');
  });
});

describe('the traced house', () => {
  it('has all three floors with walls and rooms', () => {
    const house = ctx.freshHousePlan();
    expect(house.floors.map((f) => f.id)).toEqual(['ground', 'first', 'store']);
    for (const floor of house.floors) {
      expect(floor.walls.length).toBeGreaterThan(0);
      expect(floor.rooms.length).toBeGreaterThan(0);
      expect(floor.ceilingHeight).toBeGreaterThan(2000);
    }
  });

  it('honours the dimensions labelled on the plan', () => {
    const house = ctx.freshHousePlan();
    const byId = {};
    for (const floor of house.floors) {
      for (const room of floor.rooms) byId[room.id] = room;
    }
    const size = (id) => {
      const b = ctx.polygonBounds(byId[id].polygon);
      return [b.maxX - b.minX, b.maxY - b.minY];
    };
    expect(size('g-living')).toEqual([4800, 6400]);
    expect(size('g-lounge')).toEqual([4100, 4200]);
    expect(size('g-garage')).toEqual([3500, 6000]);
    expect(size('f-bed3')).toEqual([3300, 2900]);
    expect(size('f-bed2')).toEqual([3200, 3600]);
    expect(size('f-bed1')).toEqual([3600, 3600]);
    expect(size('s-store')).toEqual([4800, 5300]);
  });

  it('gives every wall and opening a unique id', () => {
    const house = ctx.freshHousePlan();
    const wallIds = new Set();
    const openingIds = new Set();
    for (const floor of house.floors) {
      for (const wall of floor.walls) {
        expect(wallIds.has(wall.id)).toBe(false);
        wallIds.add(wall.id);
        for (const o of wall.openings) {
          expect(openingIds.has(o.id)).toBe(false);
          openingIds.add(o.id);
          /* An opening must fit on its wall and be the right way up. */
          expect(o.offset).toBeGreaterThanOrEqual(0);
          expect(o.offset + o.width).toBeLessThanOrEqual(ctx.wallLength(wall));
          expect(o.headHeight).toBeGreaterThan(o.sillHeight);
        }
      }
    }
  });

  it('keeps every opening below its floor ceiling', () => {
    for (const floor of ctx.freshHousePlan().floors) {
      for (const wall of floor.walls) {
        for (const o of wall.openings) {
          expect(o.headHeight).toBeLessThanOrEqual(floor.ceilingHeight);
        }
      }
    }
  });

  it('hands out independent copies', () => {
    const a = ctx.freshHousePlan();
    const b = ctx.freshHousePlan();
    a.floors[0].walls[0].x1 = 12345;
    expect(b.floors[0].walls[0].x1).not.toBe(12345);
  });
});

describe('serialise / deserialise', () => {
  it('round-trips items, finishes and custom furniture', () => {
    const design = ctx.defaultDesign();
    const entry = ctx.FURNITURE_CATALOG.find((e) => e.id === 'sofa-3');
    design.items.push(ctx.createItem(entry, 1200, 3400, 'ground'));
    const finish = ctx.wallFinishFor(design, 'g-w-north');
    finish.paint = '#38485c';
    finish.cabinets.push({ id: 'c1', name: 'Base cabinet', x: 300, y: 0, w: 600, h: 870, color: '#fff' });
    ctx.addCustomCatalogEntry(design, { name: 'Hall bench', w: 1100, d: 400, h: 460 });

    const back = ctx.deserializeDesign(ctx.serializeDesign(design));
    expect(back.items).toHaveLength(1);
    expect(back.items[0].name).toBe('Sofa (3 seat)');
    expect(back.items[0].x).toBe(1200);
    expect(back.wallFinishes['g-w-north'].paint).toBe('#38485c');
    expect(back.wallFinishes['g-w-north'].cabinets).toHaveLength(1);
    expect(back.customCatalog[0].name).toBe('Hall bench');
    expect(back.savedAt).toBeTruthy();
  });

  it('preserves edited wall geometry', () => {
    const design = ctx.defaultDesign();
    ctx.findFloor(design, 'ground').walls[0].y1 = -250;
    const back = ctx.deserializeDesign(ctx.serializeDesign(design));
    expect(ctx.findFloor(back, 'ground').walls[0].y1).toBe(-250);
  });

  it('rejects a design from a different schema version', () => {
    const design = JSON.parse(ctx.serializeDesign(ctx.defaultDesign()));
    design.schemaVersion = 99;
    expect(() => ctx.deserializeDesign(JSON.stringify(design))).toThrow(/different version/);
  });

  it('rejects junk', () => {
    expect(() => ctx.deserializeDesign('not json at all')).toThrow(/valid JSON/);
    expect(() => ctx.deserializeDesign('[1,2,3]')).toThrow();
    expect(() => ctx.deserializeDesign(JSON.stringify({ schemaVersion: 1 }))).toThrow(/no floor plan/);
  });

  it('falls back to the first floor when the saved one is gone', () => {
    const design = JSON.parse(ctx.serializeDesign(ctx.defaultDesign()));
    design.view.floorId = 'basement';
    expect(ctx.deserializeDesign(JSON.stringify(design)).view.floorId).toBe('ground');
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => storage.clear());

  it('returns null when nothing is stored', () => {
    expect(ctx.loadDesign()).toBeNull();
  });

  it('saves and reloads a design', () => {
    const design = ctx.defaultDesign();
    design.items.push(ctx.createItem(ctx.FURNITURE_CATALOG[0], 500, 500, 'ground'));
    expect(ctx.saveDesign(design)).toBe(true);
    expect(ctx.loadDesign().items).toHaveLength(1);
  });

  it('discards corrupt stored data instead of throwing', () => {
    storage.setItem(ctx.DESIGN_STORAGE_KEY, '{ broken');
    expect(ctx.loadDesign()).toBeNull();
  });

  it('clears the saved design', () => {
    ctx.saveDesign(ctx.defaultDesign());
    ctx.clearSavedDesign();
    expect(ctx.loadDesign()).toBeNull();
  });
});

describe('lookup helpers', () => {
  it('finds floors, walls and per-floor items', () => {
    const design = ctx.defaultDesign();
    expect(ctx.findFloor(design, 'first').name).toBe('First floor');
    expect(ctx.findFloor(design, 'attic')).toBeNull();

    const ground = ctx.findFloor(design, 'ground');
    expect(ctx.findWall(ground, 'g-w-north').x2).toBe(4800);
    expect(ctx.findWall(ground, 'nope')).toBeNull();
    expect(ctx.findWallInDesign(design, 'f-w-north').floor.id).toBe('first');

    design.items.push(ctx.createItem(ctx.FURNITURE_CATALOG[0], 0, 0, 'ground'));
    design.items.push(ctx.createItem(ctx.FURNITURE_CATALOG[0], 0, 0, 'first'));
    expect(ctx.itemsOnFloor(design, 'ground')).toHaveLength(1);
  });

  it('restores wall geometry without losing furniture', () => {
    const design = ctx.defaultDesign();
    design.items.push(ctx.createItem(ctx.FURNITURE_CATALOG[0], 0, 0, 'ground'));
    ctx.findFloor(design, 'ground').walls[0].y1 = -9999;
    ctx.resetHouseGeometry(design);
    expect(ctx.findFloor(design, 'ground').walls[0].y1).toBe(0);
    expect(design.items).toHaveLength(1);
  });

  it('creates a default wall finish on first access and reuses it after', () => {
    const design = ctx.defaultDesign();
    const first = ctx.wallFinishFor(design, 'g-w-east');
    first.paint = '#000000';
    expect(ctx.wallFinishFor(design, 'g-w-east').paint).toBe('#000000');
    expect(ctx.wallFinishFor(design, 'g-w-west-upper').paint).toBe('#f4f2ec');
  });
});

describe('catalogue', () => {
  it('gives every entry positive real-world dimensions', () => {
    for (const entry of ctx.FURNITURE_CATALOG) {
      expect(entry.w).toBeGreaterThan(0);
      expect(entry.d).toBeGreaterThan(0);
      expect(entry.h).toBeGreaterThan(0);
      expect(['rect', 'ellipse']).toContain(entry.shape);
    }
    for (const entry of ctx.ELEVATION_CATALOG) {
      expect(entry.w).toBeGreaterThan(0);
      expect(entry.h).toBeGreaterThan(0);
      expect(entry.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses unique ids across both catalogues', () => {
    const ids = [...ctx.FURNITURE_CATALOG, ...ctx.ELEVATION_CATALOG].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks entries up, including custom ones', () => {
    expect(ctx.findCatalogEntry('bed-queen').w).toBe(1530);
    expect(ctx.findCatalogEntry('wall-cab').kind).toBe('wall');
    expect(ctx.findCatalogEntry('nope')).toBeNull();
    expect(ctx.findCatalogEntry('mine', [{ id: 'mine', name: 'Mine' }]).name).toBe('Mine');
  });

  it('lists groups in declaration order without duplicates', () => {
    const groups = ctx.catalogGroups(ctx.FURNITURE_CATALOG);
    expect(groups[0]).toBe('Seating');
    expect(new Set(groups).size).toBe(groups.length);
  });
});
