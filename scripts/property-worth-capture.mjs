// Read-only capture: current PUBLIC worth feed + an explicitly supplied table.
// Never execute the Skript table. Only known data assignments are projected.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function parseBlockRules(text) {
    const rules={bmap:{},statemul:{}};
    for(const line of text.split(/\r?\n/)) {
        if(!/^\s*set \{-ppc::(?:bmap|statemul)::/.test(line)) continue;
        const m=line.match(/^\s*set \{-ppc::(bmap|statemul)::([A-Z0-9_]+)\} to "([a-zA-Z0-9_+@:.|]+)"\s*$/);
        if(!m || Object.hasOwn(rules[m[1]],m[2])) throw Error('Invalid or duplicate block rule');
        rules[m[1]][m[2]]=m[3];
    }
    if(Object.keys(rules.bmap).length<100 || Object.keys(rules.statemul).length<50)
        throw Error('Block rule table appears incomplete');
    return rules;
}

export function projectWorth(raw, sourceHash) {
    if(!raw || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(raw.generated) ||
        !Array.isArray(raw.items) || raw.count!==raw.items.length || raw.count<1000 || raw.count>10000)
        throw Error('Incomplete public worth export');
    const observedAt=raw.generated.replace(' ','T').replace(' UTC',':00Z');
    if(!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid worth export date');
    const unitMicros={};
    for(const row of raw.items) {
        if(!/^[A-Z0-9_]+$/.test(row.id))throw Error('Invalid material');
        const key='minecraft:'+row.id.toLowerCase(),rawMicros=row.worth*1000000,n=Math.round(rawMicros);
        if(Object.hasOwn(unitMicros,key) || typeof row.worth!=='number' || !Number.isFinite(rawMicros) ||
            Math.abs(rawMicros-n)>0.01 || !Number.isSafeInteger(n) || n<=0 || n>1e12)
            throw Error('Invalid, duplicate or excess-precision worth');
        unitMicros[key]=n;
    }
    return {observedAt,sourceHash,unitMicros};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    const [tablePath,outPath]=process.argv.slice(2);
    if(!tablePath||!outPath)throw Error('Usage: property-worth-capture.mjs CAPTURED_TABLE OUTPUT');
    const table=readFileSync(tablePath),rules=parseBlockRules(table.toString('utf8'));
    const res=await fetch('https://economy.prosperitysmp.com/data.json',{signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error(`Worth HTTP ${res.status}`);
    const reader=res.body.getReader(),chunks=[];let total=0;
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;
        if(total>2000000){await reader.cancel();throw Error('Worth body too large');}chunks.push(value);}
    const bytes=Buffer.concat(chunks),sha=b=>createHash('sha256').update(b).digest('hex');
    const data={schemaVersion:1,policy:'paid-paste-state-BOM-at-worth-v1',fetchedAt:new Date().toISOString(),
        sourceUrl:'https://economy.prosperitysmp.com/data.json',rulesHash:sha(table),rules,
        prices:projectWorth(JSON.parse(bytes),sha(bytes))};
    const tmp=resolve(outPath)+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(data)+'\n',{flag:'wx'});renameSync(tmp,resolve(outPath));
    console.log(JSON.stringify({prices:Object.keys(data.prices.unitMicros).length,bmap:Object.keys(rules.bmap).length,
        statemul:Object.keys(rules.statemul).length,observedAt:data.prices.observedAt,rulesHash:data.rulesHash}));
}
