import {validateBlockCapture} from './property-build.mjs';

// Only structural content participates. Lighting, palette order and capture time
// change on refresh even when the player's build has not changed.
export function structureIdentity(raw, property) {
  const c = validateBlockCapture(raw);
  if (c.propertyId !== property?.id || !Array.isArray(property.geometry?.points)) throw Error('Structure identity mismatch');
  const points = property.geometry.points.map(p => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isSafeInteger)) throw Error('Invalid parcel mask');
    return [...p];
  });
  if (points.length > 1 && JSON.stringify(points[0]) === JSON.stringify(points.at(-1))) points.pop();
  if (points.length < 3 || points.length > 256) throw Error('Invalid parcel mask');
  const rotations = [];
  for (const order of [points, [...points].reverse()]) {
    let start = 0;
    for (let i = 1; i < order.length; i++) if (order[i][0] < order[start][0] || order[i][0] === order[start][0] && order[i][1] < order[start][1]) start = i;
    rotations.push(JSON.stringify([...order.slice(start), ...order.slice(0, start)]));
  }
  const palette = c.palette.map(p => [p.material, Object.entries(p.state).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
  const blocks = [...c.blocks].sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]).map(b => [...b.slice(0,3), ...palette[b[3]]]);
  return JSON.stringify({version:1, propertyId:c.propertyId, origin:c.origin, size:c.size,
    minY:property.geometry.minY, maxY:property.geometry.maxY, mask:JSON.parse(rotations.sort()[0]), blocks});
}

export async function structureHash(raw, property) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(structureIdentity(raw, property)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
}
