# Property Desk: Public Snapshot Release

2026-09-06, tracker #299. Owner requested publication on the existing site and
approved Three.js/Lucide and public property ownership. No Minecraft changes.

## Release Scope

`https://www.prosperitysmp.com/properties`, linked in the existing footer. Static
Astro/Vercel application, not a Realty fork, login portal or economy writer.
Search, filters, weekly rent comparison, shortlist, three-property comparison,
map, owner holdings and four verified historical purchase records.

53 ARM listings with WorldGuard boundaries; 53 blocks-only saved-world captures,
708,103 occupied cells, 213 chunks read. All 32 polygon masks were produced by
the installed WorldGuard 7.0.18 boundary implementation. Captures contain block
identifiers/states/coordinates, never block-entity NBT, contents, signs, books,
profiles, permissions, UUIDs, player markers or secrets. Public ownership was
approved; tenant identities are withheld.

The viewer shows blocks throughout the captured volume, not a roof height map.
Shapes/colors are simplified cubes. Height controls change the view only;
valuation always uses the full capture. Four subregions have actual one-block
vertical bounds: a full apartment cannot be invented outside those boundaries.

Material estimates use 1,524 prices from the public worth export and the real
server's block/state-to-item BOM mapping. Unknown/custom items remain unpriced.
The subtotal includes natural terrain. It is neither land value, asking price,
recoverable item value nor a paid-paste quote. Existing multi-cell BOM conventions
(doors/beds) are disclosed, not silently rewritten. No money/networth/tax change.

## Freshness And Limits

This is a saved-state snapshot, not a live stock or availability API. ARM/WG disk
state observation and capture/read times are distinct. Worth export is dated
2026-09-06T18:00:00Z. Stale listings and expired leases remain visibly qualified;
the website cannot reserve or purchase. New capture requests are not automatic.
The requested in-game refresh command is NOT installed. No `/property` collision:
that command already belongs to ProsperityNPC. Native refresh, ongoing history
and auctions remain separate work on #299/#171, not fabricated website features.

## Verification

- 28 Node tests: 15 real listing contracts, 13 block/value contracts.
- All 53 artifact hashes, complete cells/states and native masks independently
  compared against the saved capture. 708,103 cells match. Separate 20-cell stall
  fixture matches an independent read; c001 is not a top-column sample.
- Desktop 1440x1000 and mobile 390x844: navigation, filters, saved state, comparison
  limit, full capture, height crop without valuation change, orbit pixel change,
  disposal, history/holders, no page errors or horizontal overflow. 503 feed test.
- Six canvas screenshots pass nonblank pixel/color checks.
- Build/type/release and live publication results are recorded in the tracker;
  do not infer a deployment merely from this source file.

## Build And Rollback

Prepared in an isolated worktree from production/main revision
`309d622c257ed1a2c3e4913cf5595122cb00a873`. Unrelated dirty pages, draft commerce
routes, copy edits and global header changes are NOT included. Only referenced
hash-named full previews are copied, not obsolete roof samples. New headers apply
to property paths; other routes retain their existing policy.

`npm ci`, `npm run build`. The public build is owner-approved by default;
`PROPERTY_DESK_RELEASE=held` disables page/feed/footer in the next build. This
flag is not access control for public artifacts. A full rollback means revert
the property release commit/redeploy the prior Vercel deployment, which also
removes new artifact paths. Downloaded public data cannot be recalled.

The existing Astro 4 toolchain still has 12 npm audit findings. No major framework
upgrade is bundled here. The new release has no SSR, middleware auth, server
islands, uploads, runtime image proxy or request-derived `define:vars`; captured
data is parsed JSON and text is escaped. Development stays loopback-only. This
limits the new route's exposure, not a claim that the old dependency stack is
patched. Track the stack upgrade separately. Examples of reviewed applicability:
[define:vars advisory](https://github.com/advisories/GHSA-j687-52p2-xcff),
[development file read](https://github.com/advisories/GHSA-x3h8-62x9-952g).

Source captures and private verification evidence stay outside this website
release. Reproduction scripts require explicitly provided local source artifacts.
