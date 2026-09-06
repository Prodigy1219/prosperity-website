import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateRuntimeSnapshot} from '../src/lib/property-runtime.mjs';

const web = fileURLToPath(new URL('../', import.meta.url));
const publisher = process.env.PROPERTY_PUBLISHER || 'S:/season-0-economy-server/deploy/property-refresh-20260906/publisher.mjs';
const {projectGeneration} = await import(pathToFileURL(path.resolve(publisher)).href);
const generation = projectGeneration(web);
const fresh = () => structuredClone(generation.manifest);

test('real projected generation satisfies the public runtime contract', () => {
  const out = validateRuntimeSnapshot(fresh());
  assert.equal(out.catalog.properties.length, 53);
  assert.deepEqual(Object.keys(out).sort(), ['catalog', 'materialValues', 'meshes', 'publishedAt', 'refreshSeconds', 'version', 'worth']);
  assert.equal(out.materialValues['world:c001'].knownSubtotalCents, 2154498);
  for (const p of out.catalog.properties) {
    assert.ok(generation.assets.has(path.basename(p.preview.url)), 'capture exists in projected generation');
    assert.ok(generation.assets.has(path.basename(out.meshes[p.id])), 'mesh exists in projected generation');
  }
});

for (const [name, mutate, message] of [
  ['missing mesh', r => { delete r.meshes['world:c001']; }, /mesh inventory/],
  ['wrong property mesh key', r => { r.meshes.private = r.meshes['world:c001']; delete r.meshes['world:c001']; }, /runtime artifact/],
  ['foreign mesh origin', r => { r.meshes['world:c001'] = 'https://example.invalid/private.json'; }, /runtime artifact/],
  ['capture traversal', r => { r.catalog.properties[0].preview.url = '/property-runtime/assets/../private.json'; }, /preview artifact/],
  ['static capture in runtime bundle', r => { r.catalog.properties[0].preview.url = r.catalog.properties[0].preview.url.replace('property-runtime/assets', 'property-previews'); }, /runtime artifact/],
  ['negative worth', r => { r.worth.prices.unitMicros['minecraft:diamond'] = -1; }, /worth value/],
  ['fractional worth', r => { r.worth.prices.unitMicros['minecraft:diamond'] = 1.5; }, /worth value/],
  ['nonfinite worth', r => { r.worth.prices.unitMicros['minecraft:diamond'] = Infinity; }, /worth value/],
  ['incomplete prices', r => { r.worth.prices.unitMicros = {'minecraft:diamond': 100}; }, /Incomplete runtime worth/],
  ['invalid pricing rule', r => { r.worth.rules.bmap.STONE = '<script>'; }, /pricing rule/],
  ['future publication', r => { r.publishedAt = new Date(Date.now() + 600000).toISOString(); }, /snapshot publication/],
  ['invalid cadence', r => { r.refreshSeconds = 1; }, /snapshot publication/],
  ['missing material values', r => { delete r.materialValues; }, /material inventory/],
  ['missing property subtotal', r => { delete r.materialValues['world:c001']; }, /material inventory/],
  ['wrong property subtotal key', r => { r.materialValues.private = r.materialValues['world:c001']; delete r.materialValues['world:c001']; }, /material subtotal/],
  ['negative subtotal', r => { r.materialValues['world:c001'].knownSubtotalCents = -1; }, /material subtotal/],
  ['fractional subtotal', r => { r.materialValues['world:c001'].knownSubtotalCents = 1.5; }, /material subtotal/],
  ['contradictory material total', r => { r.materialValues['world:c001'].totalCents = 1; }, /material subtotal/],
  ['unknown cells with a purported complete total', r => { r.materialValues['world:c001'].unknownCells = 1; }, /material subtotal/],
]) {
  test(`rejects ${name}`, () => { const raw = fresh(); mutate(raw); assert.throws(() => validateRuntimeSnapshot(raw), message); });
}

test('unknown private fields are projected out at every structured boundary', () => {
  const raw = fresh(), marker = 'PRIVATE-FIXTURE-SENTINEL';
  raw.credentials = marker; raw.catalog.rawPaths = marker; raw.worth.privatePath = marker;
  raw.worth.prices.playerBalances = marker; raw.worth.rules.privateNotes = marker;
  for (const p of raw.catalog.properties) {
    raw.materialValues[p.id].privateInventory = marker;
    p.members = marker; p.geometry.privateWaypoint = marker; p.preview.nbt = marker;
    if (p.owner) p.owner.ip = marker;
    for (const h of p.history) h.privateActor = marker;
  }
  assert.equal(JSON.stringify(validateRuntimeSnapshot(raw)).includes(marker), false);
  assert.equal(JSON.stringify(raw).includes(marker), true, 'projection does not mutate input');
});

test('honest partial material value remains representable', () => {
  const raw = fresh(); raw.materialValues['world:c001'].unknownCells = 1;
  raw.materialValues['world:c001'].totalCents = null;
  assert.equal(validateRuntimeSnapshot(raw).materialValues['world:c001'].totalCents, null);
});
