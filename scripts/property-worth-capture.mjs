// Read-only capture: current PUBLIC worth feed + an explicitly supplied table.
// Never execute the Skript table. Only known data assignments are projected.
import {readFileSync,writeFileSync,renameSync,openSync,closeSync,readSync,fstatSync,lstatSync,constants} from 'node:fs';
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

export function readLocalWorth(file) {
    if(file!=='/var/www/prosperity-economy/data.json')throw Error('Unapproved local worth path');
    const limit=2000000,sha=b=>createHash('sha256').update(b).digest('hex');
    const fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try {
        const before=fstatSync(fd,{bigint:true});
        if(!before.isFile()||before.size<1n||before.size>BigInt(limit))throw Error('Local worth size/type');
        const stable=s=>s.isFile()&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]);
        const pass=()=>{
            const bytes=Buffer.alloc(limit+1);let total=0;
            while(total<bytes.length){const n=readSync(fd,bytes,total,bytes.length-total,total);if(n===0)break;total+=n;}
            if(total!==Number(before.size)||total>limit)throw Error('Local worth changed size');
            return bytes.subarray(0,total);
        };
        const bytes=pass(),again=pass();
        // Detect in-place rewrites as well as an atomic replacement of the path.
        // Neither a stat-only check nor reading an old open inode is sufficient.
        if(sha(bytes)!==sha(again)||!stable(fstatSync(fd,{bigint:true}))||!stable(lstatSync(file,{bigint:true})))
            throw Error('Local worth changed during capture');
        return bytes;
    }finally{closeSync(fd);}
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    const [tablePath,outPath]=process.argv.slice(2);
    if(!tablePath||!outPath)throw Error('Usage: property-worth-capture.mjs CAPTURED_TABLE OUTPUT');
    const table=readFileSync(tablePath),rules=parseBlockRules(table.toString('utf8'));
    let bytes;
    if(process.env.PROPERTY_WORTH_FILE!==undefined)bytes=readLocalWorth(process.env.PROPERTY_WORTH_FILE);
    else {
        const res=await fetch('https://economy.prosperitysmp.com/data.json',{signal:AbortSignal.timeout(15000)});
        if(!res.ok)throw Error(`Worth HTTP ${res.status}`);
        const reader=res.body.getReader(),chunks=[];let total=0;
        for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;
            if(total>2000000){await reader.cancel();throw Error('Worth body too large');}chunks.push(value);}
        bytes=Buffer.concat(chunks);
    }
    const sha=b=>createHash('sha256').update(b).digest('hex');
    const data={schemaVersion:1,policy:'paid-paste-state-BOM-at-worth-v1',fetchedAt:new Date().toISOString(),
        sourceUrl:'https://economy.prosperitysmp.com/data.json',rulesHash:sha(table),rules,
        prices:projectWorth(JSON.parse(bytes),sha(bytes))};
    const tmp=resolve(outPath)+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(data)+'\n',{flag:'wx'});renameSync(tmp,resolve(outPath));
    console.log(JSON.stringify({prices:Object.keys(data.prices.unitMicros).length,bmap:Object.keys(rules.bmap).length,
        statemul:Object.keys(rules.statemul).length,observedAt:data.prices.observedAt,rulesHash:data.rulesHash}));
}
