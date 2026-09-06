import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCatalog } from '../src/lib/property-core.mjs';
export function minor(value) { const s = String(value); if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    return null; const [whole, fraction = ''] = s.split('.'); const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0')); return Number.isSafeInteger(n) && n > 0 && n <= 1000000000000 ? n : null; }
export function seconds(value) { if (typeof value === 'number')
    return Number.isSafeInteger(value) && value >= 1000 && value % 1000 === 0 ? value / 1000 : null; if (typeof value !== 'string' || !/^\d+[dhms]$/.test(value))
    return null; const n = Number(value.slice(0, -1)) * ({ d: 86400, h: 3600, m: 60, s: 1 }[value.at(-1)]); return Number.isSafeInteger(n) && n > 0 ? n : null; }
export function normalizeInput(input) {
    if (input.fixtureVersion !== 1 || !Array.isArray(input.properties) || input.properties.length > 5000)
        throw Error('Unsupported sanitized input');
    const observedAt = input.snapshotAsOf;
    const properties = input.properties.map(row => {
        if (!['ARM_PUBLIC_KIND', 'ARM_PUBLIC_KIND_CHILD'].includes(row.eligibility) || row.world !== 'world')
            throw Error('Property eligibility not approved');
        const region = row.regionId.toLowerCase(), worldId = row.world;
        const geo = row.geometry, cuboid = geo.type === 'cuboid';
        if (!cuboid && geo.type !== 'poly2d')
            throw Error('Unsupported geometry');
        const points = cuboid ? [[geo.min.x, geo.min.z], [geo.max.x + 1, geo.min.z], [geo.max.x + 1, geo.max.z + 1], [geo.min.x, geo.max.z + 1]] : geo.points.map(v => [v.x, v.z]);
        const minY = cuboid ? geo.min.y : geo['min-y'], maxY = cuboid ? geo.max.y : geo['max-y'];
        const rent = row.arm.regiontype === 'rentregion';
        if (!rent && row.arm.regiontype !== 'sellregion')
            throw Error('Unsupported contract');
        let plan = { price: row.arm.price, extendTime: row.arm.extendTime, autoPriceCalculation: 'static' }, basis = 'static', notes = ['Saved ARM/WG state; game memory has not been checked.'];
        let fallback = false;
        if (Object.hasOwn(row.arm, 'autoprice')) {
            const named = input.pricing.AutoPrice[row.arm.autoprice];
            if (named) {
                plan = named;
            }
            else {
                fallback = true;
                notes.push('Unknown AutoPrice plan. Asking price is withheld until verified.');
            }
        }
        basis = plan.autoPriceCalculation;
        let priceCents = fallback ? null : minor(plan.price);
        if (!['static', 'per_m2', 'per_m3'].includes(basis)) {
            priceCents = null;
            basis = 'unverified';
        }
        if (basis !== 'static' && basis !== 'unverified') {
            if (!cuboid) {
                priceCents = null;
                notes.push('Polygon AutoPrice is unverified; no zero-price offer is inferred.');
            }
            else if (priceCents !== null)
                priceCents *= (geo.max.x - geo.min.x + 1) * (geo.max.z - geo.min.z + 1) * (basis === 'per_m3' ? maxY - minY + 1 : 1);
        }
        if (!Number.isSafeInteger(priceCents) || priceCents <= 0)
            priceCents = null;
        let periodSeconds = rent ? seconds(plan.extendTime) : null;
        let status = row.arm.sold === true ? (rent ? 'leased' : 'owned') : row.arm.sold === false ? 'available' : 'unknown';
        if (row.integrityWarnings?.length || row.holderCount !== (row.arm.sold ? 1 : 0))
            status = 'unknown';
        if (rent && row.arm.sold && row.leaseClockAtCapture !== 'FUTURE') {
            status = 'unknown';
            notes.push('Lease clock has elapsed; expiry/renewal status must be checked in game.');
        }
        if (row.parentRegionId) {
            status = 'unknown';
            notes.push('Player sublet: configured price is not proof the landlord is currently letting this unit.');
        }
        if (priceCents === null || (rent && periodSeconds === null)) {
            if (status === 'available')
                status = 'unknown';
            notes.push('Price or rental period is not verified.');
        }
        const name = !rent && row.arm.sold && row.ownerNames.length === 1 ? row.ownerNames[0] : null;
        // Snapshot-only public handle, not an authorization identity or cross-snapshot ledger key.
        const owner = name ? { id: `name:${name.toLowerCase()}`, name } : null;
        const history = (input.recordedPurchases || []).filter(h => h.regionId === row.regionId).map((h, i) => ({ id: `backfill:${worldId}:${region}:${h.date}:${i}`, type: 'purchase', at: h.date, amountCents: minor(h.amountMajor), source: 'Console wallet-delta backfill; date only, incomplete' }));
        if (!rent && row.arm.sold && !history.length)
            notes.push('No recorded purchase in the supplied history. Assessment is not a sale price.');
        return { id: `${worldId}:${region}`, region, world: row.world, worldId, tenure: rent ? 'rent' : 'buy', status, kind: row.kindLabel || row.kind, tags: [row.parentRegionId ? 'player-sublet' : row.kind], priceCents, priceBasis: basis, periodSeconds, leaseEndsAt: null, owner, geometry: { points, minY, maxY }, mapId: 'world', history, preview: null, notes };
    });
    // capturedAt is the upstream stability-verified saved-read start, not a live
    // memory observation. Keep the original source-mtime availability clock intact.
    return validateCatalog({ schemaVersion: 1, observedAt, expiresAt: new Date(Date.parse(observedAt) + 15 * 60000).toISOString(),
        ...(Object.hasOwn(input, 'capturedAt') ? {savedReadAt: input.capturedAt} : {}), properties });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output)
        throw Error('Usage: node scripts/property-normalize.mjs SANITIZED_INPUT OUTPUT');
    const data = normalizeInput(JSON.parse(readFileSync(input, 'utf8')));
    mkdirSync(dirname(resolve(output)), { recursive: true });
    const tmp = resolve(output) + `.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    renameSync(tmp, resolve(output));
    console.log(`${data.properties.length} properties validated; disk snapshot ${data.observedAt}; no live availability claim`);
}
