import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBlockCapture, tallyBlocks, valueMaterials, exposedBlocks, estimateBlockWorth, combinedPropertyEstimate} from '../src/lib/property-build.mjs';
import {parseBlockRules,projectWorth} from './property-worth-capture.mjs';
// Synthetic geometry and pricing boundary tests; not evidence of native capture.
const base = () => ({schemaVersion:1, format:'plot-blocks', propertyId:'world:c001',
    capturedAt:'2026-09-06T12:00:00Z', source:'saved-world', origin:[10,60,20], size:[3,3,3],
    palette:[{material:'minecraft:stone',state:{},color:'#777777'}],blocks:[[0,0,0,0],[0,1,0,0],[0,2,0,0]]});
const prices = () => ({observedAt:'2026-09-06T12:00:00Z',sourceHash:'a'.repeat(64),unitMicros:{'minecraft:stone':31250}});

test('combined estimate adds assessment and known materials exactly once, without mutating either',()=>{
  const property={tenure:'buy',priceCents:1209600},v={knownSubtotalCents:2154498,totalCents:2154498};
  const before=JSON.stringify([property,v]);
  assert.deepEqual(combinedPropertyEstimate(property,v),{cents:3364098,assessmentCents:1209600,materialCents:2154498,partial:false});
  assert.equal(JSON.stringify([property,v]),before);
  assert.equal(combinedPropertyEstimate(property,{...v,totalCents:null}).partial,true);
  assert.equal(combinedPropertyEstimate({...property,tenure:'rent'},v),null,'rent is not capital');
  assert.equal(combinedPropertyEstimate({...property,priceCents:null},v),null);
  assert.equal(combinedPropertyEstimate({...property,priceCents:Number.MAX_SAFE_INTEGER},v),null);
});
test('full vertical cells survive, not just highest column sample',()=>{
    const c=validateBlockCapture(base()); assert.equal(c.blocks.length,3);
    assert.deepEqual(tallyBlocks(c),[{material:'minecraft:stone',cells:3}]);
});
test('only allowlisted block data survives; private NBT cannot reach renderer',()=>{
    const r=base();r.inventory=['secret'];r.palette[0].nbt={Items:['secret']};
    assert(!JSON.stringify(validateBlockCapture(r)).includes('secret'));
});
test('duplicate/out-of-volume cells, invalid palette indices and huge captures refused',()=>{
    for(const mutate of [r=>r.blocks.push(r.blocks[0]),r=>r.blocks[0][0]=3,r=>r.blocks[0][3]=1,
        r=>r.size=[512,512,512],r=>r.palette[0].state={text:'private player message'}]) {
        const r=base();mutate(r);assert.throws(()=>validateBlockCapture(r));
    }
});
test('renderer shell keeps all sides but never controls material tally',()=>{
    const r=base();r.blocks=[];for(let x=0;x<3;x++)for(let y=0;y<3;y++)for(let z=0;z<3;z++)r.blocks.push([x,y,z,0]);
    const c=validateBlockCapture(r);assert.equal(exposedBlocks(c).length,26);assert.equal(tallyBlocks(c)[0].cells,27);
});
test('fractional block worth sums before cents rounding',()=>{
    const v=valueMaterials([{material:'minecraft:stone',units:100}],prices());
    assert.equal(v.subtotalCents,313);assert.equal(v.subtotalMicros,3125000);
});
test('missing value stays unknown, never a zero-valued complete valuation',()=>{
    const v=valueMaterials([{material:'minecraft:oak_planks',units:20}],prices());
    assert.equal(v.complete,false);assert.equal(v.unpricedUnits,20);assert.equal(v.rows[0].valueMicros,null);
});
test('zero known price differs from missing, and cannot overflow or double-count',()=>{
    const p=prices();p.unitMicros['minecraft:stone']=0;
    assert.equal(valueMaterials([{material:'minecraft:stone',units:1}],p).complete,true);
    assert.throws(()=>valueMaterials([{material:'minecraft:stone',units:1},{material:'minecraft:stone',units:1}],p));
    p.unitMicros['minecraft:stone']=1e12;assert.throws(()=>valueMaterials([{material:'minecraft:stone',units:500000}],p));
});
const actual=JSON.parse(readFileSync(new URL('../src/data/property-worth.json',import.meta.url)));
test('real production rules and worth values: double waterlogged slab',()=>{
    const c=base();c.blocks=[[0,0,0,0]];c.palette=[{material:'minecraft:oak_slab',state:{type:'double',waterlogged:'true'},color:'#aaaaaa'}];
    const v=estimateBlockWorth(validateBlockCapture(c),actual);
    const expected=actual.prices.unitMicros['minecraft:oak_slab']*2+actual.prices.unitMicros['minecraft:water_bucket'];
    assert.equal(v.totalCents,Math.round(expected/10000));assert.equal(v.pricedCells,1);
});
test('known block with unavailable custom identity is not priced at vanilla backing',()=>{
    const c=base();c.palette[0].material='minecraft:note_block';
    const v=estimateBlockWorth(validateBlockCapture(c),actual);assert.equal(v.totalCents,null);assert.equal(v.unknownCells,3);
});
test('missing multi-state input does not invoke fallback maximum',()=>{
    const c=base();c.palette[0].material='minecraft:oak_slab';
    assert.equal(estimateBlockWorth(validateBlockCapture(c),actual).unknownCells,3);
});
test('existing two-half BOM policy is disclosed rather than mislabelled physical items',()=>{
    const c=base();c.blocks=[[0,0,0,0],[0,1,0,1]];
    c.palette=[{material:'minecraft:oak_door',state:{half:'lower'},color:'#aaaaaa'},
        {material:'minecraft:oak_door',state:{half:'upper'},color:'#aaaaaa'}];
    const v=estimateBlockWorth(validateBlockCapture(c),actual);
    assert.equal(v.totalCents,Math.round(actual.prices.unitMicros['minecraft:oak_door']*2/10000));
    assert.equal(v.rows[0].cells,2);assert(v.rows[0].warnings.some(x=>x.includes('both occupied halves')));
});
test('actual block aliases expand once, with no direct plus mapped double charge',()=>{
    const c=base();c.blocks=[[0,0,0,0]];c.palette[0].material='minecraft:oak_wall_sign';
    const v=estimateBlockWorth(validateBlockCapture(c),actual);
    assert.equal(v.totalCents,Math.round(actual.prices.unitMicros['minecraft:oak_sign']/10000));
});
test('table projection cannot silently accept executable content as a mapping',()=>{
    assert.throws(()=>parseBlockRules('set {-ppc::bmap::STONE} to execute console command "eco give user 100"'));
    assert.throws(()=>parseBlockRules('set {-ppc::bmap::STONE} to "STONE"'));
    assert.throws(()=>projectWorth({generated:'2026-09-06 12:00 UTC',count:0,items:[]},'a'.repeat(64)));
});
