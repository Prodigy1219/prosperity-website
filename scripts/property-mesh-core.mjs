// BlueMap v5.23 PRBM format: PRBMWriter.java / PRBMLoader.js (MIT).
// Decode only its emitted seven-attribute, non-indexed little-endian profile.
// No NBT, names, entity records or arbitrary metadata enter the public artifact.
export function decodePrbm(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || bytes.length > 32000000 || v.getUint8(0) !== 1 || v.getUint8(1) !== 7)
    throw Error('Unsupported PRBM header');
  const count = v.getUint8(2) + (v.getUint8(3) << 8) + (v.getUint8(4) << 16);
  if (!count || count % 3 || count > 1200000 || v.getUint8(5) || v.getUint8(6) || v.getUint8(7)) throw Error('PRBM size');
  const expected = { position:[3,1], normal:[3,3], color:[3,7], uv:[2,1], ao:[1,7], blocklight:[1,3], sunlight:[1,3] };
  let off=8; const attrs={};
  const align=()=>{off=Math.ceil(off/4)*4;};
  for(let a=0;a<7;a++) {
    let name='';
    for(let i=0;;i++) { if(i>24||off>=bytes.length)throw Error('PRBM attribute name');const b=v.getUint8(off++);if(!b)break;name+=String.fromCharCode(b); }
    if(off>=bytes.length)throw Error('PRBM flags');
    const flags=v.getUint8(off++), card=((flags>>4)&3)+1, enc=flags&15;
    if(attrs[name]||!expected[name]||expected[name][0]!==card||expected[name][1]!==enc)throw Error('PRBM attribute profile');
    align(); const width=enc===1?4:1, len=count*card;
    if(off+len*width>bytes.length)throw Error('Truncated PRBM');
    const out=new Float32Array(len);
    for(let i=0;i<len;i++) {
      const n=enc===1?v.getFloat32(off+i*4,true):enc===3?v.getInt8(off+i):v.getUint8(off+i);
      if(!Number.isFinite(n))throw Error('PRBM non-finite');
      out[i]=(flags&64)?(enc===3?Math.max(-1,n/127):n/255):n;
    }
    attrs[name]=out;off+=len*width;
  }
  align(); const groups=[];let covered=0;
  for(;;){
    if(off+4>bytes.length)throw Error('PRBM missing group terminator');
    const material=v.getInt32(off,true);off+=4;if(material===-1)break;
    if(off+8>bytes.length)throw Error('PRBM truncated group');
    const start=v.getInt32(off,true),size=v.getInt32(off+4,true);off+=8;
    if(material<0||material>10000||start!==covered||size<=0||size%3||start+size>count)throw Error('PRBM group bounds');
    groups.push({material,start,count:size});covered+=size;
  }
  if(covered!==count||off!==bytes.length)throw Error('PRBM group coverage');
  return {count,attrs,groups};
}

// Sutherland-Hodgman clipping to one axis-aligned cell prism; interpolate UV/color
// at new vertices, preserving the renderer's actual triangles (no voxel rebuild).
export function clipBox(poly, min, max) {
  for(let axis=0;axis<3;axis++)for(const [edge,sign] of [[min[axis],1],[max[axis],-1]]) {
    const out=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
      if(da>=0)out.push(a);
      if((da>=0)!==(db>=0)) {const t=da/(da-db);const p=a.map((n,j)=>n+(b[j]-n)*t);p[axis]=edge;out.push(p);}
    }
    poly=out;if(poly.length<3)return [];
  }
  return poly;
}

export function triangleArea(a,b,c) {
  const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
  return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
}

export function clipToColumns(triangle, mask, minY, maxY) {
  if(triangle.every(v=>v[1]<minY)||triangle.every(v=>v[1]>maxY))return [];
  const low=[0,2].map(a=>Math.floor(Math.min(...triangle.map(v=>v[a]))-1e-6));
  const high=[0,2].map(a=>Math.floor(Math.max(...triangle.map(v=>v[a]))+1e-6));
  if((high[0]-low[0]+1)*(high[1]-low[1]+1)>256)throw Error('Unexpected large source triangle');
  const result=[],seen=new Set();
  for(let x=low[0];x<=high[0];x++)for(let z=low[1];z<=high[1];z++) {
    if(!mask.has(`${x},${z}`))continue;
    const p=clipBox(triangle,[x,minY,z],[x+1,maxY,z+1]);
    for(let i=1;i<p.length-1;i++) {
      const tri=[p[0],p[i],p[i+1]];
      if(triangleArea(...tri)<1e-9)continue;
      const key=tri.map(v=>v.map(n=>n.toFixed(6)).join(',')).sort().join(';');
      if(!seen.has(key)){seen.add(key);result.push(tri);}
    }
  }
  return result;
}

export function tilePath(x,z) {
  const part=n=>(n<0?'-':'')+String(Math.abs(n)).split('').join('/');
  return `x${part(x)}/z${part(z)}.prbm`;
}

export function parcelColumns(property,capture,masks,sourceProperty) {
  const g=sourceProperty?.geometry;
  if(sourceProperty?.propertyRef!==property.id||!g||!['cuboid','poly2d'].includes(g.type))throw Error('Missing authoritative region shape');
  const [x,y,z]=capture.origin,[sx,sy,sz]=capture.size;
  let columns;
  if(g.type==='cuboid') {
    if(g.min.x!==x||g.min.y!==y||g.min.z!==z||g.max.x!==x+sx-1||g.max.y!==y+sy-1||g.max.z!==z+sz-1)throw Error('Cuboid capture drift');
    columns=Array.from({length:sx*sz},(_,i)=>[x+Math.floor(i/sz),z+i%sz]);
  }else{
    if(g['min-y']!==y||g['max-y']!==y+sy-1||JSON.stringify(g.points.map(v=>[v.x,v.z]))!==JSON.stringify(property.geometry.points))throw Error('Polygon capture drift');
    columns=masks[property.id];if(!Array.isArray(columns)||!columns.length)throw Error('Missing native polygon mask');
  }
  const seen=new Set();
  for(const c of columns){
    if(!Array.isArray(c)||c.length!==2||!c.every(Number.isInteger)||c[0]<x||c[0]>=x+sx||c[1]<z||c[1]>=z+sz||seen.has(c.join(',')))throw Error('Invalid native columns');
    seen.add(c.join(','));
  }
  return seen;
}
