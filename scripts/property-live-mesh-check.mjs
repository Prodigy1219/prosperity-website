// Release proof: public content-addressed bytes, not exporter log claims.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {validateRuntimeSnapshot} from '../src/lib/property-runtime.mjs';
import {validateMesh,meshVertices,boundedBytes,meshPath} from '../src/lib/property-mesh.mjs';
import {triangleArea} from './property-mesh-core.mjs';

const base=process.env.PROPERTY_BASE_URL||'https://www.prosperitysmp.com';
const res=await fetch(base+'/property-runtime/current.json',{signal:AbortSignal.timeout(20000),redirect:'error'});
assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
const snapshot=validateRuntimeSnapshot(JSON.parse(Buffer.from(await boundedBytes(res.body,8e6)).toString('utf8')));
const sha=b=>createHash('sha256').update(b).digest('hex'),cache=new Map();
async function asset(url,extension,limit){
  assert.ok(meshPath(url,extension));
  if(cache.has(url))return cache.get(url);
  const r=await fetch(base+url,{signal:AbortSignal.timeout(20000),redirect:'error'});
  assert.equal(r.status,200,url);const bytes=Buffer.from(await boundedBytes(r.body,limit));
  assert.equal(url.split('/').at(-1),sha(bytes)+'.'+extension,url);
  cache.set(url,bytes);return bytes;
}
const results=[];
for(const p of snapshot.catalog.properties){
  const url=snapshot.meshes[p.id];
  const meta=validateMesh(JSON.parse((await asset(url,'json',2e6)).toString('utf8')),p.id);
  const compressed=await asset(meta.buffer,'mesh',20e6);
  const vertices=meshVertices(gunzipSync(compressed,{maxOutputLength:meta.vertexCount*32}),meta);
  for(const g of meta.groups){
    const png=await asset(g.texture.url,'png',500000);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
  if(p.id==='world:c001'){
    let minX=Infinity,maxX=-Infinity,westArea=0;
    for(let i=0;i<vertices.length;i+=24){
      const face=[0,8,16].map(j=>[vertices[i+j]+meta.origin[0],vertices[i+j+1]+meta.origin[1],vertices[i+j+2]+meta.origin[2]]);
      for(const v of face){minX=Math.min(minX,v[0]);maxX=Math.max(maxX,v[0]);}
      if(face.every(v=>Math.abs(v[0]-417)<1e-5&&v[1]>=78)){
        const [a,b,c]=face;
        assert.ok((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1])<0,'west wall faces outward');
        westArea+=triangleArea(...face);
      }
    }
    assert.deepEqual(meta.origin,[416,-64,-138]);assert.deepEqual(meta.size,[18,196,21]);
    assert.equal(minX,416,'the old exporter starts at418');assert.equal(maxX,434);
    assert.ok(Math.abs(westArea-352)<1e-5,'full measured west wall restored');
    results.push({id:p.id,triangles:meta.vertexCount/3,minX,maxX,westArea,metaUrl:url,buffer:meta.buffer});
  }
}
assert.equal(results.length,1);
console.log(JSON.stringify({publishedAt:snapshot.publishedAt,
  properties:snapshot.catalog.properties.length,assetsVerified:cache.size,results},null,2));
