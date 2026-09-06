import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeInput, minor, seconds } from './property-normalize.mjs';
import { validateCatalog, filterProperties, weeklyCents, area, holdings, effectiveStatus, validatePreview, mapUrl } from '../src/lib/property-core.mjs';
const path = process.env.PROPERTY_INPUT_FIXTURE;
if (!path)
    throw Error('Set PROPERTY_INPUT_FIXTURE to the real sanitized capture');
const input = JSON.parse(readFileSync(path, 'utf8')), cat = normalizeInput(input), by = id => cat.properties.find(p => p.region === id);
test('real 53 ARM entries include all four sublets, unique IDs; no WG extras', () => { assert.equal(cat.properties.length, 53); assert.equal(new Set(cat.properties.map(p => p.id)).size, 53); assert.equal(cat.properties.filter(p => p.tags.includes('player-sublet')).length, 4); assert(!by('__global__')); });
test('named AutoPrice overrides all 33 false 1000ms rental durations', () => { const parents = cat.properties.filter(p => p.tenure === 'rent' && !p.tags.includes('player-sublet')); assert.equal(parents.length, 33); assert(parents.every(p => p.periodSeconds === 604800)); assert.equal(by('market_stall_01').priceCents, 50000); assert.equal(by('apt_01').priceCents, 20000); });
test('sublet five-day rate is not weekly or available', () => { const p = by('c006-sub3'); assert.equal(p.periodSeconds, 432000); assert.equal(p.priceCents, 149900); assert.equal(weeklyCents(p), 209860); assert.equal(p.status, 'unknown'); });
test('commercial assessment uses inclusive cuboid area, not polygon arithmetic', () => { const p = by('c001'); assert.equal(p.priceCents, 1209600); assert.equal(area(p), 378); assert.equal(p.status, 'owned'); });
test('unknown named plan and polygon per-m2 fail closed', () => { const x = structuredClone(input); x.properties = x.properties.filter(p => p.regionId === 'r005'); x.properties[0].arm.autoprice = 'missing'; assert.equal(normalizeInput(x).properties[0].priceCents, null); x.properties[0].arm.autoprice = 'commercial_m2'; assert.equal(normalizeInput(x).properties[0].status, 'unknown'); });
test('four recorded purchases, never assessment backfilled as sale', () => { assert.equal(cat.properties.reduce((s, p) => s + p.history.length, 0), 4); assert.equal(by('c007').history[0].amountCents, 1478400); assert.equal(by('c001').history.length, 0); });
test('money and time reject malformed, negative, nonfinite, excess precision', () => { for (const x of [NaN, Infinity, -5, '3.333', 'foo', '1e3'])
    assert.equal(minor(x), null); assert.equal(minor('0.01'), 1); assert.equal(seconds('7d'), 604800); assert.equal(seconds(432000000), 432000); assert.equal(seconds('tomorrow'), null); });
test('no source config, member, tenant, UUID or internal capture metadata leaks', () => { const s = JSON.stringify(cat); for (const k of ['unique-ids', 'SOURCES', 'rentalFlags', 'landlordNames', 'AutoPrice', 'memberIds'])
    assert(!s.includes(`"${k}"`)); assert.equal(holdings(cat.properties).length, 7); assert.equal(holdings(cat.properties).reduce((s, p) => s + p.owned.length, 0), 13); assert.equal(holdings(cat.properties).reduce((s, p) => s + p.leased.length, 0), 0); });
test('fresh capture does not refresh stale disk observation', () => { assert.equal(cat.observedAt, input.snapshotAsOf); assert.notEqual(cat.observedAt, input.capturedAt); assert(Date.parse(cat.expiresAt) < Date.parse(input.capturedAt)); });
test('rental expiry is unknown, not automatically vacant', () => { assert.equal(effectiveStatus({ ...by('apt_01'), leaseEndsAt: '2020-01-01T00:00:00Z' }, Date.now()), 'unknown'); });
test('filter rent weekly budget/search/world and deterministic mixed sort', () => { assert(filterProperties(cat.properties, { tenure: 'rent', maxCost: 25000 }).every(p => weeklyCents(p) <= 25000)); assert.equal(filterProperties(cat.properties, { world: 'resource_world' }).length, 0); assert.equal(filterProperties(cat.properties, { query: 'C001' })[0].region, 'c001'); assert.deepEqual(filterProperties([...cat.properties].reverse()).map(p => p.id), filterProperties(cat.properties).map(p => p.id)); });
test('validator rejects duplicate identity, external preview, zero price', () => { for (const mutate of [x => x.properties.push(x.properties[0]), x => x.properties[0].preview = { url: 'https://evil.example/a', capturedAt: cat.observedAt }, x => x.properties[0].priceCents = 0]) {
    const x = structuredClone(cat);
    mutate(x);
    assert.throws(() => validateCatalog(x));
} });
test('voxel preview bounded and typed; NBT is not part of format', () => { assert.deepEqual(validatePreview({ schemaVersion: 1, format: 'surface-voxels', blocks: [[0, 0, 0, '#abcdef']] }), [[0, 0, 0, '#abcdef']]); assert.throws(() => validatePreview({ schemaVersion: 1, format: 'surface-voxels', blocks: [[0, 0, 999999, '#abcdef']] })); assert.throws(() => validatePreview({ schemaVersion: 1, format: 'surface-voxels', blocks: [[0, 0, 0, 'url(evil)']] })); });
test('map link selects actual map; hidden worlds have no map link', () => { assert(mapUrl(by('c001')).startsWith('https://map.prosperitysmp.com/#world:')); assert.equal(mapUrl({ ...by('c001'), mapId: null }), null); });
test('history projection removes injected private fields (review regression)',()=>{const x=structuredClone(cat);x.properties.find(p=>p.history.length).history[0].inventory=['private'];x.properties.find(p=>p.history.length).history[0].members=['private'];const result=JSON.stringify(validateCatalog(x));assert(!result.includes('inventory'));assert(!result.includes('members'));});
