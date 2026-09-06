// Compact card estimates, derived from the same verified captures and BOM as detail views.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateBlockCapture,estimateBlockWorth} from '../src/lib/property-build.mjs';
import {validateCatalog} from '../src/lib/property-core.mjs';
const catalog=validateCatalog(JSON.parse(readFileSync(new URL('../src/data/property-catalog.json',import.meta.url))));
const worth=JSON.parse(readFileSync(new URL('../src/data/property-worth.json',import.meta.url))),properties={};
for(const p of catalog.properties){
  if(!/^\/property-previews\/[a-f0-9]{64}\.json$/.test(p.preview?.url))throw Error('Missing verified static capture');
  const bytes=readFileSync(new URL('../public'+p.preview.url,import.meta.url));
  if(!p.preview.url.endsWith(createHash('sha256').update(bytes).digest('hex')+'.json'))throw Error('Capture hash mismatch');
  const c=validateBlockCapture(JSON.parse(bytes));if(c.propertyId!==p.id)throw Error('Capture identity mismatch');
  const v=estimateBlockWorth(c,worth);
  properties[p.id]={knownSubtotalCents:v.knownSubtotalCents,totalCents:v.totalCents,unknownCells:v.unknownCells};
}
writeFileSync(new URL('../src/data/property-material-values.json',import.meta.url),JSON.stringify({version:1,worthAsOf:worth.prices.observedAt,properties},null,2)+'\n');
console.log(JSON.stringify({properties:Object.keys(properties).length,c006:properties['world:c006']}));
