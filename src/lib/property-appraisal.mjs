import {effectiveStatus, validateCatalog} from './property-core.mjs';

const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v);
const coordinate = n => Number.isFinite(n) && Math.abs(n) <= 30000000;
const point = p => Array.isArray(p) && p.length === 2 && p.every(coordinate);
const dayValid = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function instant(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(s) || !dayValid(s.slice(0, 10))) return NaN;
  return Date.parse(s);
}
const unknown = reason => ({status: 'unknown', reason});
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function segmentDistance(p, a, b) {
  const x = b[0] - a[0], z = b[1] - a[1], length2 = x * x + z * z;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * z) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * x, p[1] - a[1] - t * z);
}
/** Distance to a simple polygon's footprint: inside/on boundary is zero; Y is deliberately excluded. */
export function distanceToPolygon(p, polygon) {
  if (!point(p) || !Array.isArray(polygon) || polygon.length < 3 || polygon.length > 256 || !polygon.every(point)) throw Error('Invalid footprint');
  const twiceArea = polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (Math.abs(twiceArea) < 1e-9) throw Error('Degenerate footprint');
  let inside = false, distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    distance = Math.min(distance, segmentDistance(p, a, b));
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside || distance < 1e-9 ? 0 : distance;
}
function provenance(r, now, field = 'reviewedAt') {
  return r?.verified === true && r.public === true && text(r.version) && text(r.source) && Number.isFinite(instant(r[field])) && instant(r[field]) <= now;
}
function count(properties, now) {
  const counts = {total: properties.length, available: 0, owned: 0, leased: 0, unknown: 0};
  for (const p of properties) counts[effectiveStatus(p, now)]++;
  return counts;
}

/**
 * Pure evidence projection; caller passes validated public registries, never raw player feeds.
 * spawns: [{worldId, position:[x,y,z], verified:true, public:true, version, source, observedAt}]
 * roads: {verified:true, public:true, version, source, reviewedAt,
 *   segments:[{worldId, public:true, kind:'main', points:[[x,z], ...]}]}
 * qualityReviews: [{propertyId, snapshotHash, summary, verified:true, public:true,
 *   version, source, reviewedAt}]. snapshotHash binds to p.preview's content-addressed file.
 * Traffic and dollar calibration remain deliberately unsupported in this facts-only version.
 */
export function analyzeProperty(p, catalog, {spawns = [], roads, qualityReviews = [], traffic, policy, now = Date.now()} = {}) {
  const time = typeof now === 'number' ? now : instant(now);
  if (!Number.isFinite(time)) throw Error('Invalid analysis time');
  const data = validateCatalog(catalog), selected = data.properties.find(v => v.id === p?.id);
  if (!selected) throw Error('Property absent from catalog');
  const observed = instant(data.observedAt), expires = instant(data.expiresAt), snapshotValid = Number.isFinite(observed) && Number.isFinite(expires) && expires > observed && observed <= time;
  const snapshot = {status: !snapshotValid ? 'unknown' : time > expires ? 'stale' : 'observed', observedAt: data.observedAt, source: data.source,
    reason: !snapshotValid ? 'Listing observation is invalid or in the future.' : 'Saved listing state, not current availability or a reservation.'};
  const worldTenure = data.properties.filter(v => v.worldId === selected.worldId && v.tenure === selected.tenure);
  const peers = worldTenure.filter(v => v.kind === selected.kind);
  const supply = {status: snapshot.status, worldId: selected.worldId, kind: selected.kind, tenure: selected.tenure,
    ...count(peers, time), worldTenure: count(worldTenure, time), observedAt: data.observedAt, source: data.source,
    reason: 'Counts include this parcel, only published registry entries, and unknown availability separately; no scarcity premium is implied.'};

  let spawn = unknown('No verified public spawn for this world.');
  const matchingSpawns = Array.isArray(spawns) ? spawns.filter(s => s?.worldId === selected.worldId) : [];
  if (matchingSpawns.length === 1) {
    const s = matchingSpawns[0];
    if (provenance(s, time, 'observedAt') && Array.isArray(s.position) && s.position.length === 3 && s.position.every(coordinate)) {
      try { spawn = {status: 'observed', distanceBlocks: distanceToPolygon([s.position[0], s.position[2]], selected.geometry.points), method: '2d-straight-line-to-footprint',
        worldId: selected.worldId, position: [...s.position], version: s.version, source: s.source, observedAt: s.observedAt,
        reason: 'Distance from the dated saved spawn observation, not a guarantee of the current spawn. Nearest footprint boundary; inside is zero. Not a walking route, entrance distance, or height comparison.'}; }
      catch { spawn = unknown('Parcel footprint cannot be measured safely.'); }
    } else spawn = unknown('Spawn provenance, coordinates, or observation time is unverified.');
  } else if (matchingSpawns.length > 1) spawn = unknown('Conflicting spawn records require review.');

  let road = {...unknown('No reviewed public main-road registry for this world.'), reviewedSegmentCount: 0, frontageBlocks: null};
  if (provenance(roads, time) && Array.isArray(roads.segments)) {
    const segments = roads.segments.filter(s => s?.worldId === selected.worldId && s.public === true && s.kind === 'main' && Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 256 && s.points.every(point));
    if (segments.length) road = {...unknown('Reviewed road geometry exists; frontage/access method is not approved. Corner proximity is not frontage.'),
      reviewedSegmentCount: segments.length, frontageBlocks: null, version: roads.version, source: roads.source, reviewedAt: roads.reviewedAt};
  }
  let quality = unknown('No verified review bound to this exact building snapshot.');
  const hash = selected.preview?.url.match(/\/([a-f0-9]{64})\.json$/)?.[1];
  const reviews = Array.isArray(qualityReviews) ? qualityReviews.filter(r => r?.propertyId === selected.id && r.snapshotHash === hash && hash && provenance(r, time) &&
    instant(r.reviewedAt) >= instant(selected.preview.capturedAt) && text(r.summary)) : [];
  if (reviews.length === 1) {
    const r = reviews[0]; quality = {status: 'reviewed', snapshotHash: hash, summary: r.summary, version: r.version, source: r.source, reviewedAt: r.reviewedAt,
      reason: 'Human-reviewed description only; no score or monetary adjustment is inferred.'};
  } else if (reviews.length > 1) quality = unknown('Conflicting snapshot reviews require resolution.');

  const purchases = [], seen = new Set();
  let duplicateCount = 0;
  for (const v of data.properties.filter(v => v.worldId === selected.worldId)) for (const h of v.history.filter(h => h.type === 'purchase')) {
    const key = `${v.id}\u0000${h.id}`;
    if (seen.has(key)) { duplicateCount++; continue; } seen.add(key);
    const dateOnly = dayValid(h.at), at = dateOnly ? Date.parse(h.at) : instant(h.at);
    const exclusionReason = !Number.isFinite(at) || at > time ? 'invalid-or-future-date' : dateOnly ? 'date-only-record' : /backfill|incomplete/i.test(h.source) ? 'incomplete-backfill' : 'comparable-sale-proof-contract-not-approved';
    purchases.push({propertyId: v.id, id: h.id, at: h.at, amountCents: h.amountCents, source: h.source, exclusionReason});
  }
  return freeze({version: 1, propertyId: selected.id, analyzedAt: new Date(time).toISOString(), snapshot,
    originalAssessment: {priceCents: selected.priceCents, priceBasis: selected.priceBasis, tenure: selected.tenure, periodSeconds: selected.periodSeconds,
      source: data.source, observedAt: data.observedAt, reason: selected.tenure === 'rent' ? 'Rental-period charge, not a capital assessment.' : 'Unchanged asking/server assessment, not a comparable sale or land-only value.'},
    spawn, supply, road, quality,
    traffic: unknown(traffic ? 'Supplied traffic is not accepted until a privacy-safe measurement and attribution contract is approved.' : 'No verified privacy-safe traffic measurements.'),
    comps: {status: 'insufficient', recordedPurchaseCount: purchases.length, sameKindPurchaseCount: purchases.filter(h => peers.some(v => v.id === h.propertyId)).length,
      eligibleCount: 0, excludedCount: purchases.length, duplicateCount, records: purchases,
      reason: 'Recorded history is evidence only. Date-only backfills and asking/assessment values cannot calibrate comparable-sale value.'},
    premiums: {status: 'not-calibrated', amountCents: null, authorized: policy?.authorized === true, version: text(policy?.version) ? policy.version : null,
      reason: 'No dollar-premium model is implemented. Authorization alone cannot replace complete provenance, comparable-sale proof and reviewed calibration.'}});
}
