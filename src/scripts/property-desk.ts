import { createIcons, Search, Map as MapIcon, LayoutGrid, Bookmark, Users, History, ArrowUpRight, ArrowRight, X, Columns3, ChevronLeft, ChevronRight, Copy, ExternalLink } from 'lucide';
import { validateCatalog, filterProperties, money, weeklyCents, priceLabel, effectiveStatus, area, mapUrl, holdings, STATUS } from '../lib/property-core.mjs';
import { createPropertyScene } from './property-scene.js';
import {combinedPropertyEstimate} from '../lib/property-build.mjs';
import mapCapture from '../data/property-map-manifest.json';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const icons = () => createIcons({ icons: { Search, Map: MapIcon, LayoutGrid, Bookmark, Users, History, ArrowUpRight, ArrowRight, X, Columns3, ChevronLeft, ChevronRight, Copy, ExternalLink } });
const time = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s} (date only)` : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s));
const PAGE = 18, SAVE_KEY = 'prosperity.property-shortlist.v1';
type Property = ReturnType<typeof validateCatalog>['properties'][number];
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export async function startPropertyDesk() {
    const content = el('pd-content'), detail = el<HTMLDialogElement>('pd-detail'), comparison = el<HTMLDialogElement>('pd-comparison');
    let catalog: ReturnType<typeof validateCatalog>, view = 'browse', page = 1, tenure = '', selectedOwner = '', mapScene: ReturnType<typeof createPropertyScene> | null = null, detailScene: ReturnType<typeof createPropertyScene> | null = null;
    let previewAbort: AbortController | null = null, toastTimer: ReturnType<typeof setTimeout>, queryTimer: ReturnType<typeof setTimeout>;
    let saved: string[] = [];
    try {
        const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
        if (Array.isArray(raw))
            saved = raw.filter(x => typeof x === 'string').slice(0, 100);
    }
    catch { }
    const compare = new Set<string>();
    function toast(message: string) { clearTimeout(toastTimer); el('pd-toast').textContent = message; el('pd-toast').hidden = false; toastTimer = setTimeout(() => el('pd-toast').hidden = true, 3000); }
    function updateSaved() { el('pd-saved-count').textContent = String(saved.length); try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    }
    catch {
        toast('Shortlist kept for this tab only; browser storage is unavailable.');
    } }
    function updateCompare() { el('pd-compare-bar').hidden = compare.size === 0; el('pd-compare-count').textContent = `${compare.size} of 3 properties`; }
    function syncUrl() { const q = new URLSearchParams(); if (view !== 'browse')
        q.set('view', view); if (tenure)
        q.set('tenure', tenure); if (selectedOwner)
        q.set('owner', selectedOwner); for (const [key, id] of [['q', 'pd-query'], ['world', 'pd-world'], ['tag', 'pd-tag'], ['status', 'pd-status-filter'], ['max', 'pd-budget'], ['sort', 'pd-sort']]) {
        const v = el<HTMLInputElement>(id).value;
        if (v && !(key === 'sort' && v === 'price'))
            q.set(key, v);
    } history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '')); }
    function matching() { const raw = el<HTMLInputElement>('pd-budget').value; return filterProperties(catalog.properties, { query: el<HTMLInputElement>('pd-query').value, world: el<HTMLSelectElement>('pd-world').value, tag: el<HTMLSelectElement>('pd-tag').value, status: el<HTMLSelectElement>('pd-status-filter').value, tenure, sort: el<HTMLSelectElement>('pd-sort').value, maxCost: raw !== '' && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw) * 100) : null, saved: view === 'saved' ? saved : null }).filter(p => !selectedOwner || p.owner?.id === selectedOwner); }
    function footprint(p: Property) {
        const v=p.geometry.points,xs=v.map(a=>a[0]),zs=v.map(a=>a[1]),x=Math.min(...xs),z=Math.min(...zs),w=Math.max(...xs)-x,h=Math.max(...zs)-z,pad=Math.max(w,h,1)*.22;
        const images=p.mapId==='world'?[0,1].flatMap(tx=>[-1,0].map(tz=>{
            const id=`pd-tile-${p.region}-${tx}-${tz}`;
            return `<defs><clipPath id="${id}"><rect x="${tx*500}" y="${tz*500}" width="500" height="500"/></clipPath></defs><image href="/property-map/world/x${tx}-z${tz}.png" x="${tx*500}" y="${tz*500}" width="501" height="1002" clip-path="url(#${id})"/>`;
        })).join(''):'';
        return `<svg class="pd-footprint" viewBox="${x-pad} ${z-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="${esc(p.region)} boundary over BlueMap surface snapshot">${images}<polygon points="${v.map(a=>a.join(',')).join(' ')}" fill="#b8d3c2" fill-opacity=".15" stroke="#efb636" stroke-width="${Math.max(w,h,1)*.02}"/></svg>`;
    }
    function tile(p: Property) { const status = effectiveStatus(p); return `<article class="pd-card"><button class="pd-thumb" data-open="${esc(p.id)}" aria-label="View ${esc(p.region)}">${footprint(p)}<small>Boundary / BlueMap surface snapshot</small></button><div class="pd-card-content"><div class="pd-card-title"><button data-open="${esc(p.id)}"><h3>${esc(p.region)}</h3></button><span class="pd-badge" data-status="${status}">${STATUS[status]}</span></div><p class="pd-kind">${esc(p.kind)} &middot; ${esc(p.world)}</p><p class="pd-price">${money(p.priceCents)} ${p.tenure === 'rent' ? '<small>/ rental period</small>' : ''}</p><p class="pd-subprice">${p.tenure === 'rent' ? `${p.periodSeconds ? `${p.periodSeconds / 86400} days per payment` : 'Period not verified'}${weeklyCents(p) !== null ? ` / ~${money(Math.round(weeklyCents(p)!))} per week` : ''}` : status === 'owned' ? 'Current server assessment, not a sale offer' : 'One-time asking price'}</p><dl class="pd-facts"><div><dt>FOOTPRINT</dt><dd>${area(p).toLocaleString()} blocks&sup2;</dd></div><div><dt>${p.tenure === 'rent' ? 'TENANT' : 'OWNER'}</dt><dd>${esc(p.owner?.name || (status === 'available' ? 'Available' : 'Not published'))}</dd></div></dl><div class="pd-card-actions"><label><input type="checkbox" data-compare="${esc(p.id)}" ${compare.has(p.id) ? 'checked' : ''}/>Compare</label><button class="pd-icon" data-save="${esc(p.id)}" title="${saved.includes(p.id) ? 'Remove from' : 'Add to'} shortlist" aria-label="${saved.includes(p.id) ? 'Remove from' : 'Add to'} shortlist" aria-pressed="${saved.includes(p.id)}">${icon('bookmark')}</button><button data-open="${esc(p.id)}" class="pd-text-button">View property ${icon('arrow-right')}</button></div></div></article>`; }
    function activities(ps: Property[]) { const events = ps.flatMap(p => p.history.map(h => ({ p, h }))).sort((a, b) => Date.parse(b.h.at) - Date.parse(a.h.at)); if (!events.length)
        return '<div class="pd-empty"><h2>No verified history in this snapshot</h2><p>Current prices and ownership are not past transactions.</p></div>'; return events.map(({ p, h }) => `<div class="pd-history-row"><div><button data-open="${esc(p.id)}" class="pd-text-button">${esc(p.region)}</button> ${esc(h.type)}<small>${esc(time(h.at))} / ${esc(h.source)}</small></div><strong>${money(h.amountCents)}</strong></div>`).join(''); }
    function freshness() { if (!catalog)
        return; const stale = Date.now() > Date.parse(catalog.expiresAt); const box = el('pd-freshness'); box.dataset.stale = String(stale); box.textContent = `${stale ? 'Snapshot is stale. Verify prices and availability in game.' : 'Snapshot, not a live reservation.'} Observed ${time(catalog.observedAt)}.`; }
    function render() {
        if (!catalog)
            return;
        mapScene?.dispose();
        mapScene = null;
        syncUrl();
        freshness();
        const ps = matching();
        content.setAttribute('aria-busy', 'false');
        el('pd-pagination').innerHTML = '';
        el('pd-result-count').textContent = `${ps.length} ${view === 'saved' ? 'saved ' : ''}properties${selectedOwner ? ' / selected holder' : ''}`;
        document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', b.getAttribute('data-view') === view ? 'page' : 'false'));
        if (view === 'owners') {
            const owners = holdings(ps);
            content.innerHTML = owners.length ? `<div class="pd-owner-grid">${owners.map(o => `<article class="pd-owner"><button data-owner="${esc(o.id)}">${esc(o.name)}</button><p>${o.owned.length} owned &middot; ${o.leased.length} rented</p><small>Counts are property interests, not wealth.</small></article>`).join('')}</div>` : '<div class="pd-empty"><h2>No published property holders match</h2></div>';
        }
        else if (view === 'history') {
            content.innerHTML = activities(ps);
        }
        else if (view === 'map') {
            const worlds = [...new Set(ps.map(p => p.worldId))];
            if (!ps.length)
                content.innerHTML = '<div class="pd-empty"><h2>No mapped properties match</h2></div>';
            else if (worlds.length > 1)
                content.innerHTML = '<div class="pd-empty"><h2>Select a world</h2><p>Coordinates from different worlds cannot share a map.</p></div>';
            else {
                content.innerHTML = `<div class="pd-map-legend">${Object.entries(STATUS).map(([s, t]) => `<span class="pd-badge" data-status="${s}">${t}</span>`).join('')}</div><div class="pd-map-layout"><div><div class="pd-scene" id="pd-region-scene"></div><p class="pd-scene-label">WorldGuard boundaries over BlueMap tiles fetched ${esc(time(mapCapture.capturedAt))}; render age unknown. Stacked units overlap; select them from the list.</p></div><div class="pd-map-list">${ps.map(p => `<button data-open="${esc(p.id)}"><strong>${esc(p.region)}</strong><small>${esc(priceLabel(p))} / ${STATUS[effectiveStatus(p)]}</small></button>`).join('')}</div></div>`;
                try {
                    mapScene = createPropertyScene(el('pd-region-scene'), ps, { map: true, onSelect: openDetail });
                }
                catch {
                    el('pd-region-scene').textContent = '3D is unavailable in this browser. Property listings remain available.';
                }
            }
        }
        else {
            const pages = Math.max(1, Math.ceil(ps.length / PAGE));
            page = Math.min(page, pages);
            content.innerHTML = ps.length ? `<div class="pd-grid">${ps.slice((page - 1) * PAGE, page * PAGE).map(tile).join('')}</div>` : `<div class="pd-empty"><h2>${view === 'saved' ? 'Your shortlist is empty' : 'No properties match'}</h2><p>${view === 'saved' ? 'Saved properties stay in this browser.' : 'Try another filter or a larger budget.'}</p></div>`;
            if (pages > 1)
                el('pd-pagination').innerHTML = `<button class="pd-icon" data-page="-1" aria-label="Previous page" ${page === 1 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>Page ${page} of ${pages}</span><button class="pd-icon" data-page="1" aria-label="Next page" ${page === pages ? 'disabled' : ''}>${icon('chevron-right')}</button>`;
        }
        updateSaved();
        updateCompare();
        icons();
    }
    function openDetail(p: Property) { previewAbort?.abort(); detailScene?.dispose(); detailScene = null; previewAbort = new AbortController(); el('pd-detail-title').textContent = p.region; const status = effectiveStatus(p), url = mapUrl(p); el('pd-detail-body').innerHTML = `<div class="pd-detail-layout"><div><div id="pd-property-scene" class="pd-scene"></div><p id="pd-preview-label" class="pd-scene-label">Region footprint only. No verified building capture is published.</p></div><div class="pd-detail-info"><span class="pd-badge" data-status="${status}">${STATUS[status]}</span><p class="pd-price">${esc(priceLabel(p))}</p><p class="pd-subprice">${p.tenure === 'rent' && weeklyCents(p) !== null ? `~${money(Math.round(weeklyCents(p)!))} / week equivalent` : 'Asking/assessed price, never a recorded sale'}</p><dl><dt>Type</dt><dd>${esc(p.kind)}</dd><dt>World</dt><dd>${esc(p.world)}</dd><dt>Footprint</dt><dd>${area(p).toLocaleString()} blocks&sup2;</dd><dt>Region height</dt><dd>Y ${p.geometry.minY} to ${p.geometry.maxY}</dd><dt>${p.tenure === 'rent' ? 'Tenant' : 'Owner'}</dt><dd>${p.owner ? `<button data-owner="${esc(p.owner.id)}" class="pd-text-button">${esc(p.owner.name)}</button>` : 'Not published'}</dd><dt>Price basis</dt><dd>${esc(p.priceBasis)}</dd>${p.leaseEndsAt ? `<dt>Lease end (snapshot)</dt><dd>${esc(time(p.leaseEndsAt))}</dd>` : ''}</dl>${url ? `<a class="pd-button pd-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">View actual world in BlueMap ${icon('external-link')}</a>` : ''}<button class="pd-button" data-gps="${esc(p.region)}">Copy /gps ${esc(p.region)} ${icon('copy')}</button><p class="pd-note">GPS availability depends on the in-game rollout and your current world. This is a direction command, not a purchase.</p>${p.notes.map(n => `<p class="pd-note">${esc(n)}</p>`).join('')}</div></div><section class="pd-history"><h3>Recorded history</h3>${activities([p])}</section>`; if (!detail.open)
        detail.showModal(); icons(); try {
        detailScene = createPropertyScene(el('pd-property-scene'), [p]);
        if (p.preview) {
            const current = detailScene, currentAbort = previewAbort;
            current.preview(p, currentAbort.signal).then(result => { if (detailScene !== current || currentAbort.signal.aborted) return;
                if(result?.kind === 'blocks') {
                    el('pd-preview-label').textContent = result.meshError ? 'Detailed preview unavailable. Material capture remains available below.' : `Textured build / BlueMap surfaces retrieved ${time(result.meshAt!)}. ${p.geometry.maxY-p.geometry.minY<16?'Region slice, not the whole building. ':''}Hidden interiors and some decorations may be absent. Material tally uses the separate full block capture from ${time(result.capturedAt!)}.`;
                    const v=result.valuation!,rows=v.rows as {material:string;cells:number;valueMicros:number;unknownCells:number;warnings:string[]}[];
                    const estimate=combinedPropertyEstimate(p,v);
                    if(estimate){
                        const info=el('pd-detail-body').querySelector('.pd-detail-info')!;
                        info.querySelector('.pd-price')!.textContent=money(estimate.cents)+(estimate.partial?' + unpriced materials':'');
                        info.querySelector('.pd-subprice')!.textContent='Estimated property value / assessment + materials';
                        info.querySelector('.pd-subprice')!.insertAdjacentHTML('afterend',`<dl class="pd-value-breakdown"><dt>${effectiveStatus(p)==='available'?'Actual asking price':'Server assessment'}</dt><dd>${money(estimate.assessmentCents)}</dd><dt>Known material worth</dt><dd>${money(estimate.materialCents)}</dd></dl><p class="pd-note">Indicative combined estimate, not the purchase price or server net worth. The assessment is not verified land-only and may overlap build value; material worth includes terrain. Labor and scarcity are not priced.</p>`);
                    }
                    if (!result.meshError) {
                    el('pd-property-scene').insertAdjacentHTML('afterend',`<div class="pd-height-controls"><label>View from Y<input id="pd-view-min-y" type="number" min="${result.minY}" max="${result.maxY}" value="${result.minY}"/></label><label>To Y<input id="pd-view-max-y" type="number" min="${result.minY}" max="${result.maxY}" value="${result.maxY}"/></label><button id="pd-height-apply" class="pd-button">Apply view</button><button id="pd-height-reset" class="pd-button">Full height</button></div>`);
                    const applyHeight=()=>{
                        const min=Number(el<HTMLInputElement>('pd-view-min-y').value),max=Number(el<HTMLInputElement>('pd-view-max-y').value);
                        if(!current.heightRange(min,max))toast('That height range is empty or outside this capture.');
                    };
                    el('pd-height-apply').onclick=applyHeight;
                    el('pd-height-reset').onclick=()=>{el<HTMLInputElement>('pd-view-min-y').value=String(result.minY);el<HTMLInputElement>('pd-view-max-y').value=String(result.maxY);applyHeight();};
                    }
                    el('pd-property-scene').parentElement!.insertAdjacentHTML('beforeend', `<section class="pd-materials"><h3>Estimated material worth</h3><p class="pd-price">${money(v.knownSubtotalCents)}${v.totalCents===null?' <small>known subtotal</small>':''}</p><p>${result.count!.toLocaleString()} occupied block cells &middot; ${rows.length} materials &middot; ${v.unknownCells.toLocaleString()} unpriced cells</p><p class="pd-note">Whole captured volume, including terrain. Existing server BOM rules at item worth; not a sale, salvage or paste quote. Land, scarcity and workmanship are excluded. Worth export: ${esc(time(v.observedAt))}.</p><details><summary>Block and value breakdown</summary><div class="pd-material-scroll"><table><thead><tr><th>Block type</th><th>Cells</th><th>Known worth</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.material.replace('minecraft:','').replaceAll('_',' '))}${r.warnings.map(w=>`<small>${esc(w)}</small>`).join('')}</td><td>${r.cells.toLocaleString()}</td><td>${r.unknownCells===r.cells?'Unpriced':money(Math.round(r.valueMicros/10000))}${r.unknownCells>0&&r.unknownCells<r.cells?' + unknown':''}</td></tr>`).join('')}</tbody></table></div></details></section>`);
                }
            }).catch(() => { if (!currentAbort.signal.aborted)
                el('pd-preview-label').textContent = 'Building capture unavailable. Region footprint shown instead.'; });
        }
    }
    catch {
        el('pd-property-scene').textContent = '3D unavailable. Open BlueMap or use the property details.';
    } }
    el('pd-detail-close').onclick = () => detail.close();
    detail.addEventListener('close', () => { previewAbort?.abort(); detailScene?.dispose(); detailScene = null; });
    el('pd-comparison-close').onclick = () => comparison.close();
    el('pd-compare-open').onclick = () => { const selected = catalog.properties.filter(p => compare.has(p.id)); el('pd-comparison-body').innerHTML = `<div class="pd-compare-grid">${selected.map(p => `<section class="pd-compare-column"><h3>${esc(p.region)}</h3><dl><dt>Tenure</dt><dd>${p.tenure === 'rent' ? 'Rental' : 'Purchase'}</dd><dt>Asking / assessed</dt><dd>${esc(priceLabel(p))}</dd><dt>Weekly equivalent (rent only)</dt><dd>${weeklyCents(p) === null ? 'Not applicable / unknown' : money(Math.round(weeklyCents(p)!))}</dd><dt>Footprint</dt><dd>${area(p).toLocaleString()} blocks&sup2;</dd><dt>Availability</dt><dd>${STATUS[effectiveStatus(p)]}</dd><dt>Owner / tenant</dt><dd>${esc(p.owner?.name || 'Not published')}</dd><dt>Other costs</dt><dd>Not verified. Check in game.</dd></dl></section>`).join('')}</div>`; comparison.showModal(); };
    el('pd-compare-clear').onclick = () => { compare.clear(); render(); };
    el('property-desk').addEventListener('click', async (e) => { const target = (e.target as HTMLElement).closest<HTMLElement>('button,[data-owner]'); if (!target)
        return; const d = target.dataset; if (d.open) {
        const p = catalog?.properties.find(p => p.id === d.open);
        if (p)
            openDetail(p);
    }
    else if (d.save) {
        saved = saved.includes(d.save) ? saved.filter(id => id !== d.save) : [...saved, d.save].slice(-100);
        render();
    }
    else if (d.view) {
        view = d.view;
        page = 1;
        selectedOwner = '';
        render();
    }
    else if (d.tenure !== undefined) {
        tenure = d.tenure;
        page = 1;
        document.querySelectorAll('[data-tenure]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-tenure') === tenure)));
        render();
    }
    else if (d.page) {
        page += Number(d.page);
        render();
    }
    else if (d.owner) {
        selectedOwner = d.owner;
        view = 'browse';
        page = 1;
        detail.close();
        render();
    }
    else if (d.gps) {
        try {
            await navigator.clipboard.writeText(`/gps ${d.gps}`);
            toast('GPS command copied. Run it in the matching world.');
        }
        catch {
            toast(`/gps ${d.gps}`);
        }
    } });
    content.addEventListener('change', e => { const input = e.target as HTMLInputElement; const id = input.dataset.compare; if (!id)
        return; if (input.checked && compare.size >= 3) {
        input.checked = false;
        toast('Compare up to three properties.');
        return;
    } input.checked ? compare.add(id) : compare.delete(id); updateCompare(); });
    for (const id of ['pd-world', 'pd-tag', 'pd-status-filter', 'pd-budget', 'pd-sort'])
        el(id).addEventListener('change', () => { page = 1; render(); });
    el('pd-query').addEventListener('input', () => { clearTimeout(queryTimer); queryTimer = setTimeout(() => { page = 1; render(); }, 150); });
    el('pd-reset').onclick = () => { for (const id of ['pd-query', 'pd-world', 'pd-tag', 'pd-status-filter', 'pd-budget'])
        el<HTMLInputElement>(id).value = ''; el<HTMLSelectElement>('pd-sort').value = 'price'; tenure = ''; selectedOwner = ''; page = 1; document.querySelectorAll('[data-tenure]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-tenure') === ''))); render(); };
    icons();
    updateSaved();
    try {
        const response = await fetch('/property-data/catalog.json', { signal: AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit' });
        if (!response.ok)
            throw Error('Feed unavailable');
        const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let total=0;
        for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>5000000){await reader.cancel();throw Error('Feed too large');}chunks.push(value);}
        const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        catalog = validateCatalog(JSON.parse(new TextDecoder().decode(bytes)));
        const q = new URLSearchParams(location.search);
        view = ['browse', 'saved', 'map', 'owners', 'history'].includes(q.get('view') || '') ? q.get('view')! : 'browse';
        tenure = ['buy', 'rent'].includes(q.get('tenure') || '') ? q.get('tenure')! : '';
        selectedOwner = q.get('owner') || '';
        for (const [key, id] of [['q', 'pd-query'], ['status', 'pd-status-filter'], ['max', 'pd-budget'], ['sort', 'pd-sort']])
            if (q.has(key))
                el<HTMLInputElement>(id).value = q.get(key)!;
        const worlds = [...new Map(catalog.properties.map(p => [p.worldId, p.world])).entries()];
        el('pd-world').insertAdjacentHTML('beforeend', worlds.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join(''));
        el('pd-tag').insertAdjacentHTML('beforeend', [...new Set(catalog.properties.flatMap(p => p.tags))].sort().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join(''));
        if (q.has('world'))
            el<HTMLSelectElement>('pd-world').value = q.get('world')!;
        if (q.has('tag'))
            el<HTMLSelectElement>('pd-tag').value = q.get('tag')!;
        document.querySelectorAll('[data-tenure]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-tenure') === tenure)));
        render();
    }
    catch {
        el('pd-freshness').textContent = 'Property data is unavailable. No prices or availability can be verified.';
        el('pd-freshness').dataset.stale = 'true';
        content.setAttribute('aria-busy', 'false');
        content.innerHTML = '<div class="pd-empty"><h2>The property desk is waiting on a verified snapshot</h2><p>Property signs and /arm info in game remain the source of truth.</p></div>';
    }
    const refresh = setInterval(freshness, 60000);
    window.addEventListener('pagehide', () => { clearInterval(refresh); clearTimeout(toastTimer); clearTimeout(queryTimer); mapScene?.dispose(); detailScene?.dispose(); previewAbort?.abort(); }, { once: true });
}
