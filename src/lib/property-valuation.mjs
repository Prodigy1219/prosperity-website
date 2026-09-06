import {analyzeProperty} from './property-appraisal.mjs';
import {area, validateCatalog} from './property-core.mjs';
import {combinedPropertyEstimate} from './property-build.mjs';

const DAY = 86400000, MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const HASH = /^[a-f0-9]{64}$/;
const VERSION = 'prosperity-advisory-v1';
const SCORE_KEYS = ['composition', 'detailing', 'completion', 'streetscape'];
const REVIEW_KEYS = ['propertyId', 'structureHash', 'rubricVersion', 'reviewedAt', 'reviewer', 'kind', 'status', 'scores', 'evidence', 'summary'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const safeText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const cents = v => Number.isSafeInteger(v) && v >= 0;
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

// This version accepts only the owner-approved coefficients. Registry metadata is
// descriptive, never a second enable switch. Advisory rules are not market facts.
export const DEFAULT_VALUATION_POLICY = Object.freeze({version: VERSION, enabled: false,
  scope: 'website-only', spawnMaxBps: 1000, spawnRadiusBlocks: 2000, supplyMaxBps: 500,
  qualityMaxBps: 1500, combinedMaxBps: 2000, basis: 'server-assessment',
  note: 'Chosen advisory policy, not sale-calibrated market premiums.'});
export const VALUATION_RULES = freeze({
  version: VERSION, scope: 'website-only', bonusBase: 'unchanged-arm-assessment',
  maxSnapshotAgeHours: 2,
  spawn: {maxBasisPoints: 1000, zeroAtBlocks: 2000, maxAgeDays: 30},
  limitedSupply: {maxBasisPoints: 500, minCohortSize: 5, zeroAtAvailableShare: 0.5, includesSelected: true},
  quality: {maxBasisPoints: 1500, rubricVersion: 'design-v1', maxAgeDays: 90, minRegionHeightBlocks: 8},
  maxCombinedBasisPoints: 2000,
});

function instant(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)) return NaN;
  const day = v.slice(0, 10), midnight = Date.parse(day);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return NaN;
  return Date.parse(v);
}
function policyState(p) {
  const keys = Object.keys(DEFAULT_VALUATION_POLICY);
  if (!exactKeys(p, keys) || typeof p.enabled !== 'boolean' || !safeText(p.note, 1000) ||
      keys.some(k => !['enabled', 'note'].includes(k) && p[k] !== DEFAULT_VALUATION_POLICY[k])) {
    return {...DEFAULT_VALUATION_POLICY, status: 'invalid', reason: 'Policy must match the exact approved v1 coefficients, scope and basis, with a boolean enabled switch.'};
  }
  return {...DEFAULT_VALUATION_POLICY, note: p.note, enabled: p.enabled === true, status: p.enabled ? 'enabled' : 'disabled',
    reason: p.enabled ? 'Explicitly enabled website-only advisory policy; not a change to ARM, taxes or transaction prices.' : 'Proposed policy is disabled; no premiums are applied.'};
}
const withheld = (code, reason) => ({status: 'unknown', code, reason});
const measured = (numerator, denominator, evidence) => ({status: 'eligible', numerator, denominator, evidence});

// Treat the measured distance's shortest decimal representation as the input.
// BigInt arithmetic then floors monetary results once, without multiplying cents
// through floating point or discretizing distance into whole blocks/basis points.
function decimalRatio(value) {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent), digits = BigInt(whole + fraction);
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}
function spawnRate(facts, time) {
  const s = facts.spawn, observed = instant(s.observedAt);
  if (s.status !== 'observed' || s.worldId !== facts.supply.worldId || !Number.isFinite(observed) || observed > time) {
    return withheld('spawn-unverified', 'No single verified public spawn observation in this world.');
  }
  if (time - observed > VALUATION_RULES.spawn.maxAgeDays * DAY) return withheld('spawn-stale', 'Spawn observation is older than 30 days.');
  if (!Number.isFinite(s.distanceBlocks) || s.distanceBlocks < 0) return withheld('spawn-distance-invalid', 'Spawn distance is not safely measurable.');
  const [distance, scale] = decimalRatio(Math.min(s.distanceBlocks, 2000));
  return measured(1000n * (2000n * scale - distance), 2000n * scale,
    {distanceBlocks: s.distanceBlocks, observedAt: s.observedAt, source: s.source, method: s.method});
}
function supplyRate(facts) {
  const s = facts.supply;
  // Availability TTL and valuation age are different clocks. The main gate bounds
  // saved evidence to two hours; never relabel stale availability as current here.
  if (!['observed', 'stale'].includes(s.status)) return withheld('supply-unverified', 'Supply snapshot dates are invalid or future-dated.');
  if (s.unknown !== 0) return withheld('supply-unknown', 'Every parcel in the matching cohort must have known availability.');
  if (s.total < VALUATION_RULES.limitedSupply.minCohortSize) return withheld('supply-small-cohort', 'Fewer than five matching published parcels; no supply premium.');
  return measured(500n * BigInt(Math.max(0, s.total - 2 * s.available)), BigInt(s.total),
    {total: s.total, available: s.available, unknown: s.unknown, includesSelected: true,
      worldId: s.worldId, kind: s.kind, tenure: s.tenure, observedAt: s.observedAt, listingStatus: s.status,
      source: s.source, limitation: 'Published matching parcels only, not a measure of all land or unmet demand.'});
}
function qualityRate(selected, review, structureHash, time) {
  if (review == null) return withheld('quality-unreviewed', 'No approved scored review; build quality is unknown, not poor.');
  if (typeof structureHash !== 'string' || !HASH.test(structureHash)) return withheld('quality-structure-unverified', 'No verified current structure fingerprint was supplied.');
  if (!exactKeys(review, REVIEW_KEYS) || review.propertyId !== selected.id || review.rubricVersion !== 'design-v1' ||
      review.status !== 'approved' || !['human', 'ai-assisted'].includes(review.kind) ||
      !safeText(review.reviewer, 120) || !safeText(review.summary, 1000)) {
    return withheld('quality-review-invalid', 'Review identity, approval, rubric, attribution or text is invalid.');
  }
  if (typeof review.structureHash !== 'string' || !HASH.test(review.structureHash) || review.structureHash !== structureHash) {
    return withheld('quality-structure-mismatch', 'Review is not bound to the current structure fingerprint.');
  }
  const reviewed = instant(review.reviewedAt);
  if (!Number.isFinite(reviewed) || reviewed > time) return withheld('quality-date-invalid', 'Review date is invalid or in the future.');
  if (time - reviewed > VALUATION_RULES.quality.maxAgeDays * DAY) return withheld('quality-stale', 'Scored review is older than 90 days.');
  const g = selected.geometry;
  if (!Number.isSafeInteger(g.minY) || !Number.isSafeInteger(g.maxY) || g.maxY - g.minY + 1 < 8 || area(selected) <= 0) {
    return withheld('quality-region-slice', 'Region does not contain an eight-block-high, nondegenerate volume suitable for a build review.');
  }
  if (!exactKeys(review.scores, SCORE_KEYS) || SCORE_KEYS.some(k => !Number.isInteger(review.scores[k]) || review.scores[k] < 0 || review.scores[k] > 4)) {
    return withheld('quality-scores-invalid', 'Each of the four rubric scores must be an integer from zero through four.');
  }
  if (!Array.isArray(review.evidence) || review.evidence.length < 1 || review.evidence.length > 8) {
    return withheld('quality-evidence-invalid', 'Review needs one through eight content-addressed local images.');
  }
  const seen = new Set(), evidence = [];
  for (const e of review.evidence) {
    if (!exactKeys(e, ['url', 'sha256']) || typeof e.sha256 !== 'string' || !HASH.test(e.sha256) ||
        e.url !== `/property-review-evidence/${e.sha256}.png` || seen.has(e.sha256)) {
      return withheld('quality-evidence-invalid', 'Review image paths must match their distinct declared hashes, with no external or traversal URLs.');
    }
    seen.add(e.sha256); evidence.push({url: e.url, sha256: e.sha256});
  }
  const scores = Object.fromEntries(SCORE_KEYS.map(k => [k, review.scores[k]]));
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  return measured(1500n * BigInt(Math.max(0, sum - 8)), 8n,
    {structureHash, rubricVersion: review.rubricVersion, reviewedAt: review.reviewedAt, reviewer: review.reviewer,
      kind: review.kind, status: review.status, scores, scoreTotal: sum, scoreMaximum: 16, evidence, summary: review.summary,
      limitation: 'Explicit design-rubric opinion, not a market observation or a guarantee of sale value.'});
}
function materialInput(value) {
  if (!record(value) || !cents(value.knownSubtotalCents) ||
      (value.totalCents !== null && value.totalCents !== value.knownSubtotalCents) ||
      (value.unknownCells !== undefined && (!cents(value.unknownCells) || (value.unknownCells > 0) !== (value.totalCents === null)))) return null;
  return {knownSubtotalCents: value.knownSubtotalCents, totalCents: value.totalCents};
}
function component(id, rate, assessment, hold) {
  const eligible = rate.status === 'eligible';
  const reason = hold ?? (!eligible ? rate : null);
  return {id, status: reason ? 'withheld' : 'eligible', evidenceStatus: rate.status,
    reasonCode: reason?.code ?? 'eligible', reason: reason?.reason ?? 'Evidence meets the proposed advisory rule; monetary amounts are rounded down to cents.',
    basisPoints: eligible ? Number(rate.numerator) / Number(rate.denominator) : null,
    requestedCents: !reason ? Number(BigInt(assessment) * rate.numerator / (rate.denominator * 10000n)) : null,
    appliedCents: 0, evidence: rate.evidence ?? {reasonCode: rate.code, reason: rate.reason}};
}
function allocate(requested, cap) {
  const total = requested.reduce((a, b) => a + b, 0n);
  if (total <= cap) return requested;
  const shares = requested.map(v => v * cap / total);
  let remaining = cap - shares.reduce((a, b) => a + b, 0n);
  const order = requested.map((v, i) => ({i, remainder: v * cap % total})).sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  for (const {i} of order) { if (remaining === 0n) break; shares[i]++; remaining--; }
  return shares;
}

/**
 * Pure website-only advisory estimate. No I/O, mutation, price writes or calibration.
 * policy: exact DEFAULT_VALUATION_POLICY keys/coefficients; only enabled (boolean)
 * and note (bounded plain text) vary within v1. Omitted policy = disabled.
 * context: analyzer's public spawns/roads/traffic registries; nested policy/now cannot enable this.
 * review: approved design-v1 record described in REVIEW_KEYS; integer 0..4 scores.
 * Caller must authenticate registry approvals, hash actual evidence bytes, and bind
 * materialValue/current structureHash to this parcel upstream. Schema checks cannot do that.
 * The structural hash must exclude capture time; a review can predate a repeated capture.
 * Matching supply follows analyzeProperty (includes the selected parcel). Valuation uses
 * saved reads up to two hours old (savedReadAt, or observedAt for legacy feeds),
 * independently of source mtime and the shorter availability TTL. Neither a repeated
 * read nor the appraisal claims to observe the live server's in-memory state.
 * Listing dates/status remain unchanged; listingStale/evidenceAsOf/sourceSavedAsOf
 * MUST be disclosed by UI.
 * Invalid/future or older evidence disables ALL extras. Missing component evidence
 * withholds that component, never penalizes it.
 * totalCents is the capital estimate (null for rent). baseEstimate exactly preserves
 * combinedPropertyEstimate, including partial known-material subtotals; ARM is not land-only.
 * Floor each requested component to cents, then largest-remainder apportion to the floored
 * 20% assessment cap. Equal remainders resolve spawn, limitedSupply, quality, in that order.
 * Throws on invalid catalog/identity/time, returns null totals on invalid base/overflow.
 */
export function appraiseProperty(property, catalog, materialValue, {context, policy = DEFAULT_VALUATION_POLICY, review, structureHash, now = Date.now()} = {}) {
  const time = typeof now === 'number' ? now : instant(now);
  if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) throw Error('Invalid valuation time');
  const data = validateCatalog(catalog), selected = data.properties.find(p => p.id === property?.id);
  if (!selected) throw Error('Property absent from catalog');
  const facts = analyzeProperty(selected, data, {spawns: context?.spawns, roads: context?.roads, traffic: context?.traffic, now: time});
  const policyResult = policyState(policy), materials = materialInput(materialValue);
  const baseEstimate = materials ? combinedPropertyEstimate(selected, materials) : null;
  const observed = instant(data.observedAt), expires = instant(data.expiresAt);
  const validSnapshot = Number.isFinite(observed) && Number.isFinite(expires) && expires > observed && observed <= time;
  const hasSavedRead = Object.hasOwn(data, 'savedReadAt');
  const evidenceAt = hasSavedRead ? instant(data.savedReadAt) : observed;
  const validRead = Number.isFinite(evidenceAt) && evidenceAt >= observed && evidenceAt <= time;
  const listingStale = !validSnapshot || time >= expires;
  let hold = null;
  if (selected.tenure === 'rent') hold = {code: 'rental-not-capital', reason: 'Period rent is never added to materials or capital premiums.'};
  else if (!materials) hold = {code: 'materials-invalid', reason: 'Known material subtotal is missing or invalid; no capital estimate can be combined safely.'};
  else if (!baseEstimate) hold = {code: 'base-invalid', reason: 'Assessment is missing or the combined base exceeds safe integer cents.'};
  else if (selected.priceBasis === 'unverified') hold = {code: 'assessment-unverified', reason: 'Saved assessment basis is unverified; it cannot support monetary premiums.'};
  else if (!validSnapshot) hold = {code: 'catalog-evidence-invalid', reason: 'Snapshot dates are invalid or future-dated; saved base remains visible without premiums.'};
  else if (!validRead) hold = {code: 'saved-read-invalid', reason: 'Saved-read time is invalid, predates source state or is in the future; no premiums are applied.'};
  else if (time - evidenceAt > VALUATION_RULES.maxSnapshotAgeHours * 3600000) hold = {code: 'catalog-evidence-expired', reason: 'Saved valuation evidence was last read more than two hours ago; base remains visible without premiums.'};
  else if (!policyResult.enabled) hold = {code: `policy-${policyResult.status}`, reason: policyResult.reason};

  const rates = {spawn: spawnRate(facts, time), limitedSupply: supplyRate(facts), quality: qualityRate(selected, review, structureHash, time)};
  const components = Object.fromEntries(Object.entries(rates).map(([id, rate]) => [id, component(id, rate, selected.priceCents, hold)]));
  const values = Object.values(components), requested = values.map(c => BigInt(c.requestedCents ?? 0));
  const capCents = baseEstimate ? Number(BigInt(baseEstimate.assessmentCents) * 2000n / 10000n) : null;
  let shares = capCents === null ? requested.map(() => 0n) : allocate(requested, BigInt(capCents));
  const requestedBonusCents = Number(requested.reduce((a, b) => a + b, 0n));
  let appliedBonusCents = Number(shares.reduce((a, b) => a + b, 0n));
  if (baseEstimate && BigInt(baseEstimate.cents) + BigInt(appliedBonusCents) > MAX_CENTS) {
    hold = {code: 'monetary-overflow', reason: 'Premium addition exceeds safe integer cents; all extras withheld and the unchanged base retained.'};
    shares = shares.map(() => 0n); appliedBonusCents = 0;
    for (const c of values) { c.status = 'withheld'; c.reasonCode = hold.code; c.reason = hold.reason; }
  }
  values.forEach((c, i) => {
    c.appliedCents = Number(shares[i]);
    if (c.status === 'withheld') return;
    c.status = c.appliedCents < c.requestedCents ? 'capped' : 'applied';
    c.reasonCode = c.status === 'capped' ? 'combined-cap' : c.requestedCents === 0 ? 'no-uplift' : 'applied';
    c.reason = c.status === 'capped' ? 'Proportionally reduced to the combined 20% assessment cap.' :
      c.requestedCents === 0 ? 'Evidence produces no positive uplift under this rule; there is no deduction.' : 'Applied website-only advisory premium, not a transaction price.';
  });
  return freeze({version: 1, propertyId: selected.id, analyzedAt: facts.analyzedAt, advisoryOnly: true,
    evidenceAsOf: validSnapshot && validRead ? (hasSavedRead ? data.savedReadAt : data.observedAt) : null,
    sourceSavedAsOf: validSnapshot ? data.observedAt : null, evidenceBasis: hasSavedRead ? 'saved-file-read' : 'source-mtime-fallback', listingStale,
    availabilityNotice: listingStale ? 'Listing availability has expired or is unverified. Advisory amounts use dated saved-file evidence, not live in-memory state or current availability.' : 'Saved listing availability, not live in-memory verification, a reservation or a guaranteed transaction price.',
    policy: policyResult, bonusBase: 'unchanged-arm-assessment', baseEstimate,
    assessmentCents: selected.priceCents, materialCents: materials?.knownSubtotalCents ?? null,
    requestedBonusCents, appliedBonusCents, capCents, capApplied: !hold && requestedBonusCents > capCents,
    totalCents: baseEstimate ? baseEstimate.cents + appliedBonusCents : null,
    status: hold ? 'withheld' : 'advisory', reasonCode: hold?.code ?? 'advisory', reason: hold?.reason ??
      (listingStale ? 'Bounded advisory premiums from recent saved evidence; listing availability is stale. Not an ARM price update.' : 'Bounded advisory premiums; not a market appraisal or an ARM price update.'),
    components, facts});
}
