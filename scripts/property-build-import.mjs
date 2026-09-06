// Import a validated, blocks-only saved/live capture. Never accepts raw NBT.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateBlockCapture,estimateBlockWorth} from '../src/lib/property-build.mjs';
import {validateCatalog} from '../src/lib/property-core.mjs';
const [input,maskPath]=process.argv.slice(2);if(!input||!maskPath)throw Error('Supply block-volume capture and native WG masks');
const captured=JSON.parse(readFileSync(input,'utf8'));
const masks=JSON.parse(readFileSync(maskPath,'utf8'));
const catalogPath=new URL('../src/data/property-catalog.json',import.meta.url);
const catalog=validateCatalog(JSON.parse(readFileSync(catalogPath)));
const prices=JSON.parse(readFileSync(new URL('../src/data/property-worth.json',import.meta.url)));
if(process.env.PROPERTY_LOCAL_MAP && process.env.PROPERTY_LOCAL_MAP!=='1')throw Error('Invalid local map option');
const res=await fetch(process.env.PROPERTY_LOCAL_MAP==='1'?'http://127.0.0.1:8100/maps/world/textures.json':'https://map.prosperitysmp.com/maps/world/textures.json',{signal:AbortSignal.timeout(15000),redirect:'error'});
if(!res.ok)throw Error('Public block colors unavailable');
const reader=res.body.getReader(),chunks=[];let total=0;
for(;;){const{done,value}=await reader.read();if(done)break;total+=value.length;
    if(total>5000000){await reader.cancel();throw Error('Texture metadata too large');}chunks.push(value);}
const textures=JSON.parse(Buffer.concat(chunks)),colors=new Map();
for(const t of textures){
    if(typeof t.resourcePath!=='string'||!Array.isArray(t.color)||t.color.length!==4||
        !t.color.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))throw Error('Invalid texture color');
    colors.set(t.resourcePath.replace(':block/',':'),'#'+t.color.slice(0,3).map(n=>Math.round(n*255).toString(16).padStart(2,'0')).join(''));
}
const dir=new URL('../public/property-previews/',import.meta.url);mkdirSync(dir,{recursive:true});
const imported=[],seen=new Set();
// Remove obsolete roof samples from the catalog: unsupported regions get the
// explicit footprint fallback, not a misleading substitute for a building.
for(const p of catalog.properties)p.preview=null;
for(const raw of captured.captures){
    if(seen.has(raw.propertyId))throw Error('Duplicate property capture');seen.add(raw.propertyId);
    const p=catalog.properties.find(p=>p.id===raw.propertyId);if(!p)throw Error('Capture outside public inventory');
    const xs=[...new Set(p.geometry.points.map(v=>v[0]))],zs=[...new Set(p.geometry.points.map(v=>v[1]))];
    const mask=masks[p.id],columns=mask?new Set(mask.map(v=>v.join(','))):null;
    if(!mask&&(xs.length!==2||zs.length!==2||p.geometry.points.length!==4))throw Error('Native polygon mask required');
    const mx=mask?mask.map(v=>v[0]):xs,mz=mask?mask.map(v=>v[1]):zs;
    if(JSON.stringify(raw.origin)!==JSON.stringify([Math.min(...mx),p.geometry.minY,Math.min(...mz)])||
        JSON.stringify(raw.size)!==JSON.stringify([Math.max(...mx)-Math.min(...mx)+(mask?1:0),p.geometry.maxY-p.geometry.minY+1,Math.max(...mz)-Math.min(...mz)+(mask?1:0)]))
        throw Error('Capture does not match property bounds');
    if(columns&&raw.blocks.some(b=>!columns.has(`${b[0]+raw.origin[0]},${b[2]+raw.origin[2]}`)))
        throw Error('Captured block escapes native WG polygon');
    // No invented material-specific colors for absent textures: neutral fallback.
    raw.palette=raw.palette.map(v=>({material:v.material,state:v.state,color:colors.get(v.material)??'#999999'}));
    const c=validateBlockCapture(raw),v=estimateBlockWorth(c,prices);
    const bytes=Buffer.from(JSON.stringify(c)),hash=createHash('sha256').update(bytes).digest('hex');
    if(bytes.length>6000000)throw Error('Preview exceeds browser fetch budget');
    writeFileSync(new URL(hash+'.json',dir),bytes);
    p.preview={url:'/property-previews/'+hash+'.json',capturedAt:c.capturedAt};
    imported.push({id:p.id,cells:c.blocks.length,materials:c.palette.length,knownSubtotalCents:v.knownSubtotalCents,
        unknownCells:v.unknownCells,bytes:bytes.length,hash});
}
validateCatalog(catalog);
const tmp=new URL('../src/data/property-catalog.json.tmp',import.meta.url);writeFileSync(tmp,JSON.stringify(catalog,null,2)+'\n');renameSync(tmp,catalogPath);
const report={source:'saved-world snapshot; not live memory',colorsSource:'BlueMap public texture averages; missing colors neutral',
    capturedAt:captured.startedAt,sourceHashes:captured.sourceHashes,imported,withheld:captured.skipped};
writeFileSync(new URL('../src/data/property-build-manifest.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({imported:imported.length,cells:imported.reduce((s,r)=>s+r.cells,0),withheld:captured.skipped.length}));
