export const MESH_ROOT='/property-meshes/';
export function meshPath(url,extension) {
  return typeof url==='string'&&new RegExp(`^/property-meshes/[a-f0-9]{64}\\.${extension}$`).test(url);
}
export function validateMesh(raw,propertyId) {
  if(raw?.version!==1||raw.propertyId!==propertyId||!meshPath(raw.buffer,'mesh')||
    !Number.isInteger(raw.vertexCount)||raw.vertexCount<3||raw.vertexCount>1500000||raw.vertexCount%3||
    !Array.isArray(raw.origin)||raw.origin.length!==3||!raw.origin.every(n=>Number.isInteger(n)&&Math.abs(n)<30000000)||
    !Array.isArray(raw.size)||raw.size.length!==3||!raw.size.every(n=>Number.isInteger(n)&&n>0&&n<=512)||
    !Number.isFinite(Date.parse(raw.observedAt))||!Array.isArray(raw.groups)||raw.groups.length>512)throw Error('Invalid detailed mesh');
  let count=0;
  const groups=raw.groups.map(g=>{
    const t=g.texture;
    if(g.start!==count||!Number.isInteger(g.count)||g.count<=0||g.count%3||!meshPath(t?.url,'png')||
      typeof t.transparent!=='boolean'||typeof t.opaque!=='boolean'||!Number.isInteger(t.frames)||t.frames<1||t.frames>512||
      !Number.isInteger(t.frame)||t.frame<0||t.frame>=t.frames)throw Error('Invalid mesh material');
    count+=g.count;
    return {start:g.start,count:g.count,texture:{url:t.url,transparent:t.transparent,opaque:t.opaque,frames:t.frames,frame:t.frame}};
  });
  if(count!==raw.vertexCount)throw Error('Incomplete mesh groups');
  return {propertyId,buffer:raw.buffer,vertexCount:count,origin:[...raw.origin],size:[...raw.size],groups,observedAt:raw.observedAt};
}

export async function boundedBytes(body,max) {
  if(!body)throw Error('Missing asset body');
  const reader=body.getReader(),chunks=[];let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Asset exceeds budget');chunks.push(value);} }
  catch(e){await reader.cancel();throw e;}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
export async function fetchMeshAsset(url,extension,max,signal) {
  if(!meshPath(url,extension))throw Error('Invalid mesh asset URL');
  const r=await fetch(url,{credentials:'omit',signal,redirect:'error'});if(!r.ok)throw Error('Detailed mesh unavailable');
  const bytes=await boundedBytes(r.body,max);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(!url.startsWith(MESH_ROOT+digest+'.'))throw Error('Mesh integrity failure');return bytes;
}
export function meshVertices(bytes,meta) {
  if(bytes.byteLength!==meta.vertexCount*32)throw Error('Mesh byte count');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=new Float32Array(meta.vertexCount*8);
  for(let i=0;i<out.length;i++){
    const n=v.getFloat32(i*4,true),a=i%8;
    if(!Number.isFinite(n)||(a<3&&(n<-.0001||n>meta.size[a]+.0001))||(a>=3&&a<5&&Math.abs(n)>64)||(a>=5&&(n<0||n>1.001)))throw Error('Mesh vertex range');out[i]=n;
  }
  return out;
}
