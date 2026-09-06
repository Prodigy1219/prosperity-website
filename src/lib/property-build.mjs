// Blocks-only capture contract. No NBT, entities, inventory or monetary writes.
const materialPattern = /^minecraft:[a-z0-9_]{1,80}$/;
const statePattern = /^[a-z0-9_]+$/;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function validateBlockCapture(raw) {
    if (!raw || raw.schemaVersion !== 1 || raw.format !== 'plot-blocks' ||
        typeof raw.propertyId !== 'string' || !/^[a-z0-9_\-]+:[a-z0-9_\-]+$/.test(raw.propertyId) ||
        !iso(raw.capturedAt) || !['saved-world', 'live-chunk-snapshot', 'sanitized-schematic'].includes(raw.source))
        throw Error('Invalid block capture identity');
    if (!Array.isArray(raw.origin) || raw.origin.length !== 3 || !raw.origin.every(v => integer(v, -30000000, 30000000)) ||
        !Array.isArray(raw.size) || raw.size.length !== 3 || !raw.size.every(v => integer(v, 1, 512)) ||
        raw.size.reduce((a, b) => a * b, 1) > 2000000)
        throw Error('Capture bounds exceeded');
    if (!Array.isArray(raw.palette) || raw.palette.length < 1 || raw.palette.length > 4096)
        throw Error('Invalid block palette');
    const palette = raw.palette.map(p => {
        if (!p || !materialPattern.test(p.material) || !/^#[a-f0-9]{6}$/i.test(p.color) ||
            !p.state || typeof p.state !== 'object' || Array.isArray(p.state) || Object.keys(p.state).length > 24)
            throw Error('Invalid palette entry');
        const state = {};
        for (const [key, value] of Object.entries(p.state)) {
            if (!statePattern.test(key) || typeof value !== 'string' || !statePattern.test(value) || value.length > 40)
                throw Error('Invalid block state');
            state[key] = value;
        }
        return {material: p.material, state, color: p.color};
    });
    if (!Array.isArray(raw.blocks) || raw.blocks.length > 250000)
        throw Error('Capture block budget exceeded');
    const seen = new Set();
    const blocks = raw.blocks.map(b => {
        if (!Array.isArray(b) || b.length !== 4 || b.some((v, i) => !integer(v, 0, i === 3 ? palette.length - 1 : raw.size[i] - 1)))
            throw Error('Invalid captured cell');
        const key = `${b[0]},${b[1]},${b[2]}`;
        if (seen.has(key)) throw Error('Duplicate captured cell');
        seen.add(key);
        return [...b];
    });
    // Deliberately project, never spread the original capture or palette fields.
    return {schemaVersion: 1, format: 'plot-blocks', propertyId: raw.propertyId,
        capturedAt: raw.capturedAt, source: raw.source, origin: [...raw.origin],
        size: [...raw.size], palette, blocks};
}

export function tallyBlocks(capture) {
    const counts = new Map();
    for (const b of capture.blocks) {
        const p = capture.palette[b[3]];
        counts.set(p.material, (counts.get(p.material) || 0) + 1);
    }
    return [...counts].map(([material, cells]) => ({material, cells}))
        .sort((a, b) => b.cells - a.cells || a.material.localeCompare(b.material));
}

// Price adapters supply item-equivalent quantities separately. Counting occupied
// cells is NOT the same as counting recoverable items (doors, beds, double slabs).
export function valueMaterials(rows, prices) {
    if (!prices || !iso(prices.observedAt) || !/^[a-f0-9]{64}$/.test(prices.sourceHash) ||
        !prices.unitMicros || typeof prices.unitMicros !== 'object')
        throw Error('Unverified worth table');
    const seen = new Set(); let subtotalMicros = 0, unpricedUnits = 0;
    const valued = rows.map(row => {
        if (!materialPattern.test(row.material) || !integer(row.units, 1, 500000) || seen.has(row.material))
            throw Error('Invalid material quantity');
        seen.add(row.material);
        const unit = prices.unitMicros[row.material];
        if (unit === undefined || unit === null) {
            unpricedUnits += row.units;
            return {material:row.material, units:row.units, unitMicros:null, valueMicros:null};
        }
        if (!integer(unit, 0, 1000000000000) || !Number.isSafeInteger(unit * row.units) ||
            !Number.isSafeInteger(subtotalMicros + unit * row.units)) throw Error('Invalid material worth');
        const valueMicros = unit * row.units;
        subtotalMicros += valueMicros;
        return {material: row.material, units: row.units, unitMicros: unit, valueMicros};
    });
    // Round once at presentation, not once per cheap block.
    return {rows: valued, subtotalMicros, subtotalCents: Math.round(subtotalMicros / 10000),
        unpricedUnits, complete: unpricedUnits === 0, observedAt: prices.observedAt, sourceHash: prices.sourceHash};
}

export function exposedBlocks(capture) {
    const cells = new Set(capture.blocks.map(b => `${b[0]},${b[1]},${b[2]}`));
    const offsets = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    return capture.blocks.filter(b => offsets.some(d => !cells.has(`${b[0]+d[0]},${b[1]+d[1]},${b[2]+d[2]}`)));
}

export function estimateBlockWorth(capture, snapshot) {
    if(snapshot?.schemaVersion!==1 || snapshot.policy!=='paid-paste-state-BOM-at-worth-v1' ||
        !/^[a-f0-9]{64}$/.test(snapshot.rulesHash) || !snapshot.rules?.bmap || !snapshot.rules?.statemul)
        throw Error('Unverified block pricing adapter');
    const counts=new Map();
    for(const b of capture.blocks)counts.set(b[3],(counts.get(b[3])||0)+1);
    const byMaterial=new Map();let knownMicros=0,unknownCells=0,pricedCells=0,skippedCells=0;
    const add=(m,n,out)=>{
        const map=snapshot.rules.bmap[m]??m;
        if(map==='@SKIP')return;
        if(!/^[A-Z0-9_]+(?:\+[A-Z0-9_]+)*$/.test(map))throw Error('Unsupported block mapping');
        for(const name of map.split('+')){
            const key='minecraft:'+name.toLowerCase();out.set(key,(out.get(key)||0)+n);
        }
    };
    for(const [index,cells] of counts){
        const p=capture.palette[index],m=p.material.slice(10).toUpperCase(),warnings=new Set();
        const components=new Map();let priced=null,skipped=false;
        try{
            // A state-only capture loses custom identity stored outside blockstate.
            if(/(?:^NOTE_BLOCK$|PLAYER_(?:WALL_)?HEAD$)/.test(m))throw Error('custom-identity-unresolved');
            let units=1;const rule=snapshot.rules.statemul[m];
            if(rule){
                const [mode,maxText]=rule.split('|'),max=Number(maxText);
                if(!Number.isFinite(max)||max<=0)throw Error('unsupported-state-rule');
                if(mode==='DBL'){
                    if(!['top','bottom','double'].includes(p.state.type))throw Error('missing-slab-state');
                    units=p.state.type==='double'?2:1;
                }else if(mode==='FACES'){
                    units=0;for(const face of ['up','down','north','south','east','west']){
                        if(!['true','false'].includes(p.state[face]))throw Error('missing-face-state');
                        if(p.state[face]==='true')units++;
                    }
                    if(units<1)throw Error('empty-face-state');
                }else if(mode.startsWith('NUM:')){
                    const value=p.state[mode.slice(4)];
                    if(!/^[1-9]$/.test(value??'')||Number(value)>max)throw Error('unsupported-count-state');
                    units=Number(value);
                }else throw Error('unsupported-state-rule');
            }
            if(p.state.half==='upper'||p.state.half==='lower'||p.state.part==='head'||p.state.part==='foot')
                warnings.add('Server BOM counts both occupied halves; not recoverable item quantities.');
            add(m,units*cells,components);
            if(p.state.waterlogged==='true')add('WATER',cells,components);
            if(p.state.honey_level==='5')add('HONEYCOMB',3*cells,components);
            skipped=components.size===0;
            priced=valueMaterials([...components].map(([material,units])=>({material,units})),snapshot.prices);
        }catch{warnings.add('State or custom identity could not be valued safely.');}
        let r=byMaterial.get(p.material);
        if(!r){r={material:p.material,cells:0,valueMicros:0,unknownCells:0,warnings:new Set()};byMaterial.set(p.material,r);}
        r.cells+=cells;for(const w of warnings)r.warnings.add(w);
        if(!priced?.complete){r.unknownCells+=cells;unknownCells+=cells;}
        else{r.valueMicros+=priced.subtotalMicros;knownMicros+=priced.subtotalMicros;
            if(!Number.isSafeInteger(knownMicros))throw Error('Worth total overflow');
            if(skipped)skippedCells+=cells;else pricedCells+=cells;}
    }
    return {policy:snapshot.policy,observedAt:snapshot.prices.observedAt,sourceHash:snapshot.prices.sourceHash,
        rows:[...byMaterial.values()].map(r=>({...r,warnings:[...r.warnings]}))
            .sort((a,b)=>b.valueMicros-a.valueMicros||a.material.localeCompare(b.material)),
        knownSubtotalCents:Math.round(knownMicros/10000),totalCents:unknownCells?null:Math.round(knownMicros/10000),
        unknownCells,pricedCells,skippedCells};
}
// Display-only estimate. Never mix recurring rent with capital/material value or
// replace the authoritative ARM price used by purchases, filters or accounting.
export function combinedPropertyEstimate(property, valuation) {
  if(property.tenure!=='buy'||!Number.isSafeInteger(property.priceCents)||property.priceCents<0||
    !Number.isSafeInteger(valuation.knownSubtotalCents)||valuation.knownSubtotalCents<0)return null;
  const cents=property.priceCents+valuation.knownSubtotalCents;
  if(!Number.isSafeInteger(cents))return null;
  return {cents,assessmentCents:property.priceCents,materialCents:valuation.knownSubtotalCents,partial:valuation.totalCents===null};
}
