# Property Fidelity Follow-Up

2026-09-06, #299, owner requested fixes to the public Property Desk. Based on
production/main `16d2087847dc7ac9e396079e3c943ed1e28ba458`, isolated worktree.
This file describes the candidate, not proof of deployment.

## Changes

- Properties in the shared main and mobile navigation, same release gate as footer.
  Desktop breakpoint now 1280px, verified at 8 widths; labels never collide.
- Detailed BlueMap 5.23 triangle geometry, original UVs, PNG textures, alpha,
  tint and baked AO/light replace the flat-color instanced cubes. No new package.
  Bounds are clipped before publication using native WG polygon columns and
  the actual parcel's Y interval. Missing polygon masks fail closed before writes.
- Camera fits all eight bounding-box corners, not just the longest axis.
- Purchase plot headline now sums current server assessment and known material
  worth; both components remain visible. Asking price is not overwritten. Rentals
  keep rent separate from capital value. Unknown materials remain explicit.
  This is display-only, not an ARM, money, net-worth, tax or land-value change.

## Evidence

53 meshes / 499,419 triangles, 784,677 fractional-coordinate vertices, 27
transparent material groups. 379 public content-hashed files / 5,031,147 bytes;
largest compressed mesh 1,345,793 bytes. Six bounded texture requests at a time.
All geometries/PNGs/meta hashes checked, expanded bytes/counts/ranges validated,
native-mask vertices tested; neighbors/private data not exported. Source: 88
public high-resolution map tiles, gallery/settings hashes and acquisition records
in the private research cache. Full saved-world block captures/worth unchanged.

37 Node tests (existing contracts plus actual-source PRBM, clipping/interpolation,
missing-mask and malformed-stream tests, value-sum tests); TypeScript passes.
Desktop/mobile browser matrices exercise multiple actual builds, orbit, height,
unchanged material totals, corrupt-mesh fallback, filters, owners and lifecycle.
Screenshots inspected, including c001 tower, c006 office, r001 estate, apartment
slice and stall. Held/public real build gates plus negative mutations pass.
Independent review found a missing-mask fail-open in the exporter; fixed and
re-verified across all 32 polygons and 21 cuboids. Record:
`docs/research/realty-20260906/HIRES-CODE-REVIEW.md` in server-planning repo.

## Honest Limits

BlueMap is an exterior/rendered-surface snapshot, not a full schematic. Hidden
interiors, cave faces and some decorations may be absent. Short apartment regions
remain slices, not a fabricated whole building. Website says this. Mesh acquisition
time and separate full material-capture time are distinct. Animations show one
real frame. Minecraft texture detail is retained, not AI upscaled.

Combined value is assessment plus material worth, not a certified appraisal:
assessment may already reflect improvements, material tally includes natural
terrain, and labor/scarcity are not priced. No value is fabricated to fill gaps.

## Publish / Rollback

Scoped website-only PR; no Minecraft, shared dev, nginx, database or dependency
changes. Rollback to `16d2087` removes this follow-up. Static assets are public and
hash-addressed; there is no claim downloaded data can be recalled.
Owner additionally requested automatic background refresh: this is separate
in-flight exporter work, NOT implemented by browser reload or this release.
