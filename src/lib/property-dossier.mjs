import {validateCatalog, area, center} from './property-core.mjs';
import {analyzeProperty} from './property-appraisal.mjs';
import {appraiseProperty, VALUATION_RULES} from './property-valuation.mjs';

const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const known = n => Number.isFinite(n) && n >= 0;
const median = ns => { const a = [...ns].sort((x,y)=>x-y), n=a.length; return n ? (a[(n-1)>>1]+a[n>>1])/2 : null; };
function geometry(p) {
    const a=area(p), c=center(p), points=p.geometry.points;
    const width=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));
    const depth=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
    const perimeter=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+Math.hypot(p[0]-q[0],p[1]-q[1]);},0);
    return {footprint:a, perimeter, width, depth, center:c, regionHeight:p.geometry.maxY-p.geometry.minY+1,
        boundingBoxUtilization:width*depth>0?a/(width*depth):null,
        compactness:perimeter>0?Math.min(1,4*Math.PI*a/(perimeter*perimeter)):null,
        shortLongRatio:Math.max(width,depth)>0?Math.min(width,depth)/Math.max(width,depth):null,
        cornerStatus:'unverified',
        note:'Region geometry only. Height is permission volume, not building height. Polygon vertices do not establish street corners or access.'};
}

/**
 * Rich evidence dossier, not another pricing engine. The approved formula remains
 * appraiseProperty(). Public assessment benchmarks never become sale comparables.
 * All peer rates are normalized by area (and by week for rents). Location rank
 * depends on distance only, never on a property's assessment or review score.
 */
export function propertyDossier(property, catalog, {context={}, now=Date.now()}={}) {
    if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid dossier time');
    const data=validateCatalog(catalog), p=data.properties.find(p=>p.id===property?.id);
    if(!p)throw Error('Property absent from catalog');
    const own=geometry(p), facts=analyzeProperty(p,data,{...context,now});
    const cohort=data.properties.filter(q=>q.worldId===p.worldId&&q.kind===p.kind&&q.tenure===p.tenure);
    const rows=cohort.map(q=>{
        const g=geometry(q), f=analyzeProperty(q,data,{...context,now});
        const distance=f.spawn.status==='observed'&&known(f.spawn.distanceBlocks)?f.spawn.distanceBlocks:null;
        const charge=Number.isSafeInteger(q.priceCents)&&q.priceCents>=0&&q.priceBasis!=='unverified'?q.priceCents:null;
        const normalized=charge===null?null:q.tenure==='buy'?charge:
            Number.isSafeInteger(q.periodSeconds)&&q.periodSeconds>0?charge*604800/q.periodSeconds:null;
        return {propertyId:q.id,region:q.region,footprint:g.footprint,assessmentCents:charge,
            rateCentsPerBlock2:g.footprint>0&&normalized!==null?normalized/g.footprint:null,
            distanceToSpawn:distance, distanceFromSelected:Math.hypot(g.center.x-own.center.x,g.center.z-own.center.z),
            proximityScore:distance===null?null:100*Math.max(0,1-distance/VALUATION_RULES.spawn.zeroAtBlocks),
            status:q.status, observedAt:data.observedAt};
    });
    const ranked=rows.filter(r=>r.distanceToSpawn!==null).sort((a,b)=>a.distanceToSpawn-b.distanceToSpawn||a.propertyId.localeCompare(b.propertyId));
    const selected=rows.find(r=>r.propertyId===p.id);
    // Equal-distance plots share rank; missing observations do not become far away.
    const rank=selected.distanceToSpawn===null?null:1+ranked.filter(r=>r.distanceToSpawn<selected.distanceToSpawn-1e-9).length;
    const peers=rows.filter(r=>r.propertyId!==p.id).sort((a,b)=>a.distanceFromSelected-b.distanceFromSelected||a.propertyId.localeCompare(b.propertyId));
    const rates=peers.map(p=>p.rateCentsPerBlock2).filter(known), middle=median(rates);
    const ratio=middle>0&&selected.rateCentsPerBlock2!==null?selected.rateCentsPerBlock2/middle:null;
    const normalizedSpawnBps=selected.proximityScore===null?null:selected.proximityScore/100*VALUATION_RULES.spawn.maxBasisPoints;
    return freeze({version:2,propertyId:p.id,analyzedAt:new Date(now).toISOString(),geometry:own,
        location:{distanceBlocks:selected.distanceToSpawn,rank,rankedCount:ranked.length,cohortCount:cohort.length,
            score:selected.proximityScore,scoreMaximum:100,uncappedBasisPoints:normalizedSpawnBps,
            premiumPer10000Cents:normalizedSpawnBps===null?null:Math.floor(normalizedSpawnBps*100),
            method:'2d-nearest-footprint; linear 2000-block radius; distance-only same-type rank',
            source: facts.spawn.status==='observed'?facts.spawn.source:null,
            observedAt:facts.spawn.status==='observed'?facts.spawn.observedAt:null,
            note:'Closer means a higher proximity score. Bonus dollars also depend on assessment and the combined cap; dollars are not a location ranking.'},
        benchmark:{basis:p.tenure==='buy'?'configured-assessment-per-footprint-block2':'configured-weekly-rent-per-footprint-block2',
            source:data.source,observedAt:data.observedAt,listingStale:facts.snapshot.status!=='observed',
            peerCount:peers.length,pricedPeerCount:rates.length,selectedRateCentsPerBlock2:selected.rateCentsPerBlock2,
            medianRateCentsPerBlock2:middle,minRateCentsPerBlock2:rates.length?Math.min(...rates):null,
            maxRateCentsPerBlock2:rates.length?Math.max(...rates):null,selectedToMedianRatio:ratio,
            rows:peers.slice(0,8),truncated:peers.length>8,
            note:'Other published same-world, same-type, same-tenure assessments. Excludes this parcel. Not completed sales, demand, fair-value calibration or a predicted selling price. Distances between listings use footprint bounding-box centers.'},
        readiness:[
            {id:'geometry',label:'Parcel geometry',status:'observed',note:own.note},
            {id:'spawn',label:'Spawn proximity',status:selected.distanceToSpawn===null?'unknown':'saved-observation',note:facts.spawn.reason},
            {id:'supply',label:'Published comparable supply',status:facts.supply.status,note:facts.supply.reason},
            {id:'streets',label:'Public road access / corner frontage',status:'unknown',note:facts.road.reason},
            {id:'traffic',label:'Privacy-safe foot traffic',status:'unknown',note:facts.traffic.reason},
            {id:'sales',label:'Verified comparable sales',status:'insufficient',note:facts.comps.reason},
            {id:'land-only',label:'Land-only baseline / build overlap',status:'unverified',note:'The configured assessment is not proven land-only. Adding captured materials may overlap value already reflected in that assessment.'},
            {id:'placement',label:'Terrain versus player-placed materials',status:'unverified',note:'Block type alone cannot establish who placed a block. Material categories expose ambiguity; they do not prove construction origin.'},
        ],saleCalibration:{eligible:0,status:'withheld',note:'No verified arms-length sale cohort. No fitted coefficients or statistical confidence interval are claimed.'}});
}

/** Exact sensitivity re-runs, not subtraction from a capped component. */
export function appraisalScenarios(property,catalog,materialValue,options={}) {
    const base=appraiseProperty(property,catalog,materialValue,options);
    if(!base.baseEstimate)return [];
    const withoutDesign=appraiseProperty(property,catalog,materialValue,{...options,review:undefined});
    return freeze([
        {id:'configured',label:'Configured server assessment',cents:base.assessmentCents,note:'Unchanged configured assessment, not a confirmed sale or guaranteed refund.'},
        {id:'materials',label:'Assessment + captured materials',cents:base.baseEstimate.cents,note:'Includes terrain and any ambiguous block origin; excludes advisory premiums.'},
        {id:'without-design',label:'Without the design-review premium',cents:withoutDesign.totalCents,note:'Recalculated with no design review, including redistribution under the combined cap.'},
        {id:'advisory',label:'Current approved advisory estimate',cents:base.totalCents,note:'Current evidence and approved capped policy. Not a transaction price.'},
    ]);
}
