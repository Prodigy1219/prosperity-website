import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeProperty, distanceToPolygon} from '../src/lib/property-appraisal.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../src/data/property-catalog.json', import.meta.url)));
const now = '2026-09-06T23:00:00Z', p = catalog.properties.find(p => p.region === 'c001');
const spawn = {worldId: 'world', position: [518, 74, -151], verified: true, public: true, version: 'native-spawn-v1', source: 'Public native world spawn verification', observedAt: '2026-09-06T20:00:00Z'};
const options = () => ({now, spawns: [structuredClone(spawn)]});

test('real 53-property catalog exposes honest scoped supply and observed spawn distance', () => {
  const facts = analyzeProperty(p, catalog, options());
  assert.equal(catalog.properties.length, 53);
  assert.deepEqual(facts.supply.worldTenure, {total: 16, available: 3, owned: 13, leased: 0, unknown: 0});
  assert.equal(facts.supply.total, 7); assert.equal(facts.supply.available, 0);
  assert.equal(facts.spawn.status, 'observed');
  assert.equal(facts.spawn.distanceBlocks, Math.hypot(518 - 434, -151 + 138));
  assert.equal(facts.spawn.method, '2d-straight-line-to-footprint');
  assert.equal(facts.snapshot.status, 'stale', 'old saved state never claims current availability');
});
test('real rental unknown availability stays separate from vacancies', () => {
  const unit = catalog.properties.find(p => p.region === 'c006-sub1');
  const f = analyzeProperty(unit, catalog, {now});
  assert.equal(f.supply.total, 4); assert.equal(f.supply.unknown, 4); assert.equal(f.supply.available, 0);
  assert.match(f.originalAssessment.reason, /Rental-period charge/);
});
test('same-world supply and histories exclude another world even at identical coordinates', () => {
  const c = structuredClone(catalog), other = structuredClone(c.properties.find(v => v.region === 'c003'));
  other.worldId = other.world = 'resource_world'; other.id = 'resource_world:c003'; other.status = 'available'; c.properties.push(other);
  const f = analyzeProperty(p, c, {now});
  assert.equal(f.supply.total, 7); assert.equal(f.supply.worldTenure.total, 16); assert.equal(f.supply.worldTenure.available, 3);
  assert.equal(f.comps.recordedPurchaseCount, 4);
});
test('altered or stale selected parcel cannot override the authoritative catalog record', () => {
  const altered = {...p, priceCents: 1, kind: 'forged', geometry: {...p.geometry, points: [[500,-200],[600,-200],[600,-100],[500,-100]]}};
  const expected = analyzeProperty(p, catalog, options());
  assert.deepEqual(analyzeProperty(altered, catalog, options()), expected);
  assert.throws(() => analyzeProperty({...p, id:'world:missing'}, catalog, options()), /absent/);
});
test('old spawn input remains explicitly historical, never current or verified', () => {
  const f = analyzeProperty(p, catalog, {now, spawns: [{...spawn, observedAt:'2000-01-01T00:00:00Z'}]});
  assert.equal(f.spawn.status, 'observed');
  assert.equal(f.spawn.observedAt, '2000-01-01T00:00:00Z');
  assert.match(f.spawn.reason, /not a guarantee of the current spawn/);
});
test('four real date-only purchases retain exact amounts/sources but no comparable eligibility', () => {
  const f = analyzeProperty(p, catalog, {now});
  assert.equal(f.comps.recordedPurchaseCount, 4); assert.equal(f.comps.sameKindPurchaseCount, 3);
  assert.equal(f.comps.eligibleCount, 0); assert.equal(f.comps.status, 'insufficient');
  assert.deepEqual(f.comps.records.map(h => h.amountCents), [1142400, 1075200, 1478400, 1500000]);
  assert.ok(f.comps.records.every(h => h.exclusionReason === 'date-only-record' && h.source === 'Console wallet-delta backfill; date only, incomplete'));
});
test('concave footprint uses the actual boundary, not bounding rectangle or centroid', () => {
  // Geometry-only adversarial fixture: L-shaped footprint with an empty upper-right notch.
  const polygon = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];
  assert.equal(distanceToPolygon([5, 5], polygon), 3);
  assert.equal(distanceToPolygon([1, 8], polygon), 0);
  assert.equal(distanceToPolygon([2, 5], polygon), 0);
  assert.equal(distanceToPolygon([12, -2], polygon), Math.sqrt(8));
  assert.equal(distanceToPolygon([5, 5], polygon.toReversed()), 3);
  assert.throws(() => distanceToPolygon([0, 0], [[0, 0], [1, 0], [2, 0]]), /Degenerate/);
});
test('spawn ignores height but never crosses worlds or accepts conflicting records', () => {
  const a = options(), b = options(); b.spawns[0].position[1] = -50;
  assert.equal(analyzeProperty(p, catalog, a).spawn.distanceBlocks, analyzeProperty(p, catalog, b).spawn.distanceBlocks);
  b.spawns[0].worldId = 'resource_world'; assert.equal(analyzeProperty(p, catalog, b).spawn.status, 'unknown');
  a.spawns.push({...spawn}); assert.equal(analyzeProperty(p, catalog, a).spawn.status, 'unknown');
});
test('invalid, private and future spawn observations fail closed', () => {
  for (const patch of [{observedAt: '2026-09-07T00:00:00Z'}, {observedAt: '2026-02-30T00:00:00Z'}, {observedAt: '2026-09-06T24:00:00Z'}, {observedAt: '2026-09-06T20:00:00'}, {verified: false}, {public: false}, {source: ''}, {position: [NaN, 74, -151]}]) {
    assert.equal(analyzeProperty(p, catalog, {now, spawns: [{...spawn, ...patch}]}).spawn.status, 'unknown');
  }
});
test('future listing observations are explicitly unknown, not current supply evidence', () => {
  const c = structuredClone(catalog); c.observedAt = '2026-09-07T00:00:00Z'; c.expiresAt = '2026-09-08T00:00:00Z';
  const f = analyzeProperty(p, c, {now}); assert.equal(f.supply.status, 'unknown'); assert.equal(f.snapshot.status, 'unknown');
});
test('no roads means unknown; reviewed corner proximity is not fabricated frontage', () => {
  assert.equal(analyzeProperty(p, catalog, {now, roads: []}).road.status, 'unknown');
  const roads = {verified: true, public: true, version: 'reviewed-v1', source: 'Reviewed public road registry', reviewedAt: '2026-09-06T20:00:00Z',
    segments: [{worldId: 'world', public: true, kind: 'main', points: [[434, -138], [440, -144]]}]};
  const f = analyzeProperty(p, catalog, {now, roads});
  assert.equal(f.road.reviewedSegmentCount, 1); assert.equal(f.road.status, 'unknown'); assert.equal(f.road.frontageBlocks, null);
  roads.reviewedAt = '2026-09-07T00:00:00Z'; assert.equal(analyzeProperty(p, catalog, {now, roads}).road.reviewedSegmentCount, 0);
});
test('quality requires a verified public review bound to the exact capture and correct time', () => {
  const review = {propertyId: p.id, snapshotHash: p.preview.url.split('/').pop().slice(0, 64), summary: 'Reviewed condition description', verified: true, public: true,
    version: 'quality-v1', source: 'Snapshot review record', reviewedAt: '2026-09-06T20:00:00Z'};
  assert.equal(analyzeProperty(p, catalog, {now}).quality.status, 'unknown');
  assert.equal(analyzeProperty(p, catalog, {now, qualityReviews: [review]}).quality.status, 'reviewed');
  for (const patch of [{snapshotHash: 'a'.repeat(64)}, {reviewedAt: '2026-09-07T00:00:00Z'}, {reviewedAt: '2026-09-06T17:00:00Z'}, {verified: false}, {public: false}]) {
    assert.equal(analyzeProperty(p, catalog, {now, qualityReviews: [{...review, ...patch}]}).quality.status, 'unknown');
  }
});
test('expensive blocks, asks, traffic counts and owner authorization cannot invent premiums', () => {
  const c = structuredClone(catalog), expensive = {...p, priceCents: 999999999, blockPalette: ['diamond_block'], materialWorthCents: 999999999};
  c.properties = c.properties.map(v => v.id === p.id ? expensive : v);
  const f = analyzeProperty(expensive, c, {now, traffic: {visits: 999999}, policy: {authorized: true, version: 'v1', source: 'Owner', scarcityCoefficient: 100}});
  assert.equal(f.originalAssessment.priceCents, expensive.priceCents); assert.equal(f.quality.status, 'unknown');
  assert.equal(f.traffic.status, 'unknown'); assert.equal(f.premiums.status, 'not-calibrated'); assert.equal(f.premiums.amountCents, null);
  assert.equal(f.comps.eligibleCount, 0); assert.equal(f.comps.recordedPurchaseCount, 4);
});
test('result is immutable and inputs remain byte-identical', () => {
  const before = JSON.stringify({p, catalog}), f = analyzeProperty(p, catalog, options());
  assert.throws(() => { f.originalAssessment.priceCents = 1; }, TypeError);
  assert.throws(() => { f.spawn.position[0] = 0; }, TypeError);
  assert.equal(JSON.stringify({p, catalog}), before);
});
test('expired leases become unknown, future sales stay excluded, duplicate history is counted once', () => {
  const c = structuredClone(catalog), apartment = c.properties.find(v => v.region === 'apt_01'); apartment.leaseEndsAt = '2026-09-06T00:00:00Z';
  const commercial = c.properties.find(v => v.region === 'c003');
  commercial.history.push({...commercial.history[0]}); commercial.history[0].at = '2026-09-07T00:00:00Z';
  const f = analyzeProperty(apartment, c, {now});
  assert.equal(f.supply.unknown, 1); assert.equal(f.comps.duplicateCount, 1);
  assert.equal(f.comps.records[0].exclusionReason, 'invalid-or-future-date');
});
