import {money} from '../lib/property-core.mjs';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number=(v:number|null,digits=1)=>v===null||!Number.isFinite(v)?'Unknown':new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(v);
export function renderDossier(d:any) {
    const l=d.location,g=d.geometry,b=d.benchmark;
    const rate=(v:number|null)=>v===null?'Unverified':`${money(Math.round(v))} / block²${b.basis.includes('weekly')?' / week':''}`;
    return `<section class="pd-dossier" aria-label="Detailed property appraisal"><h3>Property fundamentals</h3>
      <dl class="pd-fundamentals">
        <div><dt>Spawn proximity</dt><dd data-spawn-score="${l.score??''}">${number(l.score,2)}<small>/ 100 distance rating</small></dd></div>
        <div><dt>Distance to spawn</dt><dd data-spawn-distance="${l.distanceBlocks??''}">${number(l.distanceBlocks)}<small>blocks to nearest boundary</small></dd></div>
        <div><dt>Same-type proximity rank</dt><dd>${l.rank===null?'Unknown':`#${l.rank} of ${l.rankedCount}`}<small>distance only, not dollar value</small></dd></div>
        <div><dt>Assessment rate</dt><dd>${rate(b.selectedRateCentsPerBlock2)}<small>configured, not a sale</small></dd></div>
      </dl>
      <p class="pd-note">${esc(l.note)} Equal-assessment comparison: ${l.premiumPer10000Cents===null?'unknown':`${money(l.premiumPer10000Cents)} per $10,000 of assessment before the combined cap`}.</p>
      <details class="pd-dossier-details"><summary>Dimensions &amp; parcel shape</summary><dl class="pd-value-breakdown">
        <dt>Geometric footprint</dt><dd>${number(g.footprint)} blocks²</dd><dt>Boundary perimeter</dt><dd>${number(g.perimeter)} blocks</dd>
        <dt>Bounding dimensions</dt><dd>${number(g.width)} × ${number(g.depth)} blocks</dd>
        <dt>Footprint / bounding rectangle</dt><dd>${number(g.boundingBoxUtilization===null?null:g.boundingBoxUtilization*100)}%</dd>
        <dt>Short / long side ratio</dt><dd>${number(g.shortLongRatio,3)}</dd>
        <dt>Street-corner status</dt><dd>Not verified</dd></dl><p class="pd-note">${esc(g.note)}</p></details>
      <details class="pd-dossier-details" open><summary>Local assessment benchmarks</summary>
        <p>${b.pricedPeerCount} priced peers · median ${rate(b.medianRateCentsPerBlock2)}${b.selectedToMedianRatio===null?'':` · this parcel ${number(b.selectedToMedianRatio*100)}% of the peer median`}</p>
        <div class="pd-table-scroll"><table class="pd-peer-table"><thead><tr><th>Plot</th><th>Area</th><th>Assessment rate</th><th>Spawn distance</th></tr></thead><tbody>
        ${b.rows.map((r:any)=>`<tr><td><button class="pd-text-button" data-open="${esc(r.propertyId)}">${esc(r.region)}</button></td><td>${number(r.footprint)} blocks²</td><td>${rate(r.rateCentsPerBlock2)}</td><td>${number(r.distanceToSpawn)} blocks</td></tr>`).join('')||'<tr><td colspan="4">No comparable configured listings.</td></tr>'}</tbody></table></div>
        <p class="pd-note">${esc(b.note)}${b.truncated?' Showing the eight nearest peers.':''}${b.listingStale?' Listing availability is stale; these remain dated reference assessments.':''}</p></details>
      <details class="pd-dossier-details"><summary>Evidence coverage &amp; missing inputs</summary><div class="pd-table-scroll"><table><thead><tr><th>Input</th><th>Status</th><th>Limitation</th></tr></thead><tbody>${d.readiness.map((r:any)=>`<tr><td>${esc(r.label)}</td><td>${esc(r.status.replaceAll('-',' '))}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table></div>
      <p class="pd-note">${esc(d.saleCalibration.note)} Missing evidence is not a zero-valued property feature.</p></details></section>`;
}
export function renderScenarios(rows:any[]) {
    if(!rows.length)return '';
    return `<details class="pd-dossier-details pd-scenarios"><summary>Valuation sensitivity</summary><dl class="pd-value-breakdown">${rows.map(r=>`<dt>${esc(r.label)}<small>${esc(r.note)}</small></dt><dd>${money(r.cents)}</dd>`).join('')}</dl><p class="pd-note">Alternative calculation bases, not a confidence interval, minimum sale price or guaranteed cash redemption.</p></details>`;
}
export function renderCaptureAnalysis(a:any) {
    if(!a)return '<section class="pd-capture-audit"><h3>Capture diagnostics</h3><p class="pd-note">Detailed diagnostics unavailable. The verified material tally remains separate.</p></section>';
    const labels:Record<string,string>={'manufactured-construction':'Manufactured construction','fixtures':'Fixtures & containers','natural-or-terrain':'Natural / terrain-like','ore-or-storage':'Ores & resource blocks','vegetation':'Vegetation & timber','fluid':'Fluids','unclassified':'Unclassified'};
    const span=a.geometry.occupiedYSpan,s=a.standingSpaceCandidates,risk=a.flags.oreOrStorage;
    const levels=a.levels.filter((r:any)=>r.standingSpaceCandidateCells>0).sort((x:any,y:any)=>y.standingSpaceCandidateCells-x.standingSpaceCandidateCells||y.y-x.y).slice(0,12);
    return `<section class="pd-capture-audit" aria-label="Building and material diagnostics"><h3>Inside the captured volume</h3>
      <dl class="pd-fundamentals">
        <div><dt>Occupied height span</dt><dd>${span?number(span.height):'None'}<small>${span?`Y ${span.minY} to ${span.maxY}`:'No occupied cells'}</small></dd></div>
        <div><dt>Occupied block cells</dt><dd>${number(a.occupancy.occupiedCells,0)}<small>${number(a.occupancy.occupiedRatio*100)}% of region volume</small></dd></div>
        <div><dt>Standing-space candidates</dt><dd>${number(s.cells,0)}<small>block² across observed levels</small></dd></div>
        <div><dt>Unpriced cells</dt><dd>${number(a.valuation.unknownCells,0)}<small>not silently valued at zero</small></dd></div>
      </dl><p class="pd-note">Height and occupancy include terrain. Standing-space candidates require an explicit full-solid floor block and two clear cells above; they are not certified accessible rooms or usable floor area.</p>
      <div class="pd-table-scroll"><table class="pd-category-table"><thead><tr><th>Material category</th><th>Cells</th><th>Known worth</th></tr></thead><tbody>
      ${a.categories.filter((r:any)=>r.cells>0).map((r:any)=>`<tr data-material-category="${esc(r.id)}"><td>${esc(labels[r.id]||r.id)}<span class="pd-category-meter" title="${number(r.valueCents/a.valuation.knownSubtotalCents*100)}% of known material worth"><span style="width:${a.valuation.knownSubtotalCents?Math.min(100,r.valueCents/a.valuation.knownSubtotalCents*100):0}%"></span></span></td><td>${number(r.cells,0)}${r.unknownCells?`<small>${number(r.unknownCells,0)} unpriced</small>`:''}</td><td data-category-cents="${r.valueCents}">${money(r.valueCents)}</td></tr>`).join('')}
      <tr><th>Total known materials</th><td>${number(a.occupancy.capturedCells,0)}</td><th>${money(a.valuation.knownSubtotalCents)}</th></tr></tbody></table></div>
      <p class="pd-note">Category cents reconcile to the full material subtotal. Natural stone can be player-placed, and manufactured blocks can be generated: categories do not prove who built something. Neither block expense nor block variety is an automatic design bonus.</p>
      ${risk.rPlotOreContaminationReview?'<p class="pd-audit-warning">Residential ore review required. This capture contains ores in the plot family reported for accidental underground ore generation. No new net-worth uplift is enabled for this plot.</p>':''}
      <details class="pd-dossier-details"><summary>Geometry &amp; valuation checks</summary><dl class="pd-value-breakdown">
        <dt>Ore cells</dt><dd>${number(risk.oreCells,0)}</dd><dt>Resource-storage blocks</dt><dd>${number(risk.storageCells,0)}</dd>
        <dt>Ore/storage surrounded on all six sides</dt><dd>${number(a.flags.hiddenStockpile.sixSolidNeighborEnclosedOreOrStorageCells,0)}</dd>
        <dt>Container blocks</dt><dd>${number(a.flags.hiddenStockpile.containerCells,0)}; contents excluded</dd>
        <dt>Unresolved custom identity</dt><dd>${number(a.flags.customIdentity.unresolvedCells,0)} cells</dd>
        <dt>Cells touching capture limits</dt><dd>${number(a.flags.clipping.captureBoundaryCells,0)}</dd>
        <dt>Manufacturing / placement provenance</dt><dd>Unknown</dd></dl><p class="pd-note">Boundary contact is a check, not proof of a cut-off build. Enclosed ore is not proof of misconduct or player placement. NBT, container contents and private inventory are not captured.</p></details>
      <details class="pd-dossier-details"><summary>Largest horizontal standing-space candidates</summary><div class="pd-table-scroll"><table><thead><tr><th>Supporting block Y</th><th>Clear candidate area</th><th>Occupied cells on level</th></tr></thead><tbody>${levels.map((r:any)=>`<tr><td>${r.y}</td><td>${number(r.standingSpaceCandidateCells,0)} blocks²</td><td>${number(r.occupiedCells,0)}</td></tr>`).join('')||'<tr><td colspan="3">No verified candidates within the capture.</td></tr>'}</tbody></table></div><p class="pd-note">At most 12 levels shown. Terrain surfaces and disconnected spaces can qualify; this is not a count of floors or rooms. Collision details beyond the conservative block allowlist and walking access are not measured.</p></details>
      <p class="pd-note">${esc(a.classifierVersion)} · exact blocks-only capture · same server block-state worth rules. Diagnostic metrics do not independently mint value or change the approved premium weights.</p></section>`;
}
