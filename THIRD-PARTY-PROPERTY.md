# Property Preview Sources

The detailed preview uses BlueMap 5.23 rendered triangles from the server's public
map, not a voxel/cube reconstruction. PRBM decoding, UV/texture handling and baked
lighting follow BlueMap's MIT-licensed format and renderer. The complete notice is
in `licenses/BlueMap-MIT.txt`.

Primary source: https://github.com/BlueMap-Minecraft/BlueMap/tree/v5.23
(`PRBMWriter`, `PRBMLoader`, `Map.createHiresMaterial`, hires shaders).
No DemocracyCraft Realty application source is used.

Minecraft textures remain Minecraft assets, used to display this server's builds.
Only referenced standard block/static block-entity PNGs are projected; no player
feed, profile, map-item textures, inventory payload, sign text or entity records.
Texture IDs are remapped to content hashes, not source resource metadata.

Map geometry is a rendered-surface snapshot, NOT a full schematic. BlueMap omits
occluded/cave surfaces, and some decorative materials are deliberately excluded.
Parcel clipping preserves actual geometry/UV/light and publishes no neighboring
parcel volume. Y controls do not invent cut faces or rooms hidden in the source.
Acquisition time is displayed, not misrepresented as an in-game capture time.

The full saved-world block capture remains a separate artifact for material counts
and worth. No visual clipping changes it; no map triangles are used as block counts.
