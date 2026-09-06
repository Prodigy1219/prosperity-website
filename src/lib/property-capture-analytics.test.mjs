import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {analyzeCapture, CAPTURE_CLASSIFIER_VERSION} from './property-capture-analytics.mjs';
import {validateBlockCapture, estimateBlockWorth} from './property-build.mjs';
import {area, validateCatalog} from './property-core.mjs';

// Synthetic geometry and prices below are boundary fixtures, not native evidence.
const capturedAt = '2026-09-06T12:00:00Z';
const now = Date.parse('2026-09-06T12:01:00Z');
const entry = (name, state = {}) => ({material: `minecraft:${name}`, state, color: '#777777'});
function fixture({origin = [-3, -64, -4], size = [3, 5, 3], palette = [entry('stone')],
  blocks = [[0, 0, 0, 0]], region = 'c001', points, tenure = 'buy'} = {}) {
  const [x, y, z] = origin, [sx, sy, sz] = size;
  const property = {id: `world:${region}`, worldId: 'world', world: 'world', region, tenure,
    geometry: {points: points ?? [[x, z], [x + sx, z], [x + sx, z + sz], [x, z + sz]],
      minY: y, maxY: y + sy - 1}, preview: {capturedAt}};
  const capture = {schemaVersion: 1, format: 'plot-blocks', propertyId: property.id,
    capturedAt, source: 'saved-world', origin, size, palette, blocks};
  const worth = {schemaVersion: 1, policy: 'paid-paste-state-BOM-at-worth-v1', rulesHash: 'a'.repeat(64),
    rules: {bmap: {AIR: '@SKIP', CAVE_AIR: '@SKIP', VOID_AIR: '@SKIP', FIRE: '@SKIP'}, statemul: {}},
    prices: {observedAt: capturedAt, sourceHash: 'b'.repeat(64),
      unitMicros: Object.fromEntries(palette.map(p => [p.material, 31250]))}};
  return {property, capture, worth};
}
const analyze = f => analyzeCapture(f.property, f.capture, f.worth, {now});
const category = (result, id) => result.categories.find(row => row.id === id);
function conservation(result, capture, worth) {
  const expected = estimateBlockWorth(validateBlockCapture(capture), worth);
  const sum = (rows, field) => rows.reduce((s, r) => s + r[field], 0);
  assert.equal(sum(result.categories, 'cells'), capture.blocks.length);
  assert.equal(sum(result.categories, 'occupiedCells'), result.occupancy.occupiedCells);
  assert.equal(sum(result.categories, 'unknownCells'), expected.unknownCells);
  assert.equal(sum(result.categories, 'valueMicros'), sum(expected.rows, 'valueMicros'));
  assert.equal(sum(result.categories, 'valueCents'), expected.knownSubtotalCents);
  assert.equal(result.valuation.knownValueMicros, sum(expected.rows, 'valueMicros'));
  assert.equal(result.valuation.knownSubtotalCents, expected.knownSubtotalCents);
  assert.equal(result.valuation.totalCents, expected.totalCents);
  assert.equal(sum(result.levels, 'occupiedCells'), result.occupancy.occupiedCells);
  assert.equal(sum(result.levels, 'standingSpaceCandidateCells'), result.standingSpaceCandidates.cells);
  assert.equal(result.standingSpaceCandidates.cells + result.standingSpaceCandidates.blockedAboveCells +
    result.standingSpaceCandidates.ceilingLimitedCells, result.occupancy.fullSolidCells);
  for (const row of result.materials) {
    const expectedRow = expected.rows.find(r => r.material === row.material);
    assert.equal(row.cells, expectedRow.cells);
    assert.equal(row.valueMicros, expectedRow.valueMicros);
    assert.equal(row.unknownCells, expectedRow.unknownCells);
  }
}

test('negative-coordinate footprint, complete capture geometry and occupied Y span are different measures', () => {
  const f = fixture({blocks: [[0, 0, 0, 0], [0, 3, 0, 0], [2, 4, 2, 0]]});
  const r = analyze(f);
  assert.equal(r.version, 1);
  assert.equal(r.classifierVersion, CAPTURE_CLASSIFIER_VERSION);
  assert.deepEqual(r.geometry.footprint, {regionArea: 9, captureBoundingColumns: 9,
    plotColumns: 9, occupiedColumns: 2, occupiedColumnRatio: 2 / 9});
  assert.deepEqual(r.geometry.occupiedYSpan, {minY: -64, maxY: -60, height: 5});
  assert.deepEqual(r.geometry.occupiedHorizontalBounds, {minX: -3, maxX: -1, minZ: -4, maxZ: -2});
  assert.deepEqual(r.levels.map(l => [l.y, l.occupiedCells]), [[-64, 1], [-63, 0], [-62, 0], [-61, 1], [-60, 1]]);
  assert.equal(r.occupancy.captureVolume, 45);
  assert.equal(r.occupancy.clearCells, 42);
  assert.equal(r.occupancy.occupiedRatio, 3 / 45);
  assert.equal(r.standingSpaceCandidates.cells, 1);
  assert.equal(r.standingSpaceCandidates.ceilingLimitedCells, 2);
  conservation(r, f.capture, f.worth);
});

test('identity, region, world, capture origin/extent, full Y slice and preview time must bind', () => {
  for (const mutate of [
    f => f.capture.propertyId = 'world:c002', f => f.property.region = 'c002',
    f => f.property.worldId = 'other', f => f.capture.origin[0]++, f => f.capture.origin[1]++,
    f => f.capture.origin[2]++, f => f.capture.size[0]--, f => f.capture.size[1]--,
    f => f.capture.size[2]--, f => f.property.geometry.minY--, f => f.property.geometry.maxY++,
    f => f.property.preview.capturedAt = '2026-09-06T12:02:00Z',
  ]) {
    const f = fixture(); mutate(f); assert.throws(() => analyze(f), /mismatch|bounds/);
  }
});

test('invalid, noninteger, degenerate geometry and self-crossing cuboid corners fail closed', () => {
  for (const mutate of [
    f => f.property.geometry.points[0][0] += 0.5,
    f => f.property.geometry.points[0][1] = NaN,
    f => f.property.geometry.points = [],
    f => f.property.geometry.points = Array(257).fill([0, 0]),
    f => f.property.geometry.minY = 0.5,
    f => f.property.geometry.maxY = -65,
    f => [f.property.geometry.points[1], f.property.geometry.points[2]] = [f.property.geometry.points[2], f.property.geometry.points[1]],
  ]) {
    const f = fixture(); mutate(f); assert.throws(() => analyze(f));
  }
});

test('concave inclusive integer polygon excludes its missing corner and respects negative X/Z', () => {
  const options = {origin: [-4, -10, -4], size: [5, 4, 5],
    points: [[-4, -4], [0, -4], [0, -2], [-2, -2], [-2, 0], [-4, 0]],
    blocks: [[0, 0, 0, 0], [4, 0, 2, 0], [2, 0, 4, 0], [2, 0, 3, 0]]};
  const f = fixture(options), r = analyze(f);
  assert.equal(r.geometry.binding, 'catalog-inclusive-integer-polygon');
  assert.equal(r.geometry.footprint.regionArea, 12);
  assert.equal(r.geometry.footprint.plotColumns, 21);
  assert.equal(r.occupancy.plotVolume, 84);
  assert.equal(r.occupancy.outsidePlotVolume, 16);
  assert.equal(r.standingSpaceCandidates.cells, 4);
  assert.equal(r.flags.clipping.plotBoundaryCells, 4);
  assert.equal(r.geometry.nativeMaskVerified, false);
  f.capture.blocks.push([3, 0, 3, 0]);
  assert.throws(() => analyze(f), /outside property polygon/);
});

test('sloped polygon edges, closing vertices and winding reversal retain inclusive lattice membership', () => {
  const points = [[-3, -3], [1, -3], [-3, 1], [-3, -3]];
  const f = fixture({origin: [-3, 0, -3], size: [5, 3, 5], points,
    blocks: [[0, 0, 0, 0], [2, 0, 2, 0], [4, 0, 0, 0], [0, 0, 4, 0]]});
  const r = analyze(f);
  assert.equal(r.geometry.footprint.regionArea, 8);
  assert.equal(r.geometry.footprint.plotColumns, 15);
  f.property.geometry.points.reverse();
  assert.deepEqual(analyze(f), r);
  f.capture.blocks.push([3, 0, 2, 0]);
  assert.throws(() => analyze(f), /outside property polygon/);
});

test('self-intersecting native-style rings are flagged and bound by inclusive even-odd columns, not certified area', () => {
  const points = [[-2, 0], [2, 4], [-2, 4], [2, 0], [2, -1], [-2, 0]];
  const blocks = [];
  // Independent point/ray reference for every integer column in this small fixture.
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 4; z++) {
    let inside = false, boundary = false;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      if ((x - ax) * (bz - az) === (z - az) * (bx - ax) &&
          x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && z >= Math.min(az, bz) && z <= Math.max(az, bz)) boundary = true;
      if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) inside = !inside;
    }
    if (inside || boundary) blocks.push([x + 2, 0, z + 1, 0]);
  }
  const f = fixture({origin: [-2, -10, -1], size: [5, 3, 6], points, blocks}), r = analyze(f);
  assert.equal(r.geometry.polygonSelfIntersects, true);
  assert.equal(r.geometry.footprint.plotColumns, blocks.length);
  assert.equal(r.geometry.footprint.regionArea, area(f.property));
  assert.equal(r.standingSpaceCandidates.usableFloorArea, null);
  assert(r.limitations.some(s => /Self-intersecting catalog rings are flagged/.test(s)));
});

test('rental/sublet one- and two-block Y slices never infer standing surfaces outside their ceiling', () => {
  for (const sy of [1, 2]) {
    const f = fixture({size: [3, sy, 3], tenure: 'rent', region: 'apt_room_01'});
    const r = analyze(f);
    assert.equal(r.standingSpaceCandidates.cells, 0);
    assert.equal(r.standingSpaceCandidates.ceilingLimitedCells, 1);
    assert.equal(r.flags.clipping.thinVerticalSlice, true);
    assert.equal(r.standingSpaceCandidates.usableFloorArea, null);
    assert.equal(r.standingSpaceCandidates.accessibleArea, null);
    assert(!Object.hasOwn(r.valuation, 'combinedEstimateCents'));
  }
});

test('only allowlisted full solids with TWO clear cells count, even if floors are vertically stacked', () => {
  const f = fixture({size: [3, 7, 3], blocks: [[0, 0, 0, 0], [0, 3, 0, 0], [0, 6, 0, 0]]});
  const r = analyze(f);
  assert.equal(r.standingSpaceCandidates.cells, 2);
  assert.equal(r.geometry.footprint.occupiedColumns, 1);
  assert.equal(r.standingSpaceCandidates.ceilingLimitedCells, 1);
  assert.equal(r.levels.filter(l => l.standingSpaceCandidateCells).length, 2);
  assert(r.limitations.some(s => /not usable rooms/.test(s)));
  assert(!Object.hasOwn(r, 'beautyScore'));
  assert(!Object.hasOwn(r, 'floorCount'));
  assert(!Object.hasOwn(r.valuation, 'premiumCents'));
});

test('single-cell gaps, open doors, vegetation, water and unknown blocks obstruct conservative clearance', () => {
  for (const name of ['stone', 'oak_door', 'torch', 'short_grass', 'water', 'future_custom_panel']) {
    for (const dy of [1, 2]) {
      const f = fixture({palette: [entry('stone'), entry(name, name === 'oak_door' ? {open: 'true'} : {})],
        blocks: [[0, 0, 0, 0], [0, dy, 0, 1]]});
      const r = analyze(f);
      assert.equal(r.levels[0].standingSpaceCandidateCells, 0, `${name} at +${dy}`);
      assert(r.standingSpaceCandidates.blockedAboveCells >= 1);
    }
  }
});

test('slabs including double, stairs, walls, fences, containers, plants, snow, farmland and unknown states are not floor certified', () => {
  for (const p of [entry('oak_slab', {type: 'double'}), entry('stone_slab', {type: 'top'}), entry('oak_stairs'),
    entry('cobblestone_wall'), entry('oak_fence'), entry('chest'), entry('azalea'), entry('snow', {layers: '8'}),
    entry('farmland'), entry('dirt_path'), entry('sand'), entry('gravel'), entry('white_concrete_powder'),
    entry('magma_block'), entry('soul_sand'), entry('future_stone'), entry('stone', {future_shape: 'small'}),
    entry('oak_planks', {waterlogged: 'true'}), entry('note_block')]) {
    const r = analyze(fixture({palette: [p]}));
    assert.equal(r.standingSpaceCandidates.cells, 0, p.material);
  }
  for (const p of [entry('stone'), entry('oak_planks'), entry('glass'), entry('white_concrete'),
    entry('bricks'), entry('stripped_spruce_log', {axis: 'x'}), entry('grass_block', {snowy: 'false'}),
    entry('podzol', {snowy: 'true'}), entry('redstone_ore', {lit: 'true'})])
    assert.equal(analyze(fixture({palette: [p]})).standingSpaceCandidates.cells, 1, p.material);
});

test('explicit air is clear but remains a separate recorded-cell count and BOM skip', () => {
  const f = fixture({palette: [entry('stone'), entry('air'), entry('cave_air'), entry('void_air')],
    blocks: [[0, 0, 0, 0], [0, 1, 0, 1], [0, 2, 0, 2], [1, 4, 1, 3]]});
  const r = analyze(f);
  assert.equal(r.occupancy.capturedCells, 4);
  assert.equal(r.occupancy.occupiedCells, 1);
  assert.equal(r.occupancy.explicitAirCells, 3);
  assert.deepEqual(r.geometry.occupiedYSpan, {minY: -64, maxY: -64, height: 1});
  assert.equal(r.standingSpaceCandidates.cells, 1);
  assert.equal(r.valuation.skippedCells, 3);
  assert.equal(r.geometry.footprint.occupiedColumns, 1);
  assert.equal(r.flags.unknown.unclassifiedCells, 0);
  conservation(r, f.capture, f.worth);
});

test('empty or all-air captures have null occupied spans, zero coverage and no architectural inference', () => {
  for (const blocks of [[], [[0, 0, 0, 0]]]) {
    const f = fixture({palette: [entry('air')], blocks}), r = analyze(f);
    assert.equal(r.geometry.occupiedYSpan, null);
    assert.equal(r.geometry.occupiedHorizontalBounds, null);
    assert.equal(r.occupancy.occupiedRatio, 0);
    assert.equal(r.geometry.footprint.occupiedColumnRatio, 0);
    assert.equal(r.standingSpaceCandidates.cells, 0);
    assert.equal(r.flags.clipping.possible, false);
    conservation(r, f.capture, f.worth);
  }
});

test('all seven categories conserve counts and exact micros; naturally occurring stone is explicitly ambiguous', () => {
  const palette = ['oak_planks', 'chest', 'stone', 'diamond_ore', 'oak_leaves', 'water', 'future_bricks'].map(n => entry(n));
  const f = fixture({size: [7, 3, 1], palette, blocks: palette.map((_, i) => [i, 0, 0, i])}), r = analyze(f);
  assert.equal(r.categories.length, 7);
  for (const c of r.categories) { assert.equal(c.cells, 1); assert.equal(c.valueMicros, 31250); }
  assert.equal(r.flags.unknown.unclassifiedCells, 1, 'priced does not mean recognized by the classifier');
  assert.equal(r.flags.unknown.valuationCells, 0);
  assert.equal(r.flags.terrainAmbiguity.placementKnown, false);
  assert(r.limitations.some(s => /Terrain cannot be separated definitively from player-placed stone/.test(s)));
  conservation(r, f.capture, f.worth);
});

test('largest remainders allocate once-rounded cents without cheap-row loss or per-category rounding drift', () => {
  const palette = ['oak_planks', 'chest', 'stone', 'iron_ore', 'oak_leaves', 'water', 'future_bricks'].map(n => entry(n));
  const f = fixture({size: [7, 3, 1], palette, blocks: palette.map((_, i) => [i, 0, 0, i])});
  for (const micros of [1, 4999, 5000, 5001, 9999, 10001, 31250]) {
    for (const p of palette) f.worth.prices.unitMicros[p.material] = micros;
    const r = analyze(f);
    conservation(r, f.capture, f.worth);
    for (const c of r.categories) assert(Math.abs(c.valueCents - c.valueMicros / 10000) <= 1);
    if (micros === 5000) assert.deepEqual(r.categories.map(c => c.valueCents), [1, 1, 1, 1, 0, 0, 0]);
  }
});

test('state BOM quantities, waterlogging, mapped compounds and both door halves stay distinct from cell counts', () => {
  const palette = [entry('oak_slab', {type: 'double', waterlogged: 'true'}),
    entry('oak_door', {half: 'lower'}), entry('oak_door', {half: 'upper'}), entry('water_cauldron'),
    entry('sea_pickle', {pickles: '4'}), entry('beehive', {honey_level: '5'})];
  const f = fixture({size: [6, 3, 1], palette, blocks: palette.map((_, i) => [i, 0, 0, i])});
  Object.assign(f.worth.rules.bmap, {WATER: 'WATER_BUCKET', WATER_CAULDRON: 'CAULDRON+WATER_BUCKET'});
  Object.assign(f.worth.rules.statemul, {OAK_SLAB: 'DBL|2', SEA_PICKLE: 'NUM:pickles|4'});
  Object.assign(f.worth.prices.unitMicros, {'minecraft:water_bucket': 1111, 'minecraft:cauldron': 2222, 'minecraft:honeycomb': 3333});
  const r = analyze(f);
  assert.equal(r.materials.find(m => m.material === 'minecraft:oak_slab').valueMicros, 2 * 31250 + 1111);
  assert.equal(r.materials.find(m => m.material === 'minecraft:oak_slab').cells, 1);
  assert.equal(r.materials.find(m => m.material === 'minecraft:sea_pickle').valueMicros, 4 * 31250);
  assert.equal(r.materials.find(m => m.material === 'minecraft:beehive').valueMicros, 31250 + 3 * 3333);
  const door = r.materials.find(m => m.material === 'minecraft:oak_door');
  assert.equal(door.cells, 2); assert.equal(door.valueMicros, 62500);
  assert(door.warnings.some(w => /both occupied halves/.test(w)));
  assert.equal(r.flags.waterloggedCells, 1);
  assert.equal(category(r, 'fluid').cells, 0, 'mapped water belongs to its source block row, not an extra fluid cell');
  assert.equal(r.valuation.itemQuantities, null);
  conservation(r, f.capture, f.worth);
});

test('partial row unknown states, unpriced materials and custom identity remain unknown rather than zero-complete', () => {
  const palette = [entry('stone'), entry('oak_slab', {type: 'double'}), entry('oak_slab'),
    entry('note_block'), entry('player_head'), entry('player_wall_head'), entry('future_panel')];
  const f = fixture({size: [7, 3, 1], palette, blocks: palette.map((_, i) => [i, 0, 0, i])});
  f.worth.rules.statemul.OAK_SLAB = 'DBL|2';
  delete f.worth.prices.unitMicros['minecraft:future_panel'];
  f.worth.prices.unitMicros['minecraft:stone'] = 0;
  const r = analyze(f);
  assert.equal(r.valuation.totalCents, null);
  assert.equal(r.valuation.unknownCells, 5);
  assert.equal(r.flags.customIdentity.unresolvedCells, 3);
  const slab = r.materials.find(m => m.material === 'minecraft:oak_slab');
  assert.equal(slab.cells, 2); assert.equal(slab.unknownCells, 1); assert.equal(slab.valueMicros, 62500);
  assert.equal(r.valuation.knownValueMicros, 62500);
  conservation(r, f.capture, f.worth);
});

test('NBT, private extra fields and untrusted supplied analytics never survive projection', () => {
  const f = fixture({palette: [entry('note_block')]});
  f.capture.inventory = ['PRIVATE_NBT']; f.capture.analytics = {beautyScore: 100, secret: 'PRIVATE_NBT'};
  f.capture.palette[0].nbt = {Items: ['PRIVATE_NBT']};
  f.property.owner = {name: 'PRIVATE_NBT'}; f.worth.private = 'PRIVATE_NBT';
  const r = analyze(f), json = JSON.stringify(r);
  assert(!json.includes('PRIVATE_NBT'));
  assert(!json.includes('beautyScore'));
  assert.equal(r.flags.customIdentity.nbtInspected, false);
  assert.equal(r.valuation.totalCents, null);
});

test('r-plot ore review and six-solid-neighbor observations do not infer hidden inventory or fraudulent placement', () => {
  const blocks = [[1, 1, 1, 1], [0, 1, 1, 0], [2, 1, 1, 0], [1, 0, 1, 0],
    [1, 2, 1, 0], [1, 1, 0, 0], [1, 1, 2, 0], [2, 0, 2, 2], [0, 0, 0, 3]];
  const f = fixture({region: 'r009', palette: [entry('stone'), entry('deepslate_diamond_ore'), entry('diamond_block'), entry('chest')], blocks});
  const r = analyze(f);
  assert.deepEqual(r.flags.oreOrStorage, {oreCells: 1, storageCells: 1, rPlot: true,
    rPlotOreContaminationReview: true, originOrIntentKnown: false});
  assert.deepEqual(r.flags.hiddenStockpile, {assessed: false, sixSolidNeighborEnclosedOreOrStorageCells: 1,
    containerCells: 1, inventoryContentsObserved: false});
  assert(r.limitations.some(s => /not an assumption.*fraud/.test(s)));
  f.property.region = 'c001'; f.property.id = f.capture.propertyId = 'world:c001';
  assert.equal(analyze(f).flags.oreOrStorage.rPlotOreContaminationReview, false);
  f.capture.blocks = blocks.filter(b => !(b[0] === 1 && b[1] === 2));
  assert.equal(analyze(f).flags.hiddenStockpile.sixSolidNeighborEnclosedOreOrStorageCells, 0);
});

test('capture-boundary contact is possible clipping, not proof of missing structure', () => {
  const f = fixture({size: [5, 5, 5], blocks: [[2, 1, 2, 0]]});
  assert.equal(analyze(f).flags.clipping.possible, false);
  f.capture.blocks.push([0, 4, 0, 0]);
  const r = analyze(f);
  assert.equal(r.flags.clipping.captureBoundaryCells, 1);
  assert.equal(r.flags.clipping.boundary.maxY, 1);
  assert.equal(r.flags.clipping.boundary.minX, 1);
  assert.equal(r.flags.clipping.actualClippingVerified, false);
});

function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
test('frozen inputs are unchanged; outputs share no mutable state with inputs or later calls', () => {
  const f = freeze(fixture()), before = JSON.stringify(f), r = analyze(f);
  assert.deepEqual(analyze(f), r);
  assert.equal(JSON.stringify(f), before);
  r.geometry.origin[0] = 1000; r.materials[0].warnings.push('changed'); r.categories[0].valueMicros = 123;
  assert.equal(JSON.stringify(f), before);
  assert.notDeepEqual(analyze(f), r);
});

test('no implicit clock: omitted now is deterministic and explicit future capture/worth are flagged', () => {
  const f = fixture();
  const r = analyzeCapture(f.property, f.capture, f.worth);
  assert.equal(r.provenance.now, null); assert.equal(r.provenance.ageMs, null);
  assert.equal(analyze(f).provenance.ageMs, 60000);
  const future = analyzeCapture(f.property, f.capture, f.worth, {now: now - 120000});
  assert.equal(future.flags.futureCapture, true); assert.equal(future.flags.futureWorth, true);
  for (const bad of [NaN, Infinity, '2026-09-06', 0.5, 8640000000000001])
    assert.throws(() => analyzeCapture(f.property, f.capture, f.worth, {now: bad}), /clock/);
});

test('capture and palette order changes do not affect observables or cents allocation', () => {
  const f = fixture({palette: [entry('stone'), entry('oak_planks')], blocks: [[0, 0, 0, 0], [1, 0, 1, 1]]});
  const before = analyze(f);
  f.capture.palette.reverse(); f.capture.blocks.reverse();
  for (const b of f.capture.blocks) b[3] = 1 - b[3];
  assert.deepEqual(analyze(f), before);
});

test('duplicate, noninteger, out-of-bounds and invalid palette captures use the existing rejection contract', () => {
  for (const mutate of [f => f.capture.blocks.push([0, 0, 0, 0]),
    f => f.capture.blocks[0][0] = -1, f => f.capture.blocks[0][1] = 5,
    f => f.capture.blocks[0][2] = 0.5, f => f.capture.blocks[0][3] = 1,
    f => f.capture.palette[0].material = 'custom:stone', f => f.capture.palette[0].state = {private: 'not safe'},
    f => f.capture.palette = Array(4097).fill(entry('stone'))]) {
    const f = fixture(); mutate(f); assert.throws(() => analyze(f));
  }
});

test('exact 250k captured-cell ceiling succeeds and larger input fails before analysis', {timeout: 15000}, () => {
  const f = fixture({size: [100, 25, 100], blocks: []});
  for (let y = 0; y < 25; y++) for (let z = 0; z < 100; z++) for (let x = 0; x < 100; x++)
    f.capture.blocks.push([x, y, z, 0]);
  const r = analyze(f);
  assert.equal(r.occupancy.occupiedCells, 250000);
  assert.equal(r.occupancy.occupiedRatio, 1);
  assert.equal(r.standingSpaceCandidates.cells, 0);
  assert.equal(r.levels.length, 25);
  assert.equal(r.valuation.knownValueMicros, 7812500000);
  f.capture.blocks.push([0, 0, 0, 0]);
  assert.throws(() => analyze(f), /block budget/);
});

test('2m volume ceiling, 512 height and negative Y work sparsely without inventing floors in empty volume', () => {
  const f = fixture({origin: [-100, -256, -100], size: [100, 200, 100], blocks: [[0, 0, 0, 0]]});
  const r = analyze(f);
  assert.equal(r.occupancy.captureVolume, 2000000);
  assert.equal(r.occupancy.clearCells, 1999999);
  assert.equal(r.standingSpaceCandidates.cells, 1);
  f.capture.size[1]++;
  assert.throws(() => analyze(f), /bounds exceeded/);
  const tall = analyze(fixture({origin: [-1, -256, -1], size: [1, 512, 1], blocks: [[0, 0, 0, 0], [0, 511, 0, 0]]}));
  assert.equal(tall.levels.length, 512);
  assert.deepEqual(tall.geometry.occupiedYSpan, {minY: -256, maxY: 255, height: 512});
  assert.equal(tall.standingSpaceCandidates.ceilingLimitedCells, 1);
});

test('price and rule budgets fail closed, no empty capture bypass of worth verification', () => {
  for (const mutate of [
    f => f.worth.rulesHash = 'bad', f => f.worth.prices.sourceHash = 'bad',
    f => f.worth.prices.observedAt = 'bad', f => f.worth.rules.bmap = [],
    f => f.worth.rules.statemul.STONE = 'X'.repeat(257),
    f => f.worth.rules.bmap = Object.fromEntries(Array.from({length: 3001}, (_, i) => [`KEY_${i}`, '@SKIP'])),
    f => f.worth.prices.unitMicros = Object.fromEntries(Array.from({length: 10001}, (_, i) => [`minecraft:item_${i}`, 1])),
    f => f.worth.prices.unitMicros['minecraft:stone'] = 1e12 + 1,
    f => f.worth.prices.unitMicros['minecraft:stone'] = -1,
    f => f.worth.prices.unitMicros['minecraft:stone'] = 0.5,
  ]) {
    const f = fixture({blocks: []}); mutate(f); assert.throws(() => analyze(f));
  }
});

test('safe-integer total overflow is rejected, while high valid exact values conserve', () => {
  const f = fixture({size: [100, 1, 100], blocks: []});
  for (let z = 0; z < 100; z++) for (let x = 0; x < 100; x++) f.capture.blocks.push([x, 0, z, 0]);
  f.worth.prices.unitMicros['minecraft:stone'] = 1e12;
  const r = analyze(f);
  // The existing adapter withholds an overflowing material row as unknown.
  assert.equal(r.valuation.totalCents, null);
  assert.equal(r.valuation.unknownCells, 10000);
  f.capture.palette.push(entry('oak_planks'));
  for (let i = 5000; i < 10000; i++) f.capture.blocks[i][3] = 1;
  f.worth.prices.unitMicros['minecraft:oak_planks'] = 1e12;
  assert.throws(() => analyze(f), /total overflow/);
  f.worth.prices.unitMicros['minecraft:oak_planks'] = 1e11;
  conservation(analyze(f), f.capture, f.worth);
});

test('all existing bundled capture artifacts agree with their hashes, property bounds and actual worth rows', () => {
  const catalog = validateCatalog(JSON.parse(readFileSync(new URL('../data/property-catalog.json', import.meta.url))));
  const worth = JSON.parse(readFileSync(new URL('../data/property-worth.json', import.meta.url)));
  for (const id of ['world:c001', 'world:r009', 'world:apt_01', 'world:apt_room_08'])
    assert(catalog.properties.some(p => p.id === id));
  for (const property of catalog.properties) {
    assert.match(property.preview.url, /^\/property-previews\/[a-f0-9]{64}\.json$/);
    const bytes = readFileSync(new URL(`../../public${property.preview.url}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), property.preview.url.split('/').at(-1).slice(0, -5));
    const capture = JSON.parse(bytes), r = analyzeCapture(property, capture, worth, {now});
    assert.equal(r.geometry.footprint.regionArea, area(property));
    conservation(r, capture, worth);
  }
});

// Explicitly opt in: PROPERTY_CAPTURE_ANALYTICS_LIVE=1 node --test this-file.
// No writes, no implicit network fixture refresh and no synthetic "real" claims.
test('public runtime capture integration (network, opt-in; records source URLs and SHA-256)', {
  skip: process.env.PROPERTY_CAPTURE_ANALYTICS_LIVE !== '1', timeout: 60000,
}, async t => {
  const origin = 'https://www.prosperitysmp.com';
  async function get(path, limit) {
    const url = origin + path;
    const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(15000)});
    assert.equal(response.status, 200, url);
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw Error('Public fixture exceeds byte budget'); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks), sha256 = createHash('sha256').update(bytes).digest('hex');
    return {url, sha256, data: JSON.parse(bytes)};
  }
  const manifest = await get('/property-runtime/current.json', 2000000);
  const catalog = validateCatalog(manifest.data.catalog);
  t.diagnostic(JSON.stringify({manifestUrl: manifest.url, sha256: manifest.sha256, publishedAt: manifest.data.publishedAt}));
  for (const id of ['world:c001', 'world:r009', 'world:apt_01']) {
    const property = catalog.properties.find(p => p.id === id);
    assert(property);
    assert.match(property.preview.url, /^\/property-runtime\/assets\/[a-f0-9]{64}\.json$/);
    const fetched = await get(property.preview.url, 6000000);
    assert.equal(fetched.sha256, property.preview.url.split('/').at(-1).slice(0, -5));
    const r = analyzeCapture(property, fetched.data, manifest.data.worth, {now: Date.parse(manifest.data.publishedAt)});
    conservation(r, fetched.data, manifest.data.worth);
    assert.equal(r.valuation.knownSubtotalCents, manifest.data.materialValues[id].knownSubtotalCents);
    assert.equal(r.valuation.unknownCells, manifest.data.materialValues[id].unknownCells);
    t.diagnostic(JSON.stringify({propertyId: id, url: fetched.url, sha256: fetched.sha256,
      cells: r.occupancy.occupiedCells, standingSpaceCandidateCells: r.standingSpaceCandidates.cells,
      knownSubtotalCents: r.valuation.knownSubtotalCents, oreCells: r.flags.oreOrStorage.oreCells}));
  }
});
