import {validateCatalog} from './property-core.mjs';
import {boundedBytes} from './property-mesh.mjs';
const runtimeAsset=u=>typeof u==='string'&&/^\/property-runtime\/assets\/[a-f0-9]{64}\.json$/.test(u);
export function validateRuntimeSnapshot(raw) {
  if(raw?.version!==1||raw.refreshSeconds!==3600||typeof raw.publishedAt!=='string'||
    !Number.isFinite(Date.parse(raw.publishedAt))||Date.parse(raw.publishedAt)>Date.now()+300000)throw Error('Invalid snapshot publication');
  const catalog=validateCatalog(raw.catalog);
  if(!catalog.properties.length||catalog.properties.length>100)throw Error('Snapshot inventory budget');
  const meshes={},materialValues={};
  if(!raw.materialValues||Object.keys(raw.materialValues).length!==catalog.properties.length)throw Error('Snapshot material inventory');
  if(!raw.meshes||typeof raw.meshes!=='object'||Object.keys(raw.meshes).length!==catalog.properties.length)throw Error('Snapshot mesh inventory');
  for(const p of catalog.properties){
    if(!runtimeAsset(p.preview?.url)||!runtimeAsset(raw.meshes[p.id]))throw Error('Invalid runtime artifact');
    meshes[p.id]=raw.meshes[p.id];
    const v=raw.materialValues[p.id];
    if(!Number.isSafeInteger(v?.knownSubtotalCents)||v.knownSubtotalCents<0||!Number.isSafeInteger(v.unknownCells)||v.unknownCells<0||
       (v.totalCents!==null&&v.totalCents!==v.knownSubtotalCents)||(v.unknownCells>0)!==(v.totalCents===null))throw Error('Invalid material subtotal');
    materialValues[p.id]={knownSubtotalCents:v.knownSubtotalCents,totalCents:v.totalCents,unknownCells:v.unknownCells};
    if(v.structureHash !== undefined) {
      if(typeof v.structureHash !== 'string'||!/^[a-f0-9]{64}$/.test(v.structureHash))throw Error('Invalid structure fingerprint');
      materialValues[p.id].structureHash=v.structureHash;
    }
  }
  const w=raw.worth;
  if(w?.schemaVersion!==1||w.policy!=='paid-paste-state-BOM-at-worth-v1'||!/^[a-f0-9]{64}$/.test(w.rulesHash)||
    !Number.isFinite(Date.parse(w.prices?.observedAt))||!/^[a-f0-9]{64}$/.test(w.prices?.sourceHash))throw Error('Invalid snapshot worth');
  const rules={};
  for(const field of ['bmap','statemul']){
    const input=w.rules?.[field];if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>3000)throw Error('Invalid pricing rules');
    rules[field]={};
    for(const [k,v]of Object.entries(input)){
      if(!/^[A-Z0-9_]{1,100}$/.test(k)||typeof v!=='string'||v.length>256||!/^[a-zA-Z0-9_+@:.|]+$/.test(v))throw Error('Invalid pricing rule');rules[field][k]=v;
    }
  }
  const unitMicros={},entries=Object.entries(w.prices.unitMicros??{});
  if(entries.length<1000||entries.length>10000)throw Error('Incomplete runtime worth');
  for(const [k,v]of entries){if(!/^minecraft:[a-z0-9_]{1,80}$/.test(k)||!Number.isSafeInteger(v)||v<0||v>1e12)throw Error('Invalid worth value');unitMicros[k]=v;}
  return {version:1,publishedAt:raw.publishedAt,refreshSeconds:3600,catalog,meshes,materialValues,
    worth:{schemaVersion:1,policy:w.policy,rulesHash:w.rulesHash,rules,prices:{observedAt:w.prices.observedAt,sourceHash:w.prices.sourceHash,unitMicros}}};
}
export async function loadRuntimeSnapshot(signal) {
  const r=await fetch('/property-runtime/current.json',{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
  if(!r.ok)throw Error('Snapshot refresher unavailable');
  return validateRuntimeSnapshot(JSON.parse(new TextDecoder().decode(await boundedBytes(r.body,2000000))));
}
