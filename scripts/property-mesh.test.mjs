import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {decodePrbm,clipBox,clipToColumns,triangleArea,tilePath,parcelColumns} from './property-mesh-core.mjs';
import {validateMesh,meshVertices,meshPath,boundedBytes} from '../src/lib/property-mesh.mjs';
const manifest=JSON.parse(fs.readFileSync('src/data/property-mesh-manifest.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=url=>{const bytes=fs.readFileSync('public'+url);assert.ok(url.includes('/'+sha(bytes)+'.'));return bytes;};
const metaFor=id=>validateMesh(JSON.parse(read(manifest.properties[id])),id);
const masks=process.env.PROPERTY_NATIVE_MASKS?JSON.parse(fs.readFileSync(process.env.PROPERTY_NATIVE_MASKS)):null;
test('tile addresses match upstream signed split-digit grammar',()=>{
  assert.equal(tilePath(13,-5),'x1/3/z-5.prbm');assert.equal(tilePath(-104,0),'x-1/0/4/z0.prbm');
});
test('real PRBM source decoded, truncated/unsupported streams rejected',()=>{
  const cache=process.env.PROPERTY_MESH_CACHE;assert.ok(cache,'Provide captured BlueMap corpus');
  const bytes=fs.readFileSync(cache+'/tiles_0_x1_3_z-5.prbm');const d=decodePrbm(bytes);
  assert.equal(d.count,173496);assert.equal(d.groups.reduce((n,g)=>n+g.count,0),d.count);
  assert.ok(d.attrs.position.some(n=>n%1!==0),'actual sub-block shapes');
  assert.ok(d.attrs.uv.some(n=>n!==0&&n!==1),'actual UVs');
  assert.throws(()=>decodePrbm(bytes.subarray(0,-1)));
  const bad=Buffer.from(bytes);bad[1]=135;assert.throws(()=>decodePrbm(bad));
  const nonfinite=Buffer.from(bytes);nonfinite.writeFloatLE(NaN,20);assert.throws(()=>decodePrbm(nonfinite));
});
test('box clipping creates correct UV/color interpolated edge, retains area',()=>{
  const tri=[[-1,0,0,0,0,.2,.4,.6],[1,0,0,1,0,.4,.6,.8],[0,0,1,.5,1,.3,.5,.7]];
  const clipped=clipBox(tri,[0,-1,0],[1,1,1]);
  assert.ok(clipped.some(p=>p[0]===0&&p[2]===0&&Math.abs(p[3]-.5)<1e-9&&Math.abs(p[5]-.3)<1e-9));
  let area=0;for(let i=1;i<clipped.length-1;i++)area+=triangleArea(clipped[0],clipped[i],clipped[i+1]);assert.equal(area,.5);
});
test('native column mask cuts crossing triangles, holes and Y; no centroid shortcut',()=>{
  const tri=[[0,1,0,0,0,1,1,1],[3,1,0,1,0,1,1,1],[0,1,3,0,1,1,1,1]];
  const cut=clipToColumns(tri,new Set(['0,0','2,0']),0,2);
  assert.ok(cut.length>1);for(const t of cut)for(const v of t)assert.ok(v[0]<=1||v[0]>=2);
  assert.equal(clipToColumns(tri,new Set(['0,0']),2,3).length,0);
  const vertical=[[1,0,0,0,0,1,1,1],[1,1,0,0,1,1,1,1],[1,0,1,1,0,1,1,1]];
  assert.equal(clipToColumns(vertical,new Set(['0,0','1,0']),0,1).length,1,'shared plane not duplicated');
});
test('real polygon missing mask fails closed; only authoritative cuboid may use rectangle',()=>{
  const source=JSON.parse(fs.readFileSync(process.env.PROPERTY_INPUT_FIXTURE)).properties;
  const props=JSON.parse(fs.readFileSync('src/data/property-catalog.json')).properties;
  for(const id of ['world:apt_01','world:c001']){
    const p=props.find(p=>p.id===id),capture=JSON.parse(fs.readFileSync('public'+p.preview.url)),s=source.find(s=>s.propertyRef===id);
    const columns=parcelColumns(p,capture,masks,s);assert.ok(columns.size);
    if(id==='world:apt_01'){
      assert.throws(()=>parcelColumns(p,capture,{},s),/Missing native polygon/);
      const b=structuredClone(masks);b[id].push(b[id][0]);assert.throws(()=>parcelColumns(p,capture,b,s),/Invalid native columns/);
      const tri=[[480.1,78.2,-212.9,0,0,1,1,1],[480.9,78.2,-212.9,1,0,1,1,1],[480.1,78.2,-212.1,0,1,1,1,1]];
      assert.equal(clipToColumns(tri,columns,78,83).length,0,'outside native parcel');
    }else assert.ok(parcelColumns(p,capture,{},s).size);
    assert.throws(()=>parcelColumns(p,capture,masks,undefined),/authoritative/);
  }
});
test('all 53 real assets: hashes, lengths, materials, finite bounds and native mask',()=>{
  assert.equal(Object.keys(manifest.properties).length,53);assert.ok(masks,'Provide native masks');
  let fractional=0,transparent=0,triangles=0;
  for(const id of Object.keys(manifest.properties)){
    const meta=metaFor(id),data=meshVertices(gunzipSync(read(meta.buffer)),meta);
    const mask=masks[id]?new Set(masks[id].map(p=>p.join(','))):null;
    for(const g of meta.groups){const png=read(g.texture.url);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');if(g.texture.transparent)transparent++;}
    for(let i=0;i<data.length;i+=8){
      if(data[i]%1||data[i+1]%1||data[i+2]%1)fractional++;
      if(mask){const x=data[i]+meta.origin[0],z=data[i+2]+meta.origin[2];let inMask=false;
        for(const dx of [-.0001,.0001])for(const dz of [-.0001,.0001])if(mask.has(`${Math.floor(x+dx)},${Math.floor(z+dz)}`))inMask=true;
        assert.ok(inMask,`${id} vertex outside native columns`);}
    }
    triangles+=meta.vertexCount/3;
  }
  assert.ok(fractional>10000,'must retain fine geometry');assert.ok(transparent>5,'must retain glass/transparency');
  console.log({triangles,fractional,transparent});
});
test('metadata rejects foreign paths, wrong identity, missing triangles and invalid fields',()=>{
  const good=JSON.parse(read(manifest.properties['world:c001']));
  assert.equal(meshPath('https://bad.example/x.json','json'),false);
  assert.throws(()=>validateMesh(good,'world:c002'));
  for(const modify of [m=>m.groups[0].count-=3,m=>m.buffer='/private/data',m=>m.groups[0].texture.frames=0,m=>m.size[1]=Infinity,m=>m.vertexCount=1500003]){const m=structuredClone(good);modify(m);assert.throws(()=>validateMesh(m,'world:c001'));}
  assert.throws(()=>meshVertices(new Uint8Array(8),metaFor('world:c001')));
});
test('stream budget is enforced without trusting Content-Length',async()=>{
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(11));c.close();}});
  await assert.rejects(()=>boundedBytes(stream,10),/budget/);
});
