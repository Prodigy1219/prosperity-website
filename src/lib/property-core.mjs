// Shared by the browser and the offline feed gate. Money is integer cents.
export const STATUS = Object.freeze({ available: 'Available', owned: 'Owned', leased: 'Leased', unknown: 'Check in game' });
export const money = cents => Number.isSafeInteger(cents) && cents >= 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100) : 'Not verified';
const plain = (x, max = 120) => typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
const finite = x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 30000000;
const cents = x => x === null || (Number.isSafeInteger(x) && x > 0 && x <= 1000000000000);
/** @returns {import('./property-types').PropertyCatalog} */
export function validateCatalog(raw) {
    if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.properties) || raw.properties.length > 5000)
        throw Error('Unsupported property feed');
    if (!Number.isFinite(Date.parse(raw.observedAt)) || !Number.isFinite(Date.parse(raw.expiresAt)) || Date.parse(raw.expiresAt) <= Date.parse(raw.observedAt))
        throw Error('Missing snapshot timestamps');
    const seen = new Set();
    const properties = raw.properties.map(p => {
        if (!p || !plain(p.id, 180) || !plain(p.region, 80) || !/^[a-z0-9_\-]+$/.test(p.region) || !plain(p.world, 80) || !plain(p.worldId, 80) || p.id !== `${p.worldId}:${p.region}` || seen.has(p.id))
            throw Error('Invalid or duplicate property identity');
        seen.add(p.id);
        if (!['buy', 'rent'].includes(p.tenure) || !Object.hasOwn(STATUS, p.status) || !plain(p.kind, 60) || !Array.isArray(p.tags) || p.tags.length > 15 || p.tags.some(t => !plain(t, 40)))
            throw Error('Invalid listing classification');
        if (!cents(p.priceCents) || !['static', 'per_m2', 'per_m3', 'unverified'].includes(p.priceBasis))
            throw Error('Invalid asking price');
        if (p.tenure === 'rent' && !(p.periodSeconds === null || (Number.isSafeInteger(p.periodSeconds) && p.periodSeconds > 0 && p.periodSeconds <= 31536000)))
            throw Error('Invalid rental period');
        if (!p.geometry || !Array.isArray(p.geometry.points) || p.geometry.points.length < 3 || p.geometry.points.length > 256 || p.geometry.points.some(v => !Array.isArray(v) || v.length !== 2 || !v.every(finite)) || !finite(p.geometry.minY) || !finite(p.geometry.maxY) || p.geometry.maxY < p.geometry.minY)
            throw Error('Invalid region geometry');
        if (p.owner !== null && (!p.owner || !plain(p.owner.id, 80) || !plain(p.owner.name, 32)))
            throw Error('Invalid public owner');
        if (p.leaseEndsAt !== null && !Number.isFinite(Date.parse(p.leaseEndsAt)))
            throw Error('Invalid lease date');
        if (!Array.isArray(p.history) || p.history.length > 250 || p.history.some(h => !plain(h.id, 180) || !['purchase', 'rent', 'extend', 'sellback'].includes(h.type) || !Number.isFinite(Date.parse(h.at)) || !cents(h.amountCents) || !plain(h.source, 180)))
            throw Error('Unverifiable history');
        // No uploads, arbitrary hosts, NBT, inventories or raw schematic URLs.
        if (p.preview !== null && (!p.preview || !/^\/(?:property-previews|property-runtime\/assets)\/[a-f0-9]{64}\.json$/.test(p.preview.url) || !Number.isFinite(Date.parse(p.preview.capturedAt))))
            throw Error('Invalid preview artifact');
        const mapId = ['world', 'resource_world'].includes(p.mapId) ? p.mapId : null;
        return { id: p.id, region: p.region, world: p.world, worldId: p.worldId, tenure: p.tenure, status: p.status, kind: p.kind, tags: [...p.tags], priceCents: p.priceCents, priceBasis: p.priceBasis, periodSeconds: p.tenure === 'rent' ? p.periodSeconds : null, leaseEndsAt: p.leaseEndsAt, owner: p.owner ? { id: p.owner.id, name: p.owner.name } : null, geometry: { points: p.geometry.points.map(v => [...v]), minY: p.geometry.minY, maxY: p.geometry.maxY }, mapId, history: p.history.map(h => ({ id: h.id, type: h.type, at: h.at, amountCents: h.amountCents, source: h.source })), preview: p.preview ? { url: p.preview.url, capturedAt: p.preview.capturedAt } : null, notes: Array.isArray(p.notes) ? p.notes.filter(n => plain(n, 240)).slice(0, 6) : [] };
    });
    return { schemaVersion: 1, observedAt: raw.observedAt, expiresAt: raw.expiresAt, properties, source: 'ARM + WorldGuard snapshot' };
}
/** @param {import('./property-types').Property} p */
export function effectiveStatus(p, now = Date.now()) {
    // Expired lease is not an available listing until the authoritative expiry/reset completes.
    return p.status === 'leased' && p.leaseEndsAt && Date.parse(p.leaseEndsAt) <= now ? 'unknown' : p.status;
}
export function area(p) {
    const v = p.geometry.points;
    return Math.abs(v.reduce((sum, a, i) => { const b = v[(i + 1) % v.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
}
export function weeklyCents(p) { return p.tenure === 'rent' && p.priceCents !== null && p.periodSeconds > 0 ? p.priceCents * 604800 / p.periodSeconds : null; }
export function comparableCost(p) { return p.tenure === 'rent' ? weeklyCents(p) : p.priceCents; }
export function priceLabel(p) { return p.tenure === 'rent' ? `${money(p.priceCents)} / ${p.periodSeconds ? `${p.periodSeconds / 86400} days` : 'period unknown'}` : money(p.priceCents); }
export function center(p) { const a = p.geometry.points; return { x: (Math.min(...a.map(v => v[0])) + Math.max(...a.map(v => v[0]))) / 2, z: (Math.min(...a.map(v => v[1])) + Math.max(...a.map(v => v[1]))) / 2 }; }
export function mapUrl(p) { if (!p.mapId)
    return null; const c = center(p); return `https://map.prosperitysmp.com/#${encodeURIComponent(p.mapId)}:${Math.round(c.x)}:64:${Math.round(c.z)}:180:0:0:0:0:perspective`; }
/** @param {import('./property-types').Property[]} properties @param {import('./property-types').PropertyFilters} f */
export function filterProperties(properties, f = {}, now = Date.now()) {
    const q = String(f.query || '').trim().toLowerCase();
    return properties.filter(p => (!q || [p.region, p.kind, p.owner?.name, ...p.tags].some(x => x?.toLowerCase().includes(q))) && (!f.world || p.worldId === f.world) && (!f.tenure || p.tenure === f.tenure) && (!f.status || effectiveStatus(p, now) === f.status) && (!f.tag || p.tags.includes(f.tag)) && (!f.saved || f.saved.includes(p.id)) && (f.maxCost == null || (comparableCost(p) !== null && comparableCost(p) <= f.maxCost))).sort((a, b) => {
        // Mixed buy/rent lists remain separate. Never rank $500/week against a $15k purchase.
        if (a.tenure !== b.tenure)
            return a.tenure.localeCompare(b.tenure);
        if (f.sort === 'area')
            return area(b) - area(a) || a.id.localeCompare(b.id);
        if (f.sort === 'name')
            return a.region.localeCompare(b.region, undefined, { numeric: true });
        const av = comparableCost(a), bv = comparableCost(b);
        if (av === null || bv === null)
            return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
        return (f.sort === 'price-desc' ? bv - av : av - bv) || a.id.localeCompare(b.id);
    });
}
/** @param {import('./property-types').Property[]} properties */
export function holdings(properties) {
    const owners = new Map();
    for (const p of properties) {
        if (!p.owner)
            continue;
        let o = owners.get(p.owner.id);
        if (!o) {
            o = { ...p.owner, owned: [], leased: [] };
            owners.set(o.id, o);
        }
        if (p.tenure === 'buy' && p.status === 'owned')
            o.owned.push(p);
        else if (p.tenure === 'rent' && p.status === 'leased')
            o.leased.push(p);
    }
    return [...owners.values()].filter(o => o.owned.length + o.leased.length > 0).sort((a, b) => b.owned.length - a.owned.length || a.name.localeCompare(b.name));
}
export function validatePreview(raw) {
    if (!raw || raw.schemaVersion !== 1 || raw.format !== 'surface-voxels' || !Array.isArray(raw.blocks) || raw.blocks.length < 1 || raw.blocks.length > 75000)
        throw Error('Invalid preview');
    if (raw.blocks.some(b => !Array.isArray(b) || b.length !== 4 || b.slice(0, 3).some(v => !Number.isInteger(v) || Math.abs(v) > 512) || !/^#[a-fA-F0-9]{6}$/.test(b[3])))
        throw Error('Invalid preview blocks');
    return raw.blocks;
}
