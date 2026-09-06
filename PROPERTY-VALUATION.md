# Property Advisory Policy

2026-09-06. Owner-approved coefficients; not a calibrated sale-price model.
Public implementation: `src/lib/property-valuation.mjs`. No price, account,
permission, tax or net-worth writes occur in the website.

## Calculation

- Base: unchanged server assessment plus the known captured material subtotal.
  Assessment is not proven land-only. Terrain and existing BOM conventions are
  included; unknown/custom materials stay unpriced. This can overlap build value.
- Spawn: up to 10% of assessment, linearly reducing to zero at 2,000 blocks.
  Same-world, nearest polygon boundary distance, not a walking route.
- Limited supply: up to 5% of assessment. Same world/type/tenure, at least five
  published parcels, all availability known. Zero at >=50% available; maximum
  at zero available. Includes the selected parcel. Not demand or all-world land.
- Design: up to 15% of assessment. Four explicit exterior-review scores 0..4:
  composition, detailing, visible completion, parcel-edge/landscape treatment.
  Totals <=8 earn no uplift; totals 9..16 scale to 15%. No negative adjustment.
  Expensive blocks, palette size and block count do not establish beauty.
- Combined adjustments are capped at 20% of assessment, never materials.
  Integer-cent arithmetic and proportional cap allocation keep the breakdown
  exactly equal to the displayed total. Period rent is never capitalized.

The first review batch has five AI-assisted exterior ratings and two actual
captured views per rating. Eleven empty/unclear freeholds have no rating, not a
zero-quality judgment. Interior finish, usable access, road frontage and traffic
are not inferred. Reviews expire after 90 days or a structural-hash change.
An ordinary recapture does not expire a review merely because time, lighting or
palette order changed. Changed blocks, states, coordinates or bounds do.

## Freshness And Publication

Hourly export reads saved world and ARM/WG data without loading game chunks.
Saved-file modification, stable read, mesh retrieval, worth export and publication
times are separate. No timestamp proves current in-memory game ownership.
Advisory evidence expires after two hours without a verified saved-state read;
listing availability retains its shorter TTL and in-game verification warning.
Missing, expired or invalid evidence withholds bonuses rather than guessing.
The new snapshots hostname exposes only content-addressed public artifacts and
the current public manifest. No tenant UUIDs, inventories or player trails.

Residential r plots have owner-reported underground terrain contamination.
Their website totals are provisional with a visible warning. They must not feed
new official material/design net-worth allowances before scoped verification and
recapture. No world cleanup is performed by this website.

## Net Worth Boundary

The owner subsequently requested admin/player net-worth integration. That is a
separate private UUID-keyed consumer of this same formula, not a browser total
copied into a balance. Existing property allowance is 70% of ARM assessment;
the new property component must replace the old one exactly once. Rentals,
system holdings, ambiguous ownership and overlapping captures cannot create
additional capital. Current export inconsistencies are documented in the server
repo's `docs/research/realty-20260906/NETWORTH-INTEGRATION.md`.

No roads, corner-plot, foot-traffic or comparable-sale monetary adjustments are
implemented without reliable evidence. Future work must version coefficients
and historical series, not backfill new estimates as past sales.

## Verification And Rollback

Run the core/build/mesh/runtime/appraisal/valuation/structure and quality-review
Node suites, TypeScript, Astro build, and desktop/mobile browser checks before
publication. Quality tests read every approved evidence image's actual bytes.
Clock, stale/missing evidence, cap rounding, rentals, identity and changed-build
cases are explicit tests. Browser tests include card/detail equality and a pinned
open-detail generation during refresh.

Setting the policy's enabled field false removes all extra premiums. Reverting
the website release restores its prior presentation and proxy. Exporter code
rollback does not restore player data, ownership, world files or balances.
