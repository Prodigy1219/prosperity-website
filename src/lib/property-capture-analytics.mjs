import {validateBlockCapture, estimateBlockWorth} from './property-build.mjs';
import {area} from './property-core.mjs';

// Finite material allowlists, not suffix guesses or evidence of who placed a block.
export const CAPTURE_CLASSIFIER_VERSION = 'observable-materials-v1';
const names = text => text.split(/\s+/).filter(Boolean);
const woods = names('oak spruce birch jungle acacia dark_oak mangrove cherry pale_oak bamboo crimson warped');
const colors = names('white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black');
const families = (prefixes, suffixes) => prefixes.flatMap(p => suffixes.map(s => `${p}_${s}`));
const terrain = new Set(names(`stone granite diorite andesite deepslate tuff calcite bedrock dirt
  grass_block coarse_dirt rooted_dirt podzol mycelium mud clay gravel sand red_sand sandstone
  red_sandstone terracotta netherrack end_stone blackstone basalt smooth_basalt obsidian
  crying_obsidian soul_sand soul_soil snow snow_block ice packed_ice blue_ice frosted_ice
  powder_snow magma_block dripstone_block pointed_dripstone amethyst_block budding_amethyst
  small_amethyst_bud medium_amethyst_bud large_amethyst_bud amethyst_cluster moss_block
  pale_moss_block moss_carpet pale_moss_carpet sculk sculk_vein sculk_catalyst sculk_sensor
  sculk_shrieker farmland dirt_path`));
const ore = new Set([...families(names('coal iron copper gold redstone emerald lapis diamond'), ['ore']),
  ...families(names('coal iron copper gold redstone emerald lapis diamond').map(n => `deepslate_${n}`), ['ore']),
  ...names('nether_gold_ore nether_quartz_ore ancient_debris')]);
const storage = new Set(names(`coal_block iron_block copper_block gold_block redstone_block
  emerald_block lapis_block diamond_block netherite_block raw_iron_block raw_copper_block raw_gold_block`));
const vegetation = new Set([...families(woods, ['log', 'wood', 'leaves', 'sapling']), ...names(`
  crimson_stem warped_stem crimson_hyphae warped_hyphae mangrove_roots muddy_mangrove_roots
  mangrove_propagule bamboo bamboo_sapling short_grass tall_grass fern large_fern dead_bush
  bush short_dry_grass tall_dry_grass firefly_bush cactus sugar_cane vine glow_lichen leaf_litter
  seagrass tall_seagrass kelp kelp_plant lily_pad wheat carrots potatoes beetroots cocoa
  melon pumpkin melon_stem pumpkin_stem attached_melon_stem attached_pumpkin_stem sweet_berry_bush
  cave_vines cave_vines_plant twisting_vines twisting_vines_plant weeping_vines weeping_vines_plant
  dandelion poppy blue_orchid allium azure_bluet oxeye_daisy cornflower lily_of_the_valley
  sunflower lilac rose_bush peony orange_tulip pink_tulip red_tulip white_tulip wither_rose
  torchflower torchflower_crop pitcher_plant pitcher_crop pink_petals wildflowers cactus_flower
  open_eyeblossom closed_eyeblossom golden_dandelion brown_mushroom red_mushroom mushroom_stem
  brown_mushroom_block red_mushroom_block crimson_fungus warped_fungus crimson_roots warped_roots
  nether_sprouts nether_wart nether_wart_block warped_wart_block azalea flowering_azalea
  azalea_leaves flowering_azalea_leaves big_dripleaf big_dripleaf_stem small_dripleaf hanging_roots
  spore_blossom sea_pickle chorus_plant chorus_flower bee_nest`),
  ...families(names('tube brain bubble fire horn dead_tube dead_brain dead_bubble dead_fire dead_horn'),
    ['coral', 'coral_block', 'coral_fan', 'coral_wall_fan'])]);
const masonry = names(`stone cobblestone mossy_cobblestone stone_brick mossy_stone_brick granite
  polished_granite diorite polished_diorite andesite polished_andesite cobbled_deepslate
  polished_deepslate deepslate_brick deepslate_tile tuff polished_tuff tuff_brick brick mud_brick
  sandstone smooth_sandstone cut_sandstone red_sandstone smooth_red_sandstone cut_red_sandstone
  prismarine prismarine_brick dark_prismarine nether_brick red_nether_brick blackstone
  polished_blackstone polished_blackstone_brick end_stone_brick purpur quartz smooth_quartz resin_brick`);
const copper = families(names('cut exposed_cut weathered_cut oxidized_cut waxed_cut waxed_exposed_cut waxed_weathered_cut waxed_oxidized_cut'), ['copper']);
const constructionFull = new Set([...families(woods, ['planks']),
  ...families(woods.map(w => `stripped_${w}`), ['log', 'wood']),
  ...families(colors, ['concrete', 'wool', 'stained_glass', 'glazed_terracotta']),
  ...families(colors, ['terracotta']), ...copper, ...names(`
  cobblestone mossy_cobblestone smooth_stone stone_bricks mossy_stone_bricks cracked_stone_bricks
  chiseled_stone_bricks polished_granite polished_diorite polished_andesite cobbled_deepslate
  polished_deepslate deepslate_bricks cracked_deepslate_bricks deepslate_tiles cracked_deepslate_tiles
  chiseled_deepslate polished_tuff tuff_bricks chiseled_tuff chiseled_tuff_bricks bricks mud_bricks
  packed_mud smooth_sandstone cut_sandstone chiseled_sandstone smooth_red_sandstone cut_red_sandstone
  chiseled_red_sandstone prismarine prismarine_bricks dark_prismarine nether_bricks red_nether_bricks
  cracked_nether_bricks chiseled_nether_bricks polished_blackstone polished_blackstone_bricks
  cracked_polished_blackstone_bricks chiseled_polished_blackstone end_stone_bricks purpur_block
  purpur_pillar quartz_block quartz_bricks quartz_pillar chiseled_quartz_block smooth_quartz glass
  tinted_glass bamboo_block stripped_bamboo_block bamboo_mosaic stripped_crimson_stem
  stripped_warped_stem stripped_crimson_hyphae stripped_warped_hyphae resin_bricks chiseled_resin_bricks`)]);
const construction = new Set([...constructionFull, ...families(masonry, ['slab', 'stairs', 'wall']),
  ...families(woods, ['slab', 'stairs', 'fence', 'fence_gate']), ...families(copper, ['slab', 'stairs']),
  ...families(colors, ['carpet', 'stained_glass_pane', 'concrete_powder']),
  ...names('glass_pane iron_bars chain ladder scaffolding smooth_stone_slab bamboo_mosaic_slab bamboo_mosaic_stairs')]);
const containers = new Set([...names('chest trapped_chest ender_chest barrel hopper dispenser dropper shulker_box'),
  ...families(colors, ['shulker_box'])]);
const custom = new Set(names('note_block player_head player_wall_head'));
const fixtures = new Set([...containers, ...custom, ...families(woods, [
  'door', 'trapdoor', 'button', 'pressure_plate', 'sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign']),
  ...families(colors, ['bed', 'banner', 'wall_banner', 'candle', 'candle_cake']), ...names(`
  iron_door iron_trapdoor stone_button polished_blackstone_button stone_pressure_plate
  polished_blackstone_pressure_plate light_weighted_pressure_plate heavy_weighted_pressure_plate
  crafting_table furnace blast_furnace smoker cartography_table smithing_table fletching_table
  loom grindstone stonecutter anvil chipped_anvil damaged_anvil enchanting_table bookshelf
  chiseled_bookshelf lectern brewing_stand cauldron water_cauldron lava_cauldron powder_snow_cauldron
  beacon conduit respawn_anchor lodestone end_portal_frame bell jukebox flower_pot decorated_pot
  torch wall_torch soul_torch soul_wall_torch copper_torch copper_wall_torch lantern soul_lantern
  sea_lantern glowstone shroomlight redstone_lamp candle candle_cake cake campfire soul_campfire
  redstone_wire redstone_torch redstone_wall_torch repeater comparator lever tripwire tripwire_hook
  daylight_detector target piston sticky_piston piston_head moving_piston observer rail
  powered_rail detector_rail activator_rail lightning_rod beehive carved_pumpkin jack_o_lantern
  skeleton_skull skeleton_wall_skull wither_skeleton_skull wither_skeleton_wall_skull
  zombie_head zombie_wall_head creeper_head creeper_wall_head dragon_head dragon_wall_head
  piglin_head piglin_wall_head tnt`), ...[...vegetation].map(n => `potted_${n}`)]);
const fluids = new Set(names('water lava bubble_column'));
const air = new Set(names('air cave_air void_air'));
// Partial, falling, hazardous, custom and state-dependent collision shapes are excluded.
const fullSolid = new Set([...constructionFull, ...ore, ...storage, ...names(`
  stone granite diorite andesite deepslate tuff calcite bedrock dirt grass_block coarse_dirt
  rooted_dirt podzol mycelium clay sandstone red_sandstone terracotta netherrack end_stone
  blackstone basalt smooth_basalt obsidian crying_obsidian snow_block packed_ice blue_ice
  dripstone_block amethyst_block moss_block pale_moss_block`)]);
const categoryIds = ['manufactured-construction', 'fixtures', 'natural-or-terrain',
  'ore-or-storage', 'vegetation', 'fluid', 'unclassified'];
function classify(name) {
  if (ore.has(name) || storage.has(name)) return 'ore-or-storage';
  if (terrain.has(name)) return 'natural-or-terrain';
  if (construction.has(name)) return 'manufactured-construction';
  if (fixtures.has(name)) return 'fixtures';
  if (vegetation.has(name)) return 'vegetation';
  if (fluids.has(name)) return 'fluid';
  return 'unclassified';
}
function isFullSolid(p) {
  const name = p.material.slice(10);
  return fullSolid.has(name) && Object.entries(p.state).every(([key, value]) => {
    if (key === 'axis') return ['x', 'y', 'z'].includes(value);
    if (key === 'waterlogged') return value === 'false';
    if (key === 'snowy' && ['grass_block', 'podzol', 'mycelium'].includes(name)) return ['true', 'false'].includes(value);
    if (key === 'lit' && ['redstone_ore', 'deepslate_redstone_ore'].includes(name)) return ['true', 'false'].includes(value);
    return false;
  });
}
const coordinate = n => Number.isSafeInteger(n) && Math.abs(n) <= 30000000;
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const onSegment = (a, b, p) => cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
function intersects(a, b, c, d) {
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b) ||
    Math.sign(cross(a, b, c)) * Math.sign(cross(a, b, d)) < 0 &&
    Math.sign(cross(c, d, a)) * Math.sign(cross(c, d, b)) < 0;
}

function bindGeometry(property, capture) {
  if (!property || property.id !== capture.propertyId || property.id !== `${property.worldId}:${property.region}`)
    throw Error('Capture property identity mismatch');
  const g = property.geometry;
  if (!g || !Array.isArray(g.points) || g.points.length < 3 || g.points.length > 256 ||
      g.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(coordinate)) ||
      !coordinate(g.minY) || !coordinate(g.maxY) || g.minY > g.maxY)
    throw Error('Invalid capture property geometry');
  if (property.preview && property.preview.capturedAt !== capture.capturedAt)
    throw Error('Capture preview timestamp mismatch');
  const points = g.points.map(p => [...p]);
  if (points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  // The normalizer emits four exclusive corners for cuboids; native poly2d rings
  // retain their inclusive integer vertices (including an optional closing point).
  const rectangle = g.points.length === 4 && points.length === 4 &&
    new Set(xs).size === 2 && new Set(zs).size === 2;
  const size = [maxX - minX + (rectangle ? 0 : 1), g.maxY - g.minY + 1, maxZ - minZ + (rectangle ? 0 : 1)];
  if (points.length < 3 || size.some((n, i) => n !== capture.size[i]) ||
      [minX, g.minY, minZ].some((n, i) => n !== capture.origin[i]))
    throw Error('Capture does not match full property bounds');
  let polygonSelfIntersects = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) throw Error('Degenerate property polygon');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) polygonSelfIntersects = true;
    }
  }
  const regionArea = area(property);
  if (rectangle && polygonSelfIntersects || !(regionArea > 0)) throw Error('Degenerate or self-intersecting property cuboid');
  // Scan at most 512 rows of <=256 edges, not the up-to-2m-cell capture volume.
  // Inclusive integer intervals let us count polygon columns without filling air.
  const scanlines = [];
  let plotColumns = 0;
  for (let z = minZ; z < minZ + size[2]; z++) {
    let ranges = [];
    if (rectangle) ranges = [[minX, maxX - 1]];
    else {
      const crossings = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (a[1] === z) ranges.push([a[0], a[0]]);
        if (a[1] === b[1]) {
          if (a[1] === z) ranges.push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
        } else if ((a[1] <= z && z < b[1]) || (b[1] <= z && z < a[1])) {
          crossings.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i < crossings.length; i += 2)
        ranges.push([Math.ceil(crossings[i]), Math.floor(crossings[i + 1])]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of ranges) {
      if (start > end) continue;
      const last = merged.at(-1);
      if (last && start <= last[1] + 1) last[1] = Math.max(end, last[1]);
      else merged.push([start, end]);
    }
    for (const [start, end] of merged) plotColumns += end - start + 1;
    scanlines.push(merged);
  }
  return {regionArea, plotColumns, scanlines, polygonSelfIntersects,
    basis: rectangle ? 'catalog-exclusive-cuboid' : 'catalog-inclusive-integer-polygon'};
}
function containsColumn(ranges, x) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, [start, end] = ranges[mid];
    if (x < start) hi = mid - 1;
    else if (x > end) lo = mid + 1;
    else return true;
  }
  return false;
}

function boundedWorth(worth) {
  if (worth?.schemaVersion !== 1 || worth.policy !== 'paid-paste-state-BOM-at-worth-v1' ||
      !/^[a-f0-9]{64}$/.test(worth.rulesHash) || typeof worth.prices?.observedAt !== 'string' ||
      !Number.isFinite(Date.parse(worth.prices.observedAt)) ||
      !/^[a-f0-9]{64}$/.test(worth.prices?.sourceHash)) throw Error('Unverified analytics worth');
  const project = (raw, limit, valid) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid analytics worth table');
    const entries = Object.entries(raw);
    if (entries.length > limit || entries.some(([k, v]) => !valid(k, v))) throw Error('Analytics worth budget or entry invalid');
    return Object.fromEntries(entries);
  };
  const rule = (k, v) => /^[A-Z0-9_]{1,100}$/.test(k) && typeof v === 'string' && v.length <= 256;
  return {schemaVersion: 1, policy: worth.policy, rulesHash: worth.rulesHash,
    rules: {bmap: project(worth.rules?.bmap, 3000, rule), statemul: project(worth.rules?.statemul, 3000, rule)},
    prices: {observedAt: worth.prices.observedAt, sourceHash: worth.prices.sourceHash,
      unitMicros: project(worth.prices.unitMicros, 10000, (k, v) => /^minecraft:[a-z0-9_]{1,80}$/.test(k) &&
        (v === null || Number.isSafeInteger(v) && v >= 0 && v <= 1e12))}};
}
function allocateCents(categories, totalCents) {
  for (const row of categories) row.valueCents = Math.floor(row.valueMicros / 10000);
  const remaining = totalCents - categories.reduce((sum, r) => sum + r.valueCents, 0);
  // Largest-remainder allocation, with the fixed category order breaking ties.
  const order = categories.map((r, index) => ({r, index})).sort((a, b) =>
    b.r.valueMicros % 10000 - a.r.valueMicros % 10000 || a.index - b.index);
  for (let i = 0; i < remaining; i++) order[i].r.valueCents++;
}

/** Pure, display-only observations. `worth` is the snapshot, not a precomputed
 * estimate. `now` is optional epoch milliseconds; omission means no age claim.
 * Throws on invalid/unbound input. No clock, I/O, NBT projection or price premium.
 * Cell work is O(n) with fixed palette/geometry ceilings; no air-volume flood fill.
 */
export function analyzeCapture(property, rawCapture, worth, {now = null} = {}) {
  if (now !== null && (!Number.isSafeInteger(now) || Math.abs(now) > 8640000000000000))
    throw Error('Invalid explicit analytics clock');
  const capture = validateBlockCapture(rawCapture);
  const bound = bindGeometry(property, capture), snapshot = boundedWorth(worth);
  const [sx, sy, sz] = capture.size, [ox, oy, oz] = capture.origin;
  const key = (x, y, z) => (y * sz + z) * sx + x;
  const palette = capture.palette.map(p => ({name: p.material.slice(10),
    occupied: !air.has(p.material.slice(10)), fullSolid: isFullSolid(p)}));
  const cells = new Map(), columns = new Map();
  const levels = Array.from({length: sy}, (_, y) => ({y: oy + y, occupiedCells: 0,
    fullSolidCells: 0, standingSpaceCandidateCells: 0}));
  const boundary = {minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0};
  let minY = Infinity, maxY = -Infinity, occupiedCells = 0, fullSolidCells = 0;
  let occupiedMinX = Infinity, occupiedMaxX = -Infinity, occupiedMinZ = Infinity, occupiedMaxZ = -Infinity;
  let customIdentityCells = 0, containerCells = 0, waterloggedCells = 0, oreCells = 0, storageCells = 0;
  let captureBoundaryCells = 0, plotBoundaryCells = 0, occupiedColumns = 0;
  const inPlot = (x, z) => z >= 0 && z < sz && containsColumn(bound.scanlines[z], x + ox);
  for (const [x, y, z, index] of capture.blocks) {
    const column = z * sx + x;
    if (!columns.has(column)) {
      if (!inPlot(x, z)) throw Error('Captured cell outside property polygon');
      // Bit 1: horizontal plot boundary; bit 2: an occupied cell was observed.
      columns.set(column, Number(!inPlot(x - 1, z) || !inPlot(x + 1, z) || !inPlot(x, z - 1) || !inPlot(x, z + 1)));
    }
    const p = palette[index];
    if (!p.occupied) continue;
    cells.set(key(x, y, z), index);
    const columnFlags = columns.get(column);
    if (!(columnFlags & 2)) { occupiedColumns++; columns.set(column, columnFlags | 2); }
    if (columnFlags & 1) plotBoundaryCells++;
    occupiedCells++; levels[y].occupiedCells++;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    occupiedMinX = Math.min(occupiedMinX, x); occupiedMaxX = Math.max(occupiedMaxX, x);
    occupiedMinZ = Math.min(occupiedMinZ, z); occupiedMaxZ = Math.max(occupiedMaxZ, z);
    if (p.fullSolid) { fullSolidCells++; levels[y].fullSolidCells++; }
    if (custom.has(p.name)) customIdentityCells++;
    if (containers.has(p.name)) containerCells++;
    if (ore.has(p.name)) oreCells++;
    if (storage.has(p.name)) storageCells++;
    if (capture.palette[index].state.waterlogged === 'true') waterloggedCells++;
    if (x === 0) boundary.minX++; if (x === sx - 1) boundary.maxX++;
    if (y === 0) boundary.minY++; if (y === sy - 1) boundary.maxY++;
    if (z === 0) boundary.minZ++; if (z === sz - 1) boundary.maxZ++;
    if (x === 0 || x === sx - 1 || y === 0 || y === sy - 1 || z === 0 || z === sz - 1) captureBoundaryCells++;
  }
  const solidAt = (x, y, z) => x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz &&
    palette[cells.get(key(x, y, z))]?.fullSolid === true;
  let candidateCells = 0, blockedAboveCells = 0, ceilingLimitedCells = 0, enclosedOreOrStorageCells = 0;
  for (const [x, y, z, index] of capture.blocks) {
    const p = palette[index];
    if ((ore.has(p.name) || storage.has(p.name)) && solidAt(x - 1, y, z) && solidAt(x + 1, y, z) &&
        solidAt(x, y - 1, z) && solidAt(x, y + 1, z) && solidAt(x, y, z - 1) && solidAt(x, y, z + 1))
      enclosedOreOrStorageCells++;
    if (!p.fullSolid) continue;
    if (y + 2 >= sy) { ceilingLimitedCells++; continue; }
    if (cells.has(key(x, y + 1, z)) || cells.has(key(x, y + 2, z))) { blockedAboveCells++; continue; }
    candidateCells++; levels[y].standingSpaceCandidateCells++;
  }
  const estimate = estimateBlockWorth(capture, snapshot);
  const categories = categoryIds.map(id => ({id, cells: 0, occupiedCells: 0, unknownCells: 0,
    valueMicros: 0, valueCents: 0}));
  const byCategory = new Map(categories.map(r => [r.id, r]));
  const materials = estimate.rows.map(row => {
    const name = row.material.slice(10), category = classify(name), target = byCategory.get(category);
    const occupied = air.has(name) ? 0 : row.cells;
    target.cells += row.cells; target.occupiedCells += occupied;
    target.unknownCells += row.unknownCells; target.valueMicros += row.valueMicros;
    return {...row, occupiedCells: occupied, category};
  });
  const knownValueMicros = categories.reduce((sum, r) => sum + r.valueMicros, 0);
  allocateCents(categories, estimate.knownSubtotalCents);
  const captureVolume = sx * sy * sz, plotVolume = bound.plotColumns * sy;
  const unclassifiedCells = byCategory.get('unclassified').occupiedCells;
  const ageMs = now === null ? null : now - Date.parse(capture.capturedAt);
  const rPlot = /^r\d+$/.test(property.region);
  return {
    version: 1, classifierVersion: CAPTURE_CLASSIFIER_VERSION, propertyId: capture.propertyId,
    provenance: {source: capture.source, capturedAt: capture.capturedAt, now, ageMs,
      worthObservedAt: snapshot.prices.observedAt, worthSourceHash: snapshot.prices.sourceHash,
      worthRulesHash: snapshot.rulesHash},
    geometry: {binding: bound.basis, nativeMaskVerified: false, polygonSelfIntersects: bound.polygonSelfIntersects,
      origin: [...capture.origin], size: [...capture.size],
      footprint: {regionArea: bound.regionArea, captureBoundingColumns: sx * sz, plotColumns: bound.plotColumns,
        occupiedColumns, occupiedColumnRatio: occupiedColumns / bound.plotColumns},
      occupiedYSpan: occupiedCells ? {minY: oy + minY, maxY: oy + maxY, height: maxY - minY + 1} : null,
      occupiedHorizontalBounds: occupiedCells ? {minX: ox + occupiedMinX, maxX: ox + occupiedMaxX,
        minZ: oz + occupiedMinZ, maxZ: oz + occupiedMaxZ} : null},
    occupancy: {capturedCells: capture.blocks.length, explicitAirCells: capture.blocks.length - occupiedCells,
      occupiedCells, fullSolidCells, captureVolume, plotVolume, outsidePlotVolume: captureVolume - plotVolume,
      clearCells: plotVolume - occupiedCells, occupiedRatio: occupiedCells / plotVolume},
    levels,
    standingSpaceCandidates: {cells: candidateCells, area: candidateCells, fullSolidCells,
      blockedAboveCells, ceilingLimitedCells, usableFloorArea: null, accessibleArea: null,
      basis: 'Explicit full-solid allowlist with two non-occupied cells above inside capture and plot; no room, floor or path certification.'},
    materials, categories,
    valuation: {policy: estimate.policy, knownValueMicros, knownSubtotalCents: estimate.knownSubtotalCents,
      totalCents: estimate.totalCents, unknownCells: estimate.unknownCells, pricedCells: estimate.pricedCells,
      skippedCells: estimate.skippedCells, complete: estimate.totalCents !== null,
      centsAllocation: 'largest-remainder; fixed category order breaks ties; total rounded once',
      quantityBasis: 'Capture cells are not item quantities. Values use estimateBlockWorth state-BOM rows, including mapped components and both occupied halves.',
      itemQuantities: null},
    flags: {
      clipping: {possible: captureBoundaryCells > 0 || plotBoundaryCells > 0, captureBoundaryCells, plotBoundaryCells, boundary,
        ceilingLimitedCells, thinVerticalSlice: sy < 3, actualClippingVerified: false},
      unknown: {valuationCells: estimate.unknownCells, unclassifiedCells},
      customIdentity: {unresolvedCells: customIdentityCells, nbtInspected: false},
      terrainAmbiguity: {cells: byCategory.get('natural-or-terrain').cells, placementKnown: false},
      oreOrStorage: {oreCells, storageCells, rPlot, rPlotOreContaminationReview: rPlot && oreCells > 0,
        originOrIntentKnown: false},
      hiddenStockpile: {assessed: false, sixSolidNeighborEnclosedOreOrStorageCells: enclosedOreOrStorageCells,
        containerCells, inventoryContentsObserved: false},
      waterloggedCells,
      futureCapture: ageMs !== null && ageMs < 0,
      futureWorth: now !== null && Date.parse(snapshot.prices.observedAt) > now,
    },
    limitations: [
      'Terrain cannot be separated definitively from player-placed stone by material; category names describe materials, not placement provenance.',
      'Manufactured materials can occur in generated structures; these counts do not certify construction, architectural quality or beauty.',
      'Standing-space candidates are horizontal local observations, not usable rooms, certified floors, headroom for every entity, or path accessibility.',
      'Missing entries are treated as clear only under the full blocks-only capture contract; an incomplete export cannot be detected from omitted air alone.',
      'Geometry is bound to the catalog, but no native WG mask or authenticated artifact hash is present in this API. Boundary contact is not proof of clipping.',
      'Polygon columns use even-odd membership including integer boundaries. Self-intersecting catalog rings are flagged; footprint regionArea remains the catalog shoelace area, not a usable-area measure.',
      'Enclosed ore/storage and r-plot ores warrant contextual review, not an assumption of hidden stockpiles, player placement or fraud. Container inventories and NBT are not observed.',
      'Known values retain terrain and ore/storage without discounts or premiums. Unknown portions remain unvalued; this is not land, sale, salvage or recoverable-item value.',
    ],
  };
}
