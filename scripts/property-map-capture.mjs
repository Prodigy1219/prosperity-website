// Local, explicit capture of four ALREADY PUBLIC BlueMap tiles. No game access.
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out=new URL('../public/property-map/world/',import.meta.url);
mkdirSync(out,{recursive:true});
const records=[];
for(const x of [0,1])for(const z of [-1,0]){
  const url=`https://map.prosperitysmp.com/maps/world/tiles/1/x${x}/z${z}.png`;
  const res=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error(`Map tile HTTP ${res.status}`);
  const reader=res.body.getReader(),chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5000000){await reader.cancel();throw Error('Oversized map tile');}chunks.push(value);}
  const bytes=Buffer.concat(chunks);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==501||bytes.readUInt32BE(20)!==1002)throw Error('BlueMap tile format changed');
  const name=`x${x}-z${z}.png`,tmp=new URL(name+'.tmp',out);writeFileSync(tmp,bytes);renameSync(tmp,new URL(name,out));records.push({x,z,url,file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
}
const manifest=JSON.stringify({capturedAt:new Date().toISOString(),tileSize:500,lod:1,mapId:'world',source:'Public BlueMap color + height tiles; no live player feed',records},null,2)+'\n';
writeFileSync(new URL('manifest.json',out),manifest);
writeFileSync(new URL('../src/data/property-map-manifest.json',import.meta.url),manifest);
console.log(`${records.length} public tiles captured and format-checked, ${records.reduce((s,r)=>s+r.bytes,0)} bytes`);
