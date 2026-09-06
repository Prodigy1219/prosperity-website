import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {propertyDossier,appraisalScenarios} from './property-dossier.mjs';
import {appraiseProperty} from './property-valuation.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../data/'+n,import.meta.url)));
const original=read('property-catalog.json'),context=read('property-appraisal-context.json'),policy=read('property-valuation-policy.json');
const values=read('property-material-values.json').properties,structures=read('property-structures.json').properties;
const reviews=read('property-quality-reviews.json').reviews;
const now=Date.parse('2026-09-06T21:30:00.000Z');
function fixture(){const c=structuredClone(original);c.savedReadAt='2026-09-06T21:00:00.000Z';return c;}
const get=(c,id)=>c.properties.find(p=>p.id==='world:'+id);
test('real c001 is closer than c006 independent of assessment dollars',()=>{
 const c=fixture(),a=propertyDossier(get(c,'c001'),c,{context,now}),b=propertyDossier(get(c,'c006'),c,{context,now});
 assert.equal(a.location.distanceBlocks,85);assert.ok(b.location.distanceBlocks>110&&b.location.distanceBlocks<111);
 assert.ok(a.location.score>b.location.score);assert.ok(a.location.rank<b.location.rank);
 assert.ok(a.location.premiumPer10000Cents>b.location.premiumPer10000Cents);
 assert.equal(a.location.rank,1);assert.equal(a.location.cohortCount,7);
});
test('price changes cannot change normalized location score or rank',()=>{
 const c=fixture(),p=get(c,'c001'),a=propertyDossier(p,c,{context,now});
 p.priceCents*=100;get(c,'c006').priceCents=1;
 assert.deepEqual(propertyDossier(p,c,{context,now}).location,a.location);
});
test('equal distance shares rank; unknown spawn never means zero distance',()=>{
 const c=fixture();get(c,'c006').geometry=structuredClone(get(c,'c001').geometry);
 const a=propertyDossier(get(c,'c001'),c,{context,now}),b=propertyDossier(get(c,'c006'),c,{context,now});
 assert.equal(a.location.rank,b.location.rank);
 const u=propertyDossier(get(c,'c001'),c,{context:{},now});
 assert.equal(u.location.rank,null);assert.equal(u.location.score,null);assert.equal(u.location.rankedCount,0);
});
test('cohort excludes self, other worlds, other kinds and rents',()=>{
 const c=fixture(),r=propertyDossier(get(c,'c001'),c,{context,now});
 assert.equal(r.benchmark.peerCount,6);assert.ok(r.benchmark.rows.every(x=>x.propertyId!=='world:c001'));
 const q=structuredClone(get(c,'c006'));q.id='other:unique';q.worldId='other';q.world='other';q.region='unique';c.properties.push(q);
 assert.equal(propertyDossier(get(c,'c001'),c,{context,now}).benchmark.peerCount,6);
 assert.match(r.benchmark.note,/Not completed sales/);assert.equal(r.saleCalibration.eligible,0);
});
test('area rates expose why larger equally-rated plots have larger dollar premiums',()=>{
 const c=fixture(),a=propertyDossier(get(c,'c001'),c,{context,now}),b=propertyDossier(get(c,'c006'),c,{context,now});
 assert.equal(a.geometry.footprint,378);assert.equal(b.geometry.footprint,609);
 assert.equal(a.benchmark.selectedRateCentsPerBlock2,b.benchmark.selectedRateCentsPerBlock2);
 assert.equal(a.geometry.cornerStatus,'unverified');assert.match(a.geometry.note,/permission volume/);
});
test('missing or unverified price is not a zero comparable',()=>{
 const c=fixture();for(const p of c.properties)if(p.region!=='c001')p.priceCents=null;
 const r=propertyDossier(get(c,'c001'),c,{context,now});
 assert.equal(r.benchmark.pricedPeerCount,0);assert.equal(r.benchmark.medianRateCentsPerBlock2,null);
 assert.equal(r.benchmark.selectedToMedianRatio,null);
});
test('same footprint weekly rentals normalize periods without capitalizing rent',()=>{
 const c=fixture(),a=c.properties.find(p=>p.tenure==='rent'),b=c.properties.find(p=>p.tenure==='rent'&&p.id!==a.id&&p.kind===a.kind);
 assert.ok(b);a.priceCents=7000;a.periodSeconds=604800;b.geometry=structuredClone(a.geometry);b.priceCents=14000;b.periodSeconds=1209600;
 const r=propertyDossier(a,c,{context,now}),peer=r.benchmark.rows.find(p=>p.propertyId===b.id);
 assert.equal(peer.rateCentsPerBlock2,r.benchmark.selectedRateCentsPerBlock2);
 assert.match(r.benchmark.basis,/weekly-rent/);
});
test('fresh calculation does not relabel stale listing evidence current',()=>{
 const c=fixture(),r=propertyDossier(get(c,'c001'),c,{context,now});
 assert.equal(r.benchmark.listingStale,true);assert.equal(r.benchmark.observedAt,c.observedAt);
 assert.equal(r.readiness.find(x=>x.id==='traffic').status,'unknown');
 assert.equal(r.readiness.find(x=>x.id==='placement').status,'unverified');
});
test('sensitivity reruns the cap; subtracting quality contribution is incorrect',()=>{
 const c=fixture(),p=get(c,'c001'),structureHash=structures[p.id].structureHash,review=reviews.find(r=>r.propertyId===p.id&&r.structureHash===structureHash);
 const opts={context,policy,review,structureHash,now},v=values[p.id];
 const full=appraiseProperty(p,c,v,opts);assert.equal(full.capApplied,true);
 const scenarios=appraisalScenarios(p,c,v,opts),removed=scenarios.find(r=>r.id==='without-design');
 assert.equal(removed.cents,appraiseProperty(p,c,v,{...opts,review:undefined}).totalCents);
 assert.notEqual(removed.cents,full.totalCents-full.components.quality.appliedCents);
 assert.equal(scenarios.find(r=>r.id==='advisory').cents,full.totalCents);
});
test('deterministic and nonmutating, ignores injected selected price',()=>{
 const c=fixture(),before=structuredClone(c),p={...get(c,'c001'),priceCents:1};
 const a=propertyDossier(p,c,{context,now});assert.deepEqual(a,propertyDossier(p,c,{context,now}));
 assert.deepEqual(c,before);assert.notEqual(a.benchmark.selectedRateCentsPerBlock2,1/a.geometry.footprint);
 assert.throws(()=>propertyDossier({id:'fake'},c,{context,now}));
 assert.throws(()=>propertyDossier(p,c,{context,now:NaN}));
});
