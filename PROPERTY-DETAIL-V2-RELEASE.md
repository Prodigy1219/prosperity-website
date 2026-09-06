# Property Detail V2: Verification

2026-09-06. Owner-approved release, PR5, branch
`codex/property-valuation-detail-v2`, isolated worktree
`S:/prosperity-property-release-20260906`. Previous production `10f6bc40` is the
website rollback base. This record describes pre-publication checks; the final
public URL, commit and runtime verification are recorded in the server repo at
`docs/research/realty-20260906/DETAIL-V2-PUBLIC-RESULT.md`.

## Included

- Exact BlueMap hires tile selection: inverse of its +2 X/Z translation.
  c001 previously selected x tile13 only; it needs12 and13. The corrected
  mesh starts at x416, not418, with103,082 triangles instead of97,857.
  Restores5,225 triangles, including352 square blocks of west-facing wall.
  The ARM/WG bounds, saved block capture, material worth and review fingerprint
  are unchanged. Regenerated53 previews; retained28 old hash assets for clients.
- Distance-only proximity rating and rank; uncapped percentage, assessment
  basis and post-cap dollar bonus shown separately. Real c001 ranks1/7 in its
  commercial cohort and is nearer spawn than c006.
- Parcel dimensions, normalized configured assessment benchmarks and exact
  sensitivity recalculations from the existing shared appraisal core.
- Detailed capture observations and seven material-value categories, whose
  cents sum exactly to the existing full material subtotal. No heuristic beauty
  bonus or automatic terrain discount. Missing evidence is explicitly missing.

No dependencies, gameplay, money, taxes, ownership, inventory or moderation
changes. Admin/private net-worth candidates are separate and not live.

## Verification Actually Run

Parent:204/204 Node tests, zero skipped, including network capture checks;
TypeScript passed; Astro production build passed (10 pages). Existing large
Three.js-containing bundle warning remains:764.34kB raw /206.04kB gzip.

The first combined test invocation omitted required corpus environment variables
and failed four mesh fixtures. With the actual captured inputs provided, every
fixture passed; no rejection was weakened or skipped. Reproduce from this tree:

```powershell
$env:PROPERTY_MESH_CACHE='S:/season-0-economy-server/docs/research/realty-20260906/hires-cache'
$env:PROPERTY_NATIVE_MASKS='S:/season-0-economy-server/docs/research/realty-20260906/native-masks.json'
$env:PROPERTY_INPUT_FIXTURE='S:/season-0-economy-server/docs/research/realty-20260906/public-input-fixture.json'
$env:PROPERTY_CAPTURE_ANALYTICS_LIVE='1'
node --test scripts/*.test.mjs src/lib/property-dossier.test.mjs src/lib/property-capture-analytics.test.mjs
npx tsc --noEmit
npm run build
```

Built-preview browser matrices at localhost4327 passed desktop1440x1000 and
mobile390x844. Screenshots inspected: repaired c001 exterior, proximity report,
material table. Nonblank PNG pixels1119/568 sampled colors; orbit changes canvas;
category subtotal2154498cents; c001/c006 order; ore warning; no JS errors or
dialog/document horizontal overflow. Peer table has intentional horizontal scroll.
Fixed a mobile count wrap found in the first visual pass; reran both viewports.

Evidence folders under Windows `%TEMP%`:
- `property-detail-v2-22uSn4`: final detail matrix/screenshots/results.
- `property-advisory-qa-1NZf6v`: built appraisal matrix, card/detail parity,
  combined cap, pinned open-detail refresh and rental separation.

The existing runtime browser matrix also passed after narrowing its legacy
single-table selector to the appraisal table:53 properties,262 runtime asset
requests, textured render/orbit, visibility refresh, pinned detail, coherent
reopen, malformed/older generation rejection and nonoverlapping polls. Price
assertions were retained, including c006 $40,441.69 and r008 $70,285.27 for the
dated fixture. No production endpoint or page was changed by these tests.

The local detail matrix uses real but dated bundled inputs, so expired bonuses
are correctly absent. The separately verified current public generation still
has fresh policy evidence. Do not compare the two amounts as a calculation bug.

## Exporter Deployment

Updating only the website fallback does not fix a subsequently fetched runtime
mesh. The separate
reviewed delivery is `deploy/property-mesh-offset-20260906/` in the server repo.
It changes two source files and their two pin/provenance files, guards all19
installed hashes, and retains an exact old-code backup. No Minecraft restart.

Final manifest SHA-256:
`2dce364db2a65536aecf5144bd0900d9145cfa34d5d8acaaea4a72fd37a20040`.
Agent:13/13 real Linux isolated transaction cases and60 syntax checks passed;
parent reviewed the transaction source and final isolated report. Owner then
explicitly approved release. Parent revalidated the live baseline, ran the
read-only dry-run and applied the exact manifest successfully. Retained backup:
`/opt/prosperity-property-export.mesh-offset-backup-d_1p5l5u`.

The first capture stopped safely at block reading17:10:54CDT; the world region
file mtime was17:10:53, consistent with the source-change guard. Child stderr was
not retained by the existing runner, so the exact exception is unknown. No
validation was weakened. Confirmed terminal state before one bounded retry.
Retry completed17:17:00CDT in275seconds,53properties/432assets, peak547487744bytes;
published manifest hash31db0d6a1a2a4fb8761bb311b445b2737df862c738fca8260e3cacb807fdb332.

`scripts/property-live-mesh-check.mjs` independently reads public geometry and
texture bytes, hashes them and checks c001's west extent/winding/area. It failed
against the old public generation at minX418, as intended. Final release requires
that byte check plus desktop/mobile public browser verification, not merely a
successful exporter exit. See the definitive live result record above.

Parent public byte check passed on generation22:16:27.350UTC:53properties,
379unique mesh-metadata/buffer/texture hashes; c001103082triangles,
minX416/maxX434, outward west-wall area352. Its metadata is
`9a9a41928868d4653219e1cbf3904a46d6b99d5715e944b79443bef1cdb398d2.json`;
buffer`c3ba5d7f94455df5e5861d73634b6c0f854b43ea6fc34f07001cd012208b251c.mesh`.

## Rollback

Exporter: use this upgrade's printed pre-change backup, not the older structure
upgrade backup. Confirm exporter inactive, hold its timer and shared lock,
restore precisely the four files, verify all19 hashes and resume prior timer
state. Preserve the last good public generation. A bad capture does not replace
the public manifest. Follow the applier's retained-lock failure instructions.

Website: revert this feature's reviewed release to main10f6bc40. New diagnostics
are read-only. Retain content-addressed old assets during rollout. Existing
price policy can be disabled independently; no player data rollback is needed.
