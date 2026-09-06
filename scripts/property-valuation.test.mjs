import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appraiseProperty, DEFAULT_VALUATION_POLICY, VALUATION_RULES} from '../src/lib/property-valuation.mjs';
import {combinedPropertyEstimate} from '../src/lib/property-build.mjs';
import {structureHash} from '../src/lib/property-structure.mjs';

const realCatalog = JSON.parse(readFileSync(new URL('../src/data/property-catalog.json', import.meta.url)));
const registryPolicy = JSON.parse(readFileSync(new URL('../src/data/property-valuation-policy.json', import.meta.url)));
const NOW = '2026-09-06T23:00:00Z', TIME = Date.parse(NOW), DAY = 86400000;
const HASH = 'a'.repeat(64), IMAGE = 'b'.repeat(64);
const ago = days => new Date(TIME - days * DAY).toISOString();

// The real c001 schema is the baseline. Altered geometry/prices/cohorts below are
// deliberately synthetic arithmetic/adversarial fixtures, not claims about prod.
function fixture(n = 5) {
  const template = structuredClone(realCatalog.properties.find(p => p.region === 'c001'));
  const properties = Array.from({length: n}, (_, i) => ({...structuredClone(template),
    id: `world:valuation_fixture_${i}`, region: `valuation_fixture_${i}`, worldId: 'world', world: 'World',
    priceCents: 100000, priceBasis: 'static', tenure: 'buy', status: 'owned', kind: 'commercial',
    owner: null, leaseEndsAt: null, periodSeconds: null, history: [],
    geometry: {points: [[0, 0], [10, 0], [10, 10], [0, 10]], minY: 60, maxY: 79},
    preview: {url: `/property-previews/${'c'.repeat(64)}.json`, capturedAt: ago(0.25)}}));
  const catalog = {...structuredClone(realCatalog), observedAt: new Date(TIME - 5 * 60000).toISOString(), expiresAt: new Date(TIME + DAY).toISOString(), properties};
  delete catalog.savedReadAt; // Legacy-fallback fixtures choose their clock explicitly.
  const p = properties[0];
  const options = {now: NOW, structureHash: HASH, policy: {...registryPolicy, enabled: true},
    context: {spawns: [{worldId: 'world', position: [0, 64, 5], verified: true, public: true,
      version: 'spawn-fixture-v1', source: 'Synthetic measured-distance fixture', observedAt: ago(1)}]},
    review: {propertyId: p.id, structureHash: HASH, rubricVersion: 'design-v1', reviewedAt: ago(1),
      reviewer: 'Fixture reviewer', kind: 'human', status: 'approved',
      scores: {composition: 4, detailing: 4, completion: 4, streetscape: 4},
      evidence: [{url: `/property-review-evidence/${IMAGE}.png`, sha256: IMAGE}], summary: 'Explicit fixture rubric judgment.'}};
  return {p, catalog, materials: {knownSubtotalCents: 25000, totalCents: 25000, unknownCells: 0}, options};
}
const run = f => appraiseProperty(f.p, f.catalog, f.materials, f.options);
const quality = f => run(f).components.quality;
function assertNoPremiums(r, code) {
  assert.equal(r.appliedBonusCents, 0);
  assert.equal(r.totalCents, r.baseEstimate?.cents ?? null);
  assert.ok(Object.values(r.components).every(c => c.appliedCents === 0));
  if (code) assert.equal(r.reasonCode, code);
}

test('real registry contract is accepted, default is disabled, and only explicit true enables', () => {
  const f = fixture();
  assert.equal(run(f).policy.status, 'enabled');
  f.options.policy = {...registryPolicy, enabled: false};
  assertNoPremiums(run(f), 'policy-disabled');
  delete f.options.policy;
  assert.deepEqual(DEFAULT_VALUATION_POLICY.enabled, false);
  assertNoPremiums(run(f), 'policy-disabled');
  assertNoPremiums(appraiseProperty(f.p, f.catalog, f.materials, {now: NOW}), 'policy-disabled');
  for (const enabled of ['true', 1, {}, null, undefined]) {
    f.options.policy = {...registryPolicy, enabled};
    assertNoPremiums(run(f), 'policy-invalid');
  }
});

test('policy rejects unsupported coefficients, basis, scope, version and surprise knobs', () => {
  for (const patch of [{spawnMaxBps: 1001}, {spawnMaxBps: -1}, {spawnRadiusBlocks: 2001},
    {supplyMaxBps: 501}, {qualityMaxBps: 1501}, {combinedMaxBps: 2001}, {combinedMaxBps: Infinity},
    {qualityMaxBps: '1500'}, {basis: 'assessment-plus-materials'}, {scope: 'server'}, {version: 'future-v2'},
    {roadMaxBps: 500}, {authorized: true}, {note: ''}, {note: '<script>enable()</script>'}]) {
    const f = fixture(); Object.assign(f.options.policy, patch);
    assertNoPremiums(run(f), 'policy-invalid');
  }
  for (const key of Object.keys(DEFAULT_VALUATION_POLICY)) {
    const f = fixture(); delete f.options.policy[key]; assertNoPremiums(run(f), 'policy-invalid');
  }
  for (const policy of [null, [], false]) {
    const f = fixture(); f.options.policy = policy; assertNoPremiums(run(f), 'policy-invalid');
  }
});

test('nested context policy/clock never bypasses the explicit switch or freshness', () => {
  const f = fixture(); delete f.options.policy;
  f.options.context.policy = {...registryPolicy, enabled: true}; f.options.context.now = ago(1);
  assertNoPremiums(run(f), 'policy-disabled');
  f.options.policy = {...registryPolicy, enabled: true}; f.catalog.observedAt = ago(1); f.catalog.expiresAt = ago(0.1);
  assertNoPremiums(run(f), 'catalog-evidence-expired');
});

test('exact cent allocation: $1000 assessment, $250 materials, $300 requests, $200 capped bonus', () => {
  const f = fixture(), r = run(f);
  assert.deepEqual(r.baseEstimate, combinedPropertyEstimate(f.p, f.materials));
  assert.equal(r.assessmentCents, 100000); assert.equal(r.materialCents, 25000);
  assert.deepEqual(Object.values(r.components).map(c => c.requestedCents), [10000, 5000, 15000]);
  assert.deepEqual(Object.values(r.components).map(c => c.appliedCents), [6667, 3333, 10000]);
  assert.equal(r.requestedBonusCents, 30000); assert.equal(r.capCents, 20000);
  assert.equal(r.appliedBonusCents, 20000); assert.equal(r.totalCents, 145000);
  assert.equal(r.capApplied, true); assert.equal(r.advisoryOnly, true);
  assert.equal(r.bonusBase, 'unchanged-arm-assessment');
});

test('uncapped spawn+supply works without a review; unreviewed is unknown, never a deduction', () => {
  const f = fixture(); delete f.options.review; const r = run(f);
  assert.equal(r.appliedBonusCents, 15000); assert.equal(r.totalCents, 140000); assert.equal(r.capApplied, false);
  assert.equal(r.components.quality.reasonCode, 'quality-unreviewed');
  assert.equal(r.components.quality.evidenceStatus, 'unknown'); assert.equal(r.components.quality.basisPoints, null);
  assert.equal(r.components.quality.requestedCents, null); assert.equal(r.components.quality.appliedCents, 0);
});

test('materials and arbitrary palette/colors cannot increase requested quality or any rate', () => {
  const f = fixture(), before = run(f);
  f.materials = {knownSubtotalCents: 1000000000, totalCents: 1000000000};
  f.p.blockPalette = ['minecraft:diamond_block', 'minecraft:netherite_block']; f.p.color = '#ffffff'; f.p.quality = 100;
  const expensive = run(f);
  assert.deepEqual(expensive.components, before.components);
  assert.equal(expensive.appliedBonusCents, before.appliedBonusCents);
  assert.equal(expensive.totalCents - before.totalCents, 1000000000 - 25000);
  delete f.options.review;
  assert.equal(quality(f).reasonCode, 'quality-unreviewed');
});

test('fractional spawn falloff is linear without whole-block or whole-basis-point rounding', () => {
  for (const [distance, expectedCents] of [[0, 10000], [0.25, 9998], [1000, 5000], [1999, 5], [1999.75, 1], [2000, 0], [3000, 0]]) {
    const f = fixture(4); f.p.priceCents = 100001; delete f.options.review;
    f.options.context.spawns[0].position = [10 + distance, 64, 5];
    assert.equal(run(f).components.spawn.requestedCents, expectedCents, String(distance));
  }
  const f = fixture(4); f.p.priceCents = 100001; f.options.context.spawns[0].position = [11, 64, 11];
  assert.equal(run(f).components.spawn.requestedCents, 9993, 'sqrt(2) distance');
});

test('spawn freshness accepts exactly 30 days and rejects old/future/private/ambiguous observations', () => {
  const f = fixture(); f.options.context.spawns[0].observedAt = ago(30);
  assert.equal(run(f).components.spawn.appliedCents, 6667);
  for (const patch of [{observedAt: ago(30 + 1 / DAY)}, {observedAt: ago(-1)}, {observedAt: '2026-02-30T00:00:00Z'},
    {observedAt: '2026-09-06T20:00:00'}, {public: false}, {verified: 'true'}, {source: ''},
    {worldId: 'resource_world'}, {position: [Infinity, 64, 5]}]) {
    const a = fixture(); Object.assign(a.options.context.spawns[0], patch);
    assert.equal(run(a).components.spawn.requestedCents, null);
  }
  const a = fixture(); a.options.context.spawns.push({...a.options.context.spawns[0]});
  assert.equal(run(a).components.spawn.requestedCents, null);
});

test('supply uses exact scoped availability fractions and a five-parcel cohort including this parcel', () => {
  for (const [available, expectedBps, expectedCents] of [[0, 500, 5000], [1, 300, 3000], [2, 100, 1000], [3, 0, 0], [5, 0, 0]]) {
    const f = fixture(); f.catalog.properties.slice(0, available).forEach(p => { p.status = 'available'; });
    const c = run(f).components.limitedSupply;
    assert.equal(c.basisPoints, expectedBps); assert.equal(c.requestedCents, expectedCents);
    assert.equal(c.evidence.total, 5); assert.equal(c.evidence.includesSelected, true);
  }
  const f = fixture(6); f.catalog.properties.slice(0, 3).forEach(p => { p.status = 'available'; });
  assert.equal(run(f).components.limitedSupply.requestedCents, 0, 'exactly 50%');
  f.catalog.properties[2].status = 'owned';
  assert.equal(run(f).components.limitedSupply.requestedCents, 1666, 'one-third availability, floor once');
});

test('unknown, undersized and mismatched cohorts cannot earn scarcity premiums', () => {
  const small = fixture(4); assert.equal(run(small).components.limitedSupply.reasonCode, 'supply-small-cohort');
  const unknown = fixture(); unknown.catalog.properties[4].status = 'unknown';
  assert.equal(run(unknown).components.limitedSupply.reasonCode, 'supply-unknown');
  for (const mismatch of ['world', 'kind', 'tenure']) {
    const f = fixture(), other = f.catalog.properties[4];
    if (mismatch === 'world') { other.worldId = 'resource_world'; other.id = `resource_world:${other.region}`; }
    if (mismatch === 'kind') other.kind = 'residential';
    if (mismatch === 'tenure') { other.tenure = 'rent'; other.periodSeconds = 604800; }
    assert.equal(run(f).components.limitedSupply.reasonCode, 'supply-small-cohort');
  }
});

test('future/invalid catalog dates withhold all premiums but preserve the saved base', () => {
  for (const dates of [{observedAt: ago(-0.1), expiresAt: ago(-1)},
    {observedAt: '2026-02-30T00:00:00Z'}, {observedAt: '2026-09-06T17:00:00'}]) {
    const f = fixture(); Object.assign(f.catalog, dates);
    assertNoPremiums(run(f), 'catalog-evidence-invalid');
  }
  for (const expiresAt of [NOW, ago(0.1)]) {
    const f = fixture(); f.catalog.observedAt = NOW; f.catalog.expiresAt = expiresAt;
    assert.throws(() => run(f), /snapshot timestamps/, 'expiry must follow observation');
  }
});

test('15-minute availability TTL never makes hourly advisory premiums oscillate', () => {
  const f = fixture(); f.catalog.observedAt = NOW; f.catalog.expiresAt = new Date(TIME + 15 * 60000).toISOString();
  const before = JSON.stringify(f.catalog);
  for (const minutes of [0, 14, 15, 30, 45, 60, 90, 120]) {
    f.options.now = TIME + minutes * 60000; const r = run(f);
    assert.equal(r.totalCents, 145000, `minute ${minutes}`); assert.equal(r.appliedBonusCents, 20000);
    assert.equal(r.listingStale, minutes >= 15); assert.equal(r.evidenceAsOf, NOW);
    assert.equal(r.facts.snapshot.status, minutes > 15 ? 'stale' : 'observed', 'original analyzer status is never rewritten');
    assert.equal(r.components.limitedSupply.evidence.listingStatus, minutes > 15 ? 'stale' : 'observed');
    if (minutes >= 15) assert.match(r.availabilityNotice, /expired/);
    assert.equal(JSON.stringify(f.catalog), before);
  }
  for (const now of [TIME + 120 * 60000 + 1, TIME + 121 * 60000, TIME + DAY]) {
    f.options.now = now; assertNoPremiums(run(f), 'catalog-evidence-expired');
  }
});

test('valuation maximum age applies even if a catalog declares a much longer availability TTL', () => {
  const f = fixture(); f.catalog.observedAt = new Date(TIME - 3 * 3600000).toISOString();
  const r = run(f); assertNoPremiums(r, 'catalog-evidence-expired');
  assert.equal(r.listingStale, false, 'availability and valuation age remain independent');
  assert.equal(r.facts.snapshot.status, 'observed'); assert.equal(r.evidenceAsOf, f.catalog.observedAt);
});

test('fresh saved-file read enables real-corpus advisory supply despite old source mtime', () => {
  const catalog = {...structuredClone(realCatalog), savedReadAt: NOW};
  assert.ok(Date.parse(catalog.observedAt) < TIME - 2 * 3600000, 'real source mtime is older than valuation window');
  const p = catalog.properties.find(p => p.region === 'c001');
  const materials = {knownSubtotalCents: 2154498, totalCents: 2154498};
  const before = JSON.stringify(catalog);
  const r = appraiseProperty(p, catalog, materials, {now: NOW, policy: {...registryPolicy, enabled: true}});
  assert.equal(r.components.limitedSupply.requestedCents, 60480);
  assert.equal(r.totalCents, 3424578);
  assert.equal(r.evidenceAsOf, NOW); assert.equal(r.sourceSavedAsOf, catalog.observedAt);
  assert.equal(r.evidenceBasis, 'saved-file-read'); assert.equal(r.listingStale, true);
  assert.equal(r.facts.snapshot.status, 'stale'); assert.equal(r.facts.supply.status, 'stale');
  assert.equal(r.facts.snapshot.observedAt, catalog.observedAt);
  assert.match(r.availabilityNotice, /not live in-memory/);
  assert.equal(JSON.stringify(catalog), before);
});

test('saved-read clock is bounded independently of old authorship and never renews availability', () => {
  const f = fixture(); f.catalog.observedAt = ago(10); f.catalog.expiresAt = ago(9);
  f.catalog.savedReadAt = NOW;
  const originalDates = [f.catalog.observedAt, f.catalog.expiresAt];
  for (const minutes of [0, 15, 30, 60, 120]) {
    f.options.now = TIME + minutes * 60000; const r = run(f);
    assert.equal(r.totalCents, 145000); assert.equal(r.listingStale, true);
    assert.equal(r.evidenceAsOf, NOW); assert.equal(r.sourceSavedAsOf, ago(10));
    assert.equal(r.facts.snapshot.status, 'stale');
    assert.deepEqual([f.catalog.observedAt, f.catalog.expiresAt], originalDates);
  }
  f.options.now = TIME + 120 * 60000 + 1; assertNoPremiums(run(f), 'catalog-evidence-expired');
  f.options.now = TIME; f.catalog.savedReadAt = ago(-1);
  assertNoPremiums(run(f), 'saved-read-invalid'); assert.equal(run(f).evidenceAsOf, null);
  for (const read of ['2026-02-30T00:00:00Z', '2026-09-06T23:00:00', null, ago(11)]) {
    f.catalog.savedReadAt = read; assert.throws(() => run(f), /saved-read/);
  }
  delete f.catalog.savedReadAt;
  assertNoPremiums(run(f), 'catalog-evidence-expired');
  assert.equal(run(f).evidenceBasis, 'source-mtime-fallback');
});

test('catalog identity wins over forged caller fields; absent and duplicate IDs are rejected', () => {
  const f = fixture(), expected = run(f);
  const forged = {...f.p, priceCents: 999999999999, kind: 'forged', tenure: 'rent', geometry: null, status: 'available'};
  assert.deepEqual(appraiseProperty(forged, f.catalog, f.materials, f.options), expected);
  assert.deepEqual(appraiseProperty({id: f.p.id}, f.catalog, f.materials, f.options), expected);
  assert.throws(() => appraiseProperty({...forged, id: 'world:missing'}, f.catalog, f.materials, f.options), /absent/);
  assert.throws(() => appraiseProperty(null, f.catalog, f.materials, f.options), /absent/);
  f.catalog.properties.push(structuredClone(f.p)); assert.throws(() => run(f), /duplicate property identity/);
});

test('rent never gains a capital estimate or any premium, even with known materials/review', () => {
  const f = fixture(); f.p.tenure = 'rent'; f.p.periodSeconds = 604800; const r = run(f);
  assertNoPremiums(r, 'rental-not-capital'); assert.equal(r.baseEstimate, null); assert.equal(r.totalCents, null);
  assert.equal(r.materialCents, 25000); assert.equal(r.assessmentCents, 100000);
  assert.match(r.facts.originalAssessment.reason, /Rental-period/);
});

test('known partial materials preserve existing combined estimate and never invent missing value', () => {
  const f = fixture(); f.materials.totalCents = null; f.materials.unknownCells = 2;
  const r = run(f); assert.deepEqual(r.baseEstimate, combinedPropertyEstimate(f.p, f.materials));
  assert.equal(r.baseEstimate.partial, true); assert.equal(r.totalCents, 145000);
  f.materials = {knownSubtotalCents: 0, totalCents: 0, unknownCells: 0};
  assert.equal(run(f).totalCents, 120000);
});

test('missing/invalid material or assessment inputs cannot produce a capital total', () => {
  for (const materials of [null, undefined, {}, {knownSubtotalCents: -1, totalCents: -1},
    {knownSubtotalCents: '100', totalCents: 100}, {knownSubtotalCents: 1.1, totalCents: 1.1},
    {knownSubtotalCents: NaN, totalCents: NaN}, {knownSubtotalCents: Infinity, totalCents: Infinity},
    {knownSubtotalCents: 1, totalCents: 2}, {knownSubtotalCents: 1, totalCents: null, unknownCells: 0},
    {knownSubtotalCents: 1, totalCents: 1, unknownCells: -1}]) {
    const f = fixture(); f.materials = materials;
    assertNoPremiums(run(f), 'materials-invalid'); assert.equal(run(f).totalCents, null);
  }
  const f = fixture(); f.p.priceCents = null; assertNoPremiums(run(f), 'base-invalid');
});

test('monetary overflow fails closed both when combining the base and when adding premiums', () => {
  const f = fixture(); f.materials = {knownSubtotalCents: Number.MAX_SAFE_INTEGER, totalCents: Number.MAX_SAFE_INTEGER};
  assertNoPremiums(run(f), 'base-invalid');
  f.materials = {knownSubtotalCents: Number.MAX_SAFE_INTEGER - 100000, totalCents: Number.MAX_SAFE_INTEGER - 100000};
  const r = run(f); assertNoPremiums(r, 'monetary-overflow'); assert.equal(r.totalCents, Number.MAX_SAFE_INTEGER);
  assert.ok(Object.values(r.components).every(c => c.status === 'withheld')); assert.equal(r.capApplied, false);
});

test('unverified assessment basis withholds extras without rewriting the existing combined base', () => {
  const f = fixture(); f.p.priceBasis = 'unverified'; const r = run(f);
  assertNoPremiums(r, 'assessment-unverified');
  assert.deepEqual(r.baseEstimate, combinedPropertyEstimate(f.p, f.materials));
});

test('quality rubric exact values, no uplift at or below average two, never negative', () => {
  for (const [scores, expectedBps, expectedCents] of [
    [[0, 0, 0, 0], 0, 0], [[2, 2, 2, 2], 0, 0], [[4, 4, 0, 0], 0, 0],
    [[3, 2, 2, 2], 187.5, 1875], [[3, 3, 3, 3], 750, 7500], [[4, 4, 4, 4], 1500, 15000]]) {
    const f = fixture(); Object.keys(f.options.review.scores).forEach((k, i) => { f.options.review.scores[k] = scores[i]; });
    const c = quality(f); assert.equal(c.basisPoints, expectedBps); assert.equal(c.requestedCents, expectedCents);
    assert.ok(c.appliedCents >= 0);
  }
});

test('quality keeps AI attribution and binds property, approved status, rubric and fingerprint', () => {
  const f = fixture(); f.options.review.kind = 'ai-assisted'; assert.equal(quality(f).evidence.kind, 'ai-assisted');
  for (const patch of [{propertyId: 'world:other'}, {status: 'pending'}, {status: true}, {kind: 'automated-heuristic'},
    {rubricVersion: 'design-v2'}, {structureHash: 'd'.repeat(64)}, {structureHash: 'A'.repeat(64)}]) {
    const a = fixture(); Object.assign(a.options.review, patch); assert.equal(quality(a).requestedCents, null);
  }
  for (const structureHash of [undefined, '', 'bad', 'a'.repeat(63), 123]) {
    const a = fixture(); a.options.structureHash = structureHash; assert.equal(quality(a).requestedCents, null);
  }
});

test('review can predate a repeated capture, expires after 90 days, and rejects fake dates', () => {
  const f = fixture(); f.options.review.reviewedAt = ago(90);
  assert.equal(quality(f).requestedCents, 15000);
  assert.ok(Date.parse(f.options.review.reviewedAt) < Date.parse(f.p.preview.capturedAt));
  for (const reviewedAt of [ago(90 + 1 / DAY), ago(-1), '2026-02-30T00:00:00Z',
    '2026-09-06', '2026-09-06T24:00:00Z', '2026-09-06T20:00:00']) {
    f.options.review.reviewedAt = reviewedAt; assert.equal(quality(f).requestedCents, null);
  }
  f.options.review.reviewedAt = '2026-09-06T19:00:00-04:00';
  assert.equal(quality(f).requestedCents, 15000, 'same instant as now is valid');
  f.options.review.reviewedAt = '2026-09-06T20:00:00-04:00';
  assert.equal(quality(f).requestedCents, null, 'offset must compare chronologically');
});

test('quality needs a real volume: inclusive eight-block boundary, not a one-layer region', () => {
  const f = fixture(); f.p.geometry.maxY = 67; assert.equal(quality(f).requestedCents, 15000);
  for (const maxY of [66, 60, 67.5]) { f.p.geometry.maxY = maxY; assert.equal(quality(f).requestedCents, null); }
  f.p.geometry.maxY = 79; f.p.geometry.points = [[0, 0], [1, 0], [2, 0]];
  assert.equal(quality(f).requestedCents, null);
});

test('malformed, fractional or missing scores cannot become a quality premium', () => {
  for (const v of [-1, 5, 2.5, '4', null, Infinity, NaN, undefined]) {
    const f = fixture(); f.options.review.scores.composition = v; assert.equal(quality(f).requestedCents, null);
  }
  const f = fixture(); f.options.review.scores.extra = 4; assert.equal(quality(f).requestedCents, null);
  delete f.options.review.scores.extra; delete f.options.review.scores.completion; assert.equal(quality(f).requestedCents, null);
});

test('evidence contract rejects external URLs, traversal, hash mismatches, duplicates and oversize lists', () => {
  for (const evidence of [[], null, [{url: 'https://example.com/a.png', sha256: IMAGE}],
    [{url: `/property-review-evidence/../${IMAGE}.png`, sha256: IMAGE}],
    [{url: `/property-review-evidence/${IMAGE}.png`, sha256: HASH}],
    [{url: `/property-review-evidence/${IMAGE}.png?x=1`, sha256: IMAGE}],
    [{url: `/property-review-evidence/${IMAGE}.png`, sha256: IMAGE, privatePath: '/home/player'}],
    Array(2).fill({url: `/property-review-evidence/${IMAGE}.png`, sha256: IMAGE})]) {
    const f = fixture(); f.options.review.evidence = evidence;
    assert.equal(quality(f).reasonCode, 'quality-evidence-invalid');
  }
  const f = fixture();
  f.options.review.evidence = Array.from({length: 8}, (_, i) => { const hash = i.toString().repeat(64); return {url: `/property-review-evidence/${hash}.png`, sha256: hash}; });
  assert.equal(quality(f).requestedCents, 15000);
  f.options.review.evidence.push({url: `/property-review-evidence/${IMAGE}.png`, sha256: IMAGE});
  assert.equal(quality(f).reasonCode, 'quality-evidence-invalid');
});

test('unsafe review text is rejected and extra private fields are never projected', () => {
  for (const patch of [{reviewer: ''}, {reviewer: 'x'.repeat(121)}, {summary: 'x'.repeat(1001)},
    {summary: '<img src=x onerror=alert(1)>'}, {summary: 'control\nline'}, {reviewer: 'bidi\u202evalue'},
    {privateOwnerIp: 'do-not-project'}]) {
    const f = fixture(); Object.assign(f.options.review, patch); const r = run(f);
    assert.equal(r.components.quality.requestedCents, null); assert.ok(!JSON.stringify(r).includes('do-not-project'));
  }
});

test('asking prices, histories, road and traffic inputs never calibrate or add premiums', () => {
  const f = fixture(), original = run(f);
  f.catalog.properties[1].priceCents = 999999999999;
  f.p.history.push({id: 'fixture-sale', type: 'purchase', at: ago(2), amountCents: 999999999999, source: 'Synthetic record, not reviewed comparable proof'});
  f.options.context.roads = {verified: true, public: true, version: 'v1', source: 'Fixture', reviewedAt: ago(1),
    segments: [{worldId: 'world', public: true, kind: 'main', points: [[0, 0], [0, 10]]}]};
  f.options.context.traffic = {verified: true, count: 9999999, premiumCents: 9999999};
  const r = run(f); assert.equal(r.totalCents, original.totalCents); assert.deepEqual(r.components, original.components);
  assert.equal(r.facts.comps.eligibleCount, 0); assert.equal(r.facts.road.frontageBlocks, null);
});

test('cap/floor/additivity hold across small pennies, uneven requests and maximum catalog price', () => {
  for (const price of [1, 4, 5, 7, 11, 99, 101, 103, 100001, 999999999999, 1000000000000]) {
    const f = fixture(); f.p.priceCents = price; const r = run(f);
    const cs = Object.values(r.components);
    const requested = cs.reduce((a, c) => a + c.requestedCents, 0);
    const applied = cs.reduce((a, c) => a + c.appliedCents, 0);
    assert.equal(applied, Math.min(requested, Number(BigInt(price) / 5n)));
    assert.equal(r.appliedBonusCents, applied); assert.equal(r.totalCents, price + 25000 + applied);
    assert.ok(cs.every(c => Number.isSafeInteger(c.appliedCents) && c.appliedCents >= 0 && c.appliedCents <= c.requestedCents));
    assert.deepEqual(run(f), r);
  }
});

test('inputs stay byte-identical; result including projected review is deeply immutable', () => {
  const f = fixture(), before = JSON.stringify(f), r = run(f);
  assert.equal(JSON.stringify(f), before);
  assert.throws(() => { r.totalCents = 0; }, TypeError);
  assert.throws(() => { r.components.quality.evidence.scores.composition = 0; }, TypeError);
  assert.throws(() => { r.components.quality.evidence.evidence[0].url = '/bad'; }, TypeError);
  f.options.review.scores.composition = 0;
  assert.equal(r.components.quality.evidence.scores.composition, 4);
  assert.throws(() => { VALUATION_RULES.spawn.maxBasisPoints = 999999; }, TypeError);
});

test('invalid analysis clocks are rejected rather than comparing dates inconsistently', () => {
  const f = fixture();
  for (const now of ['2026-02-30T00:00:00Z', '2026-09-06', NaN, Infinity, 9e15, null]) {
    assert.throws(() => appraiseProperty(f.p, f.catalog, f.materials, {...f.options, now}), /Invalid valuation time/);
  }
});

test('real catalog baseline remains exact, old snapshot never earns fresh premiums', () => {
  const legacy = structuredClone(realCatalog); delete legacy.savedReadAt;
  const p = legacy.properties.find(p => p.region === 'c001');
  const materials = {knownSubtotalCents: 2154498, totalCents: 2154498};
  const r = appraiseProperty(p, legacy, materials, {now: NOW, policy: {...registryPolicy, enabled: true}});
  assert.deepEqual(r.baseEstimate, combinedPropertyEstimate(p, materials));
  assert.equal(r.totalCents, 3364098); assertNoPremiums(r, 'catalog-evidence-expired');
  assert.equal(r.facts.comps.eligibleCount, 0);
});

test('actual structural fingerprint ignores recoloring/capture time but invalidates a changed block', async () => {
  const f = fixture();
  const capture = {schemaVersion: 1, format: 'plot-blocks', propertyId: f.p.id, capturedAt: ago(1), source: 'saved-world',
    origin: [0, 60, 0], size: [1, 8, 1], palette: [{material: 'minecraft:stone', state: {}, color: '#777777'}],
    blocks: Array.from({length: 8}, (_, y) => [0, y, 0, 0])};
  const hash = await structureHash(capture, f.p); f.options.structureHash = f.options.review.structureHash = hash;
  assert.equal(quality(f).requestedCents, 15000);
  capture.capturedAt = NOW; capture.palette[0].color = '#eeeeee';
  assert.equal(await structureHash(capture, f.p), hash); assert.equal(quality(f).requestedCents, 15000);
  capture.palette[0].material = 'minecraft:diamond_block'; f.options.structureHash = await structureHash(capture, f.p);
  assert.notEqual(f.options.structureHash, hash); assert.equal(quality(f).reasonCode, 'quality-structure-mismatch');
});
