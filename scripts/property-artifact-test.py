"""Independent complete block-artifact comparison and screenshot pixel checks.

PROPERTY_CAPTURE_DIR is the private source-evidence directory, not a public asset.
"""
import hashlib
import json
import os
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
evidence = Path(os.environ['PROPERTY_CAPTURE_DIR'])
catalog = json.loads((root/'src/data/property-catalog.json').read_text())
capture = json.loads((evidence/'block-volumes-full.json').read_text())
masks = json.loads((evidence/'native-masks.json').read_text())
sources = {r['propertyId']: r for r in capture['captures']}
assert not capture['skipped']
assert set(sources) == {p['id'] for p in catalog['properties']}
tested = cells = 0
for p in catalog['properties']:
    assert p['preview'], p['id']
    file = root/'public'/p['preview']['url'].lstrip('/')
    assert file.stem == hashlib.sha256(file.read_bytes()).hexdigest()
    obj = json.loads(file.read_text())
    raw = sources[p['id']]
    assert set(obj) == {'schemaVersion','format','propertyId','capturedAt','source','origin','size','palette','blocks'}
    for key in set(obj)-{'palette'}:
        assert obj[key] == raw[key], (p['id'], key)
    assert obj['format'] == 'plot-blocks' and obj['source'] == 'saved-world'
    assert len(obj['palette']) == len(raw['palette'])
    for row, original in zip(obj['palette'], raw['palette']):
        assert set(row) == {'material','state','color'}
        assert row['material'] == original['material'] and row['state'] == original['state']
    columns = set(map(tuple, masks[p['id']])) if p['id'] in masks else None
    points = p['geometry']['points']
    seen = set()
    for x, y, z, state in obj['blocks']:
        assert (x,y,z) not in seen
        seen.add((x,y,z))
        assert 0 <= state < len(obj['palette'])
        assert all(0 <= n < limit for n, limit in zip((x,y,z),obj['size']))
        wx, wy, wz = [n+o for n,o in zip((x,y,z),obj['origin'])]
        assert p['geometry']['minY'] <= wy <= p['geometry']['maxY']
        if columns is not None:
            assert (wx,wz) in columns
        else:
            assert min(v[0] for v in points) <= wx < max(v[0] for v in points)
            assert min(v[1] for v in points) <= wz < max(v[1] for v in points)
    tested += 1
    cells += len(obj['blocks'])

# Independent saved-chunk read by the second reviewer, not derived by the importer.
stall = sources['world:market_stall_01']
assert stall['size'] == [5,3,7]
assert stall['palette'] == [{'material':'minecraft:stripped_spruce_log','state':{'axis':'x'}}]
expected = {(x,0,z,0) for x in range(5) for z in (2,3,4)} | {(x,1,3,0) for x in range(5)}
assert set(map(tuple,stall['blocks'])) == expected
main = sources['world:c001']
assert len(main['blocks']) > main['size'][0]*main['size'][2]*10, 'roof-only regression'
assert tested == 53 and cells == 708103
print(f'PASS {tested} exact block/palette artifacts; {cells} cells; native polygon masks; independent 20-cell stall fixture')

manifest = json.loads((root/'public/property-map/world/manifest.json').read_text())
for r in manifest['records']:
    file = root/'public/property-map/world'/r['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == r['sha256']
print(f"PASS {len(manifest['records'])} terrain asset hashes")

qa = Path(os.environ['PROPERTY_QA_DIR'])
for name in ['desktop','mobile']:
    for kind in ['surface','height-cut','map']:
        image = Image.open(qa/f'{name}-{kind}.png').convert('RGB')
        pixels = list(image.getdata())
        unique = len(set(pixels))
        background = pixels[0]
        changed = sum(sum(abs(a-b) for a,b in zip(p,background)) > 30 for p in pixels)
        assert unique > 250 and changed > len(pixels)*.015, (name,kind,unique,changed)
        print(f'PASS {name}/{kind}: {image.width}x{image.height}, {unique} colors, {changed}/{len(pixels)} non-background pixels')
