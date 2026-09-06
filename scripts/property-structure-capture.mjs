import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {structureHash} from '../src/lib/property-structure.mjs';
import {validateCatalog} from '../src/lib/property-core.mjs';
const catalog=validateCatalog(JSON.parse(readFileSync(new URL('../src/data/property-catalog.json',import.meta.url))));
const properties={};
for(const p of catalog.properties){
  if(!/^\/property-previews\/[a-f0-9]{64}\.json$/.test(p.preview?.url))throw Error('Missing verified static capture');
  const bytes=readFileSync(new URL('../public'+p.preview.url,import.meta.url));
  if(!p.preview.url.endsWith(createHash('sha256').update(bytes).digest('hex')+'.json'))throw Error('Capture hash mismatch');
  properties[p.id]={structureHash:await structureHash(JSON.parse(bytes),p),previewUrl:p.preview.url};
}
writeFileSync(new URL('../src/data/property-structures.json',import.meta.url),JSON.stringify({version:1,properties},null,2)+'\n');
console.log(JSON.stringify({properties:Object.keys(properties).length}));
