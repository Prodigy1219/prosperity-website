import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalog} from '../src/lib/property-core.mjs';
import {appraiseProperty, VALUATION_RULES} from '../src/lib/property-valuation.mjs';

const HASH = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const readJSON = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

function validateReviews({registry, structures, catalog, readEvidence, now = Date.now()}) {
  assert.ok(record(registry) && registry.version === 1 && Array.isArray(registry.reviews) &&
    (!Object.hasOwn(registry, 'rubricVersion') || registry.rubricVersion === VALUATION_RULES.quality.rubricVersion),
    'invalid quality registry');
  assert.ok(record(structures) && structures.version === 1 && record(structures.properties),
    'invalid structure registry');
  assert.ok(Number.isFinite(now) && Number.isFinite(new Date(now).getTime()), 'invalid validation time');
  const data = validateCatalog(catalog), properties = new Map(data.properties.map(p => [p.id, p]));
  const seen = new Set();
  let images = 0;
  for (const review of registry.reviews) {
    assert.ok(record(review), 'review must be an object');
    const id = review.propertyId, property = properties.get(id);
    assert.ok(property, `${id}: unknown property`);
    assert.ok(!seen.has(id), `${id}: duplicate review`);
    seen.add(id);
    assert.ok(review.status === 'approved', `${id}: review must be approved`);
    assert.ok(review.kind === 'ai-assisted', `${id}: review must disclose ai-assisted attribution`);
    const reviewed = typeof review.reviewedAt === 'string' ? Date.parse(review.reviewedAt) : NaN;
    assert.ok(Number.isFinite(reviewed), `${id}: reviewedAt must be a finite date`);
    assert.ok(reviewed <= now, `${id}: reviewedAt is in the future`);
    const binding = Object.hasOwn(structures.properties, id) ? structures.properties[id] : null;
    assert.ok(record(binding) && typeof binding.structureHash === 'string' && HASH.test(binding.structureHash),
      `${id}: missing or invalid current structure binding`);
    assert.ok(property.preview && binding.previewUrl === property.preview.url,
      `${id}: structure binding does not match catalog preview`);

    // Use the engine's exact review/scores/evidence schema, independently of money
    // holds. Validate at review time so a saved registry does not fail just by aging.
    const quality = appraiseProperty(property, data, {knownSubtotalCents: 0, totalCents: 0},
      {review, structureHash: binding.structureHash, now: reviewed}).components.quality;
    assert.ok(quality.evidenceStatus === 'eligible', `${id}: ${quality.evidence.reasonCode}`);
    // This release requires two distinct views; the engine permits one through eight.
    assert.ok(review.evidence.length === 2, `${id}: exactly two evidence PNGs required`);
    for (const evidence of review.evidence) {
      let bytes;
      try { bytes = readEvidence(evidence.url); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        assert.fail(`${id}: missing evidence ${evidence.url}`);
      }
      assert.ok(Buffer.isBuffer(bytes) && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
        `${id}: evidence is not PNG ${evidence.url}`);
      assert.ok(digest(bytes) === evidence.sha256, `${id}: evidence hash mismatch ${evidence.url}`);
      images++;
    }
  }
  return {reviews: seen.size, images};
}

test('saved quality reviews bind to catalog, current structures and actual evidence PNG bytes', t => {
  const registry = readJSON('../src/data/property-quality-reviews.json');
  const result = validateReviews({registry,
    structures: readJSON('../src/data/property-structures.json'),
    catalog: readJSON('../src/data/property-catalog.json'),
    // Engine validation above constrains every URL before this reader is called.
    readEvidence: url => readFileSync(new URL('../public' + url, import.meta.url))});
  assert.deepEqual(result, {reviews: registry.reviews.length, images: registry.reviews.length * 2});
  t.diagnostic(`Validated ${result.reviews} saved reviews and ${result.images} evidence PNG hashes.`);
});

const REVIEWED_AT = '2026-09-06T21:00:00Z', NOW = Date.parse('2026-09-06T22:00:00Z');
const ID = 'world:quality_fixture', STRUCTURE = 'a'.repeat(64);
// Two distinct, valid one-pixel PNGs. Fixtures never read or alter release assets.
const PNGS = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
];

function fixture() {
  const files = new Map(), reads = [];
  const evidence = PNGS.map(base64 => {
    const bytes = Buffer.from(base64, 'base64'), sha256 = digest(bytes);
    const url = `/property-review-evidence/${sha256}.png`;
    files.set(url, bytes);
    return {url, sha256};
  });
  const property = {id: ID, region: 'quality_fixture', world: 'World', worldId: 'world',
    tenure: 'buy', status: 'available', kind: 'commercial', tags: [], priceCents: 100000,
    priceBasis: 'static', periodSeconds: null, leaseEndsAt: null, owner: null, history: [],
    geometry: {points: [[0, 0], [10, 0], [10, 10], [0, 10]], minY: 60, maxY: 79},
    preview: {url: `/property-previews/${'c'.repeat(64)}.json`, capturedAt: REVIEWED_AT}};
  const registry = {version: 1, reviews: [{propertyId: ID,
    structureHash: STRUCTURE, rubricVersion: 'design-v1', reviewedAt: REVIEWED_AT,
    reviewer: 'AI-assisted fixture reviewer', kind: 'ai-assisted', status: 'approved',
    scores: {composition: 3, detailing: 2, completion: 4, streetscape: 3}, evidence,
    summary: 'Synthetic rubric judgment for validation tests only.'}]};
  return {registry, files, reads, now: NOW,
    structures: {version: 1, properties: {[ID]: {structureHash: STRUCTURE, previewUrl: property.preview.url}}},
    catalog: {schemaVersion: 1, observedAt: REVIEWED_AT, expiresAt: '2026-09-06T21:15:00Z', properties: [property]},
    readEvidence: url => {
      reads.push(url);
      if (!files.has(url)) throw Object.assign(new Error('Fixture file absent'), {code: 'ENOENT'});
      return files.get(url);
    }};
}

// A fresh passing baseline plus an exact diagnostic proves each intended gate is
// reached. An earlier unrelated rejection must never count as a successful mutation.
function rejectsMutation(edit, message) {
  const f = fixture();
  assert.deepEqual(validateReviews(f), {reviews: 1, images: 2});
  f.reads.length = 0;
  edit(f);
  assert.throws(() => validateReviews(f), {name: 'AssertionError', message});
  return f;
}

test('positive fixture reads and hashes both distinct evidence images without mutating inputs', () => {
  const f = fixture(), before = JSON.stringify([f.registry, f.structures, f.catalog]);
  assert.deepEqual(validateReviews(f), {reviews: 1, images: 2});
  assert.deepEqual(f.reads, f.registry.reviews[0].evidence.map(e => e.url));
  assert.notEqual(f.registry.reviews[0].evidence[0].sha256, f.registry.reviews[0].evidence[1].sha256);
  assert.equal(JSON.stringify([f.registry, f.structures, f.catalog]), before);
});

test('empty registry is valid and does not attempt to read any images', () => {
  const f = fixture(); f.registry.reviews = [];
  assert.deepEqual(validateReviews(f), {reviews: 0, images: 0});
  f.registry.rubricVersion = 'design-v1';
  assert.deepEqual(validateReviews(f), {reviews: 0, images: 0});
  assert.deepEqual(f.reads, []);
});

test('old catalog and review clocks cannot mask quality schema validation', () => {
  const f = fixture(); f.now += 365 * 86400000;
  assert.deepEqual(validateReviews(f), {reviews: 1, images: 2});
  f.registry.reviews[0].scores.composition = 5;
  assert.throws(() => validateReviews(f), {name: 'AssertionError', message: `${ID}: quality-scores-invalid`});
});

for (const index of [0, 1]) {
  const url = fixture().registry.reviews[0].evidence[index].url;
  test(`changed evidence bytes in PNG ${index + 1} fail its own hash check`, () => {
    const f = rejectsMutation(f => { f.files.get(url)[f.files.get(url).length - 1] ^= 1; },
      `${ID}: evidence hash mismatch ${url}`);
    assert.deepEqual(f.reads, f.registry.reviews[0].evidence.slice(0, index + 1).map(e => e.url));
  });
  test(`missing evidence PNG ${index + 1} fails its own file check`, () => {
    const f = rejectsMutation(f => { f.files.delete(url); }, `${ID}: missing evidence ${url}`);
    assert.deepEqual(f.reads, f.registry.reviews[0].evidence.slice(0, index + 1).map(e => e.url));
  });
}

test('matching hash and filename cannot disguise non-PNG bytes', () => {
  const bytes = Buffer.from('not a PNG'), sha256 = digest(bytes), url = `/property-review-evidence/${sha256}.png`;
  rejectsMutation(f => {
    f.files.set(url, bytes); f.registry.reviews[0].evidence[1] = {url, sha256};
  }, `${ID}: evidence is not PNG ${url}`);
});

for (const [name, edit, reason] of [
  ['wrong review structure', f => { f.registry.reviews[0].structureHash = 'b'.repeat(64); }, 'quality-structure-mismatch'],
  ['changed current structure', f => { f.structures.properties[ID].structureHash = 'b'.repeat(64); }, 'quality-structure-mismatch'],
  ['missing current structure', f => { delete f.structures.properties[ID]; }, 'missing or invalid current structure binding'],
  ['invalid current structure', f => { f.structures.properties[ID].structureHash = 'bad'; }, 'missing or invalid current structure binding'],
  ['stale structure preview', f => { f.structures.properties[ID].previewUrl = `/property-previews/${'d'.repeat(64)}.json`; }, 'structure binding does not match catalog preview'],
  ['changed catalog preview', f => { f.catalog.properties[0].preview.url = `/property-previews/${'d'.repeat(64)}.json`; }, 'structure binding does not match catalog preview'],
  ['duplicate approved review', f => { f.registry.reviews.push(structuredClone(f.registry.reviews[0])); }, 'duplicate review'],
]) {
  test(`rejects ${name}`, () => { rejectsMutation(edit, `${ID}: ${reason}`); });
}

test('an otherwise valid review must name a known catalog property', () => {
  rejectsMutation(f => { f.catalog.properties = []; }, `${ID}: unknown property`);
});

for (const [name, edit, reason] of [
  ['unapproved status', r => { r.status = 'pending'; }, 'review must be approved'],
  ['false human attribution', r => { r.kind = 'human'; }, 'review must disclose ai-assisted attribution'],
  ['extra review key', r => { r.privateNotes = 'not public'; }, 'quality-review-invalid'],
  ['missing review key', r => { delete r.summary; }, 'quality-review-invalid'],
  ['wrong rubric', r => { r.rubricVersion = 'design-v2'; }, 'quality-review-invalid'],
  ['blank reviewer', r => { r.reviewer = ' '; }, 'quality-review-invalid'],
  ['oversized reviewer', r => { r.reviewer = 'x'.repeat(121); }, 'quality-review-invalid'],
  ['unsafe summary', r => { r.summary = '<script>bad</script>'; }, 'quality-review-invalid'],
  ['oversized summary', r => { r.summary = 'x'.repeat(1001); }, 'quality-review-invalid'],
  ['control characters', r => { r.summary = 'line\nbreak'; }, 'quality-review-invalid'],
  ['bidi attribution', r => { r.reviewer = 'name\u202e'; }, 'quality-review-invalid'],
  ['non-date', r => { r.reviewedAt = 'not-a-date'; }, 'reviewedAt must be a finite date'],
  ['non-string date', r => { r.reviewedAt = Infinity; }, 'reviewedAt must be a finite date'],
  ['future date', r => { r.reviewedAt = '2026-09-07T00:00:00Z'; }, 'reviewedAt is in the future'],
  ['normalized nonexistent date', r => { r.reviewedAt = '2026-02-30T00:00:00Z'; }, 'quality-date-invalid'],
  ['date without time', r => { r.reviewedAt = '2026-09-06'; }, 'quality-date-invalid'],
  ['date without timezone', r => { r.reviewedAt = '2026-09-05T00:00:00'; }, 'quality-date-invalid'],
  ['extra score', r => { r.scores.extra = 4; }, 'quality-scores-invalid'],
  ['missing score', r => { delete r.scores.completion; }, 'quality-scores-invalid'],
  ['one evidence image', r => { r.evidence.pop(); }, 'exactly two evidence PNGs required'],
  ['duplicate evidence', r => { r.evidence[1] = structuredClone(r.evidence[0]); }, 'quality-evidence-invalid'],
  ['extra evidence key', r => { r.evidence[1].caption = 'unexpected'; }, 'quality-evidence-invalid'],
  ['missing evidence hash', r => { delete r.evidence[1].sha256; }, 'quality-evidence-invalid'],
  ['filename/hash disagreement', r => { r.evidence[1].sha256 = 'f'.repeat(64); }, 'quality-evidence-invalid'],
  ['uppercase evidence hash', r => { r.evidence[1].sha256 = r.evidence[1].sha256.toUpperCase(); }, 'quality-evidence-invalid'],
  ['external evidence URL', r => { r.evidence[1].url = 'https://example.com/evidence.png'; }, 'quality-evidence-invalid'],
  ['traversal evidence URL', r => { r.evidence[1].url = `/property-review-evidence/../${r.evidence[1].sha256}.png`; }, 'quality-evidence-invalid'],
  ['evidence query string', r => { r.evidence[1].url += '?changed=1'; }, 'quality-evidence-invalid'],
]) {
  test(`rejects ${name} in an otherwise valid review`, () => {
    rejectsMutation(f => { edit(f.registry.reviews[0]); }, `${ID}: ${reason}`);
  });
}

test('each rubric score must be an integer from zero through four', () => {
  for (const key of Object.keys(fixture().registry.reviews[0].scores)) {
    for (const value of [-1, 5, 2.5, '3', null, NaN, Infinity]) {
      rejectsMutation(f => { f.registry.reviews[0].scores[key] = value; }, `${ID}: quality-scores-invalid`);
    }
  }
});

test('invalid registry metadata cannot masquerade as an empty registry', () => {
  for (const registry of [null, [], {}, {version: 2, rubricVersion: 'design-v1', reviews: []},
    {version: 1, rubricVersion: 'design-v2', reviews: []}, {version: 1, rubricVersion: 'design-v1', reviews: null}]) {
    rejectsMutation(f => { f.registry = registry; }, 'invalid quality registry');
  }
});
