// Read public BlueMap assets only. No world/server writes, forced renders or feeds.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {decodePrbm,clipToColumns,tilePath,parcelColumns} from './property-mesh-core.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source='https://map.prosperitysmp.com/maps/world/';
const cache=process.env.PROPERTY_MESH_CACHE;
const maskFile=process.env.PROPERTY_NATIVE_MASKS;
const sourceFile=process.env.PROPERTY_INPUT_FIXTURE;
if(!cache||!maskFile||!sourceFile)throw Error('Set PROPERTY_MESH_CACHE, PROPERTY_NATIVE_MASKS and PROPERTY_INPUT_FIXTURE');
const catalog=JSON.parse(await fs.readFile('src/data/property-catalog.json','utf8'));
const masks=JSON.parse(await fs.readFile(maskFile,'utf8'));
const sourceProperties=JSON.parse(await fs.readFile(sourceFile,'utf8')).properties;
const captures=new Map(),columnMasks=new Map();
// Validate every boundary before fetching/writing any output. A missing polygon
// mask must never silently become its bounding rectangle.
for(const p of catalog.properties){
  const capture=JSON.parse(await fs.readFile('public'+p.preview.url,'utf8'));captures.set(p.id,capture);
  columnMasks.set(p.id,parcelColumns(p,capture,masks,sourceProperties.find(s=>s.propertyRef===p.id)));
}
await fs.mkdir(cache,{recursive:true});
const out='public/property-meshes';await fs.mkdir(out,{recursive:true});
const records=[];
async function acquire(rel,limit) {
  const file=path.join(cache,rel.replaceAll('/','_'));
  let bytes;
  try{bytes=await fs.readFile(file);}catch{
    const r=await fetch(source+rel,{signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!r.ok)throw Error(`Source ${rel}: ${r.status}`);
    const chunks=[];let size=0;
    for await(const chunk of r.body){size+=chunk.length;if(size>limit)throw Error('Source exceeds budget');chunks.push(chunk);}
    bytes=Buffer.concat(chunks);await fs.writeFile(file,bytes);
    await fs.writeFile(file+'.meta.json',JSON.stringify({url:source+rel,fetchedAt:new Date().toISOString(),sha256:sha(bytes)}));
  }
  if(bytes.length>limit)throw Error('Cached source exceeds budget');
  const meta=JSON.parse(await fs.readFile(file+'.meta.json','utf8'));if(meta.sha256!==sha(bytes))throw Error('Cache integrity');records.push(meta);
  return bytes;
}
const settings=JSON.parse(await acquire('settings.json',50000));
if(JSON.stringify(settings.hires)!==JSON.stringify({tileSize:[32,32],scale:[1,1],translate:[2,2]}))throw Error('Map transform drift');
const textureBytes=await acquire('textures.json',6000000), textures=JSON.parse(textureBytes);
const tiles=new Map(),manifest={version:1,source:'BlueMap 5.23 rendered surfaces',properties:{}};
const texturesOut=new Map();
async function texture(id) {
  if(texturesOut.has(id))return texturesOut.get(id);
  const t=textures[id];
  // Only standard block/static block-entity textures, not item maps, player skins,
  // profile URLs or arbitrary dynamic gallery paths. Pixels already public on map.
  if(!t||!/^minecraft:(block\/|entity\/(chest\/|bed\/|shulker\/|signs\/|bell\/|decorated_pot\/|banner_base$))/.test(t.resourcePath))return null;
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(t.texture)||t.texture.length>500000)throw Error('Texture format');
  const png=Buffer.from(t.texture.split(',')[1],'base64');
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Texture magic');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width<1||height<1||width>512||height>8192||width*height>1048576)throw Error('Texture dimensions');
  const name=sha(png)+'.png';await fs.writeFile(path.join(out,name),png);
  const frames=t.animation?height/width:1;
  if(!Number.isInteger(frames)||frames<1)throw Error('Animation dimensions');
  const frame=t.animation?.frames?.[0]?.index??0;
  if(!Number.isInteger(frame)||frame<0||frame>=frames)throw Error('Animation frame');
  const publicTexture={url:'/property-meshes/'+name,transparent:t.halfTransparent===true,opaque:t.color?.[3]===1,frames,frame};
  texturesOut.set(id,publicTexture);return publicTexture;
}
for(const p of catalog.properties) {
  const capture=captures.get(p.id);
  const [ox,oy,oz]=capture.origin,[sx,sy,sz]=capture.size;
  const mask=columnMasks.get(p.id), batches=new Map(),omitted=new Map();
  // Hires tile origin is x*32+2, while source tile cells cover x*32..x*32+31.
  for(let tx=Math.floor(ox/32);tx<=Math.floor((ox+sx-1)/32);tx++)for(let tz=Math.floor(oz/32);tz<=Math.floor((oz+sz-1)/32);tz++) {
    const key=`${tx},${tz}`;
    if(!tiles.has(key)){if(tiles.size>=128)throw Error('Tile budget');tiles.set(key,decodePrbm(await acquire('tiles/0/'+tilePath(tx,tz),32000000)));}
    const tile=tiles.get(key),a=tile.attrs;
    for(const group of tile.groups) {
      const tex=await texture(group.material);let batch=batches.get(group.material);
      if(!batch&&tex){batch={texture:tex,values:[]};batches.set(group.material,batch);}
      for(let i=group.start;i<group.start+group.count;i+=3) {
        const tri=[];
        for(let n=i;n<i+3;n++){
          const x=a.position[n*3]+tx*32+2,y=a.position[n*3+1],z=a.position[n*3+2]+tz*32+2;
          const nx=a.normal[n*3],ny=a.normal[n*3+1],nz=a.normal[n*3+2];
          let ao=a.ao[n];
          if(ny!==0||Math.abs(Math.abs(nx)-Math.abs(nz))!==0){ao*=1-Math.abs((nx+nz*.5)/Math.hypot(1,.5))*.4;ao*=1-Math.max(0,-ny)*.6;}
          const light=ao*(.1+.9*Math.max(a.sunlight[n],a.blocklight[n])/15);
          tri.push([x,y,z,a.uv[n*2],a.uv[n*2+1],a.color[n*3]*light,a.color[n*3+1]*light,a.color[n*3+2]*light]);
        }
        if(tri.every(v=>v[0]<ox)||tri.every(v=>v[0]>ox+sx)||tri.every(v=>v[2]<oz)||tri.every(v=>v[2]>oz+sz))continue;
        const clipped=clipToColumns(tri,mask,oy,oy+sy);
        if(!tex){if(clipped.length)omitted.set(textures[group.material]?.resourcePath??'missing',(omitted.get(textures[group.material]?.resourcePath??'missing')??0)+clipped.length);continue;}
        for(const face of clipped)for(const v of face)batch.values.push(v[0]-ox,v[1]-oy,v[2]-oz,...v.slice(3));
      }
    }
  }
  const values=[],groups=[];
  for(const b of batches.values())if(b.values.length){groups.push({start:values.length/8,count:b.values.length/8,texture:b.texture});for(const v of b.values)values.push(v);}
  if(values.length/8>1500000)throw Error('Property vertex budget');
  const data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));
  const compressed=gzipSync(data,{level:9});
  // Opaque suffix: static hosts auto-decompress .gz before JS can hash its bytes.
  const filename=sha(compressed)+'.mesh';await fs.writeFile(path.join(out,filename),compressed);
  const meta={version:1,propertyId:p.id,origin:capture.origin,size:capture.size,vertexCount:values.length/8,
    buffer:'/property-meshes/'+filename,groups,observedAt:records.map(r=>r.fetchedAt).sort()[0],
    source:manifest.source,omittedTriangles:[...omitted.values()].reduce((a,b)=>a+b,0)};
  const json=Buffer.from(JSON.stringify(meta)),metaName=sha(json)+'.json';await fs.writeFile(path.join(out,metaName),json);
  manifest.properties[p.id]='/property-meshes/'+metaName;
  console.log(`${p.region}: ${meta.vertexCount/3} triangles, ${groups.length} textures, ${data.length} bytes, omitted ${meta.omittedTriangles} ${JSON.stringify([...omitted])}`);
}
// A gallery change during capture invalidates ID associations; never publish a mix.
const latest=await fetch(source+'textures.json',{signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
if(!latest.ok||sha(Buffer.from(await latest.arrayBuffer()))!==sha(textureBytes))throw Error('Texture gallery changed; recapture');
await fs.writeFile('src/data/property-mesh-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const used=new Set(Object.values(manifest.properties).map(p=>path.basename(p)));
for(const name of [...used]){const m=JSON.parse(await fs.readFile(path.join(out,name),'utf8'));used.add(path.basename(m.buffer));m.groups.forEach(g=>used.add(path.basename(g.texture.url)));}
const outputRoot=path.resolve(out);
for(const name of await fs.readdir(outputRoot)){
  const target=path.resolve(outputRoot,name);
  if(path.dirname(target)!==outputRoot||!/^[a-f0-9]{64}\.(json|bin|bin\.gz|mesh|png)$/.test(name))throw Error('Unexpected generated artifact');
  if(!used.has(name))await fs.unlink(target);
}
await fs.writeFile(path.join(cache,'PROVENANCE.json'),JSON.stringify({capturedAt:new Date().toISOString(),records,sourceSha256:sha(await fs.readFile(sourceFile)),maskSha256:sha(await fs.readFile(maskFile)),tiles:tiles.size,textures:texturesOut.size},null,2));
console.log(`Complete: ${Object.keys(manifest.properties).length} properties / ${tiles.size} tiles / ${texturesOut.size} textures`);
