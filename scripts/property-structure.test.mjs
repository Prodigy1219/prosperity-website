import test from 'node:test';
import assert from 'node:assert/strict';
import {structureIdentity,structureHash} from '../src/lib/property-structure.mjs';

const property={id:'world:test',geometry:{points:[[0,0],[2,0],[2,2],[0,2]],minY:0,maxY:5}};
const capture={schemaVersion:1,format:'plot-blocks',propertyId:'world:test',capturedAt:'2026-09-06T00:00:00Z',source:'saved-world',origin:[0,0,0],size:[3,6,3],palette:[{material:'minecraft:stone',color:'#aaaaaa',state:{}},{material:'minecraft:oak_stairs',color:'#987654',state:{facing:'north',half:'bottom'}}],blocks:[[0,0,0,0],[1,1,1,1]]};
test('stable across capture timestamp, colors, palette and cell order, state-key order',async()=>{
  const c=structuredClone(capture); c.capturedAt='2026-09-07T00:00:00Z';c.palette.reverse();c.palette[0].state={half:'bottom',facing:'north'};c.palette[1].color='#bbbbbb';c.blocks.reverse().forEach(b=>b[3]=1-b[3]);
  assert.equal(await structureHash(c,property),await structureHash(capture,property));
});
test('polygon rotation and winding do not invalidate the build',()=>{
  const p=structuredClone(property);p.geometry.points=[[2,2],[2,0],[0,0],[0,2],[2,2]];
  assert.equal(structureIdentity(capture,p),structureIdentity(capture,property));
});
test('materials, states, positions, bounds, and mask changes invalidate reviews',async()=>{
  const expected=await structureHash(capture,property);
  for(const edit of [c=>c.palette[0].material='minecraft:diamond_block',c=>c.palette[1].state.facing='south',c=>c.blocks[0][0]=2,c=>c.size[1]=7,c=>c.blocks.pop()]){
    const c=structuredClone(capture);edit(c);assert.notEqual(await structureHash(c,property),expected);
  }
  const p=structuredClone(property);p.geometry.points[1][0]=3;assert.notEqual(await structureHash(capture,p),expected);
});
test('reject cross-property identity and invalid captures',()=>{
  assert.throws(()=>structureIdentity(capture,{...property,id:'world:wrong'}));
  const c=structuredClone(capture);c.blocks.push([...c.blocks[0]]);assert.throws(()=>structureIdentity(c,property));
});
