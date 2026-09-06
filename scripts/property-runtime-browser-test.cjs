// Real projected assets, intercepted locally: no publication or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
const {chromium} = require(process.env.PROPERTY_PLAYWRIGHT || 'C:/Users/Kings/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const web = path.resolve(__dirname, '..');
const base = process.env.PROPERTY_BASE_URL || 'http://127.0.0.1:4326';
const digest = b => createHash('sha256').update(b).digest('hex');

(async () => {
  const {projectGeneration} = await import(pathToFileURL(process.env.PROPERTY_PUBLISHER || 'S:/season-0-economy-server/deploy/property-refresh-20260906/publisher.mjs').href);
  const {estimateBlockWorth, combinedPropertyEstimate} = await import(pathToFileURL(path.join(web, 'src/lib/property-build.mjs')).href);
  const {money} = await import(pathToFileURL(path.join(web, 'src/lib/property-core.mjs')).href);
  const g = projectGeneration(web, new Date(Date.now() - 120000));
  const initial = g.manifest, next = structuredClone(initial);
  const c006 = initial.catalog.properties.find(p => p.id === 'world:c006');
  assert.equal(c006.priceCents, 1948800, 'real c006 assessment fixture (not $60,000)');
  const c006Estimate = money(c006.priceCents + initial.materialValues[c006.id].knownSubtotalCents);
  const r008 = initial.catalog.properties.find(p => p.id === 'world:r008');
  assert.equal(r008.priceCents, 6000000, 'real $60,000 assessment belongs to r008');
  const r008Estimate = money(r008.priceCents + initial.materialValues[r008.id].knownSubtotalCents);
  next.publishedAt = new Date(Date.parse(initial.publishedAt) + 60000).toISOString();
  const listing = next.catalog.properties.find(p => p.id === 'world:c001');
  listing.priceCents += 10000;
  for (const key of Object.keys(next.worth.prices.unitMicros)) next.worth.prices.unitMicros[key] *= 2;
  for (const p of next.catalog.properties) {
    const a = g.assets.get(path.basename(p.preview.url));
    const value = estimateBlockWorth(JSON.parse((a.data || fs.readFileSync(a.file)).toString()), next.worth);
    next.materialValues[p.id] = {knownSubtotalCents: value.knownSubtotalCents, totalCents: value.totalCents, unknownCells: value.unknownCells};
  }
  // A distinct, valid metadata hash proves a reopened detail uses the new mesh map too.
  const oldMeta = g.assets.get(path.basename(initial.meshes[listing.id]));
  const newMeta = JSON.parse((oldMeta.data || fs.readFileSync(oldMeta.file)).toString());
  newMeta.observedAt = next.publishedAt;
  const metaBytes = Buffer.from(JSON.stringify(newMeta)), metaName = digest(metaBytes) + '.json';
  g.assets.set(metaName, {data: metaBytes}); next.meshes[listing.id] = '/property-runtime/assets/' + metaName;
  const captureAsset = g.assets.get(path.basename(listing.preview.url));
  const capture = JSON.parse((captureAsset.data || fs.readFileSync(captureAsset.file)).toString());
  const expected = money(combinedPropertyEstimate(listing, estimateBlockWorth(capture, next.worth)).cents);
  const browser = await chromium.launch({executablePath: process.env.PROPERTY_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [], assetRequests = [], missingAssets = [];
    let current = initial, manifestRequests = 0, hold = null, heldResolve, inFlight = 0, peakInFlight = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.fulfill({status: 204, body: ''});
      if (url.pathname === '/property-runtime/current.json') {
        manifestRequests++; inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
        const body = JSON.stringify(current);
        if (hold) { heldResolve(); await hold; }
        try { await route.fulfill({status: 200, contentType: 'application/json', body}); }
        finally { inFlight--; }
        return;
      }
      if (url.pathname.startsWith('/property-runtime/assets/')) {
        assetRequests.push(url.pathname);
        const a = g.assets.get(path.basename(url.pathname));
        if (!a) { missingAssets.push(url.pathname); return route.fulfill({status: 404, body: ''}); }
        return route.fulfill({status: 200, contentType: url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: a.data || fs.readFileSync(a.file)});
      }
      return route.continue();
    });
    const visible = () => page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const poll = async value => {
      current = value; const before = manifestRequests; await visible();
      await page.waitForFunction(() => !document.hidden);
      await assertPoll(() => manifestRequests === before + 1 && inFlight === 0);
    };
    async function assertPoll(predicate) {
      for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 30)); }
      assert.ok(predicate(), 'expected runtime request completed');
    }
    const open = async (region = 'c001') => {
      await page.locator(`[data-open="world:${region}"]`).first().click();
      await page.waitForFunction(() => document.querySelector('#pd-preview-label')?.textContent.startsWith('Textured build'), null, {timeout: 45000});
    };
    const cardPrice = region => page.locator('.pd-card').filter({has: page.locator(`[data-open="world:${region}"]`)}).locator('.pd-price');
    await page.goto(base + '/properties?q=c006');
    await page.waitForSelector('.pd-card');
    assert.equal((await cardPrice('c006').innerText()).trim(), c006Estimate, 'c006 card adds material subtotal to actual assessment');
    await open('c006');
    assert.equal(await page.locator('.pd-detail-info > .pd-price').innerText(), c006Estimate, 'c006 detail and listing estimate agree');
    assert.match(await page.locator('.pd-appraisal-value .pd-value-breakdown').innerText(), /19,488\.00/, 'original c006 assessment stays distinct');
    await page.locator('#pd-detail-close').click();
    await page.locator('#pd-query').fill('r008'); await page.locator('[data-open="world:r008"]').first().waitFor();
    assert.equal((await cardPrice('r008').innerText()).trim(), r008Estimate, 'r008 card includes materials above its $60,000 assessment');
    await open('r008');
    assert.equal(await page.locator('.pd-detail-info > .pd-price').innerText(), r008Estimate, '$60,000-base listing and detail agree');
    assert.match(await page.locator('.pd-appraisal-value .pd-value-breakdown').innerText(), /60,000\.00/, 'original r008 assessment stays distinct');
    await page.locator('#pd-detail-close').click();
    await page.locator('#pd-query').fill('c001');
    await page.locator('[data-open="world:c001"]').first().waitFor();
    await page.waitForSelector('.pd-card');
    assert.equal((await page.locator('.pd-card .pd-price').innerText()).trim(), '$33,640.98', 'listing card includes materials before opening detail');
    await open();
    assert.match(await page.locator('#pd-freshness').innerText(), /Automatic snapshot published/);
    const price = page.locator('.pd-detail-info > .pd-price');
    assert.equal(await price.innerText(), '$33,640.98');
    assert.match(await page.locator('.pd-materials').innerText(), /57,231 occupied block cells/);
    assert.ok(assetRequests.some(u => u.endsWith('.mesh')) && assetRequests.some(u => u.endsWith('.png')), 'runtime geometry and textures fetched');
    const canvas = page.locator('#pd-property-scene canvas'), before = await canvas.screenshot();
    const box = await canvas.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, {steps: 8}); await page.mouse.up();
    assert.notEqual(digest(before), digest(await canvas.screenshot()), 'rendered geometry responds to orbit');
    const pinned = await page.locator('#pd-detail-body').innerText();
    await poll(next);
    await page.waitForFunction(value => document.querySelector('.pd-card .pd-price')?.textContent.trim() === value, expected);
    assert.equal(await page.locator('#pd-detail-body').innerText(), pinned, 'open detail remains on its original coherent bundle');
    assert.equal(assetRequests.includes(next.meshes[listing.id]), false, 'refresh does not replace the open mesh');
    await page.locator('#pd-detail-close').click(); await open();
    assert.equal(await price.innerText(), expected, 'reopen uses new assessment and new material worth');
    assert.ok(assetRequests.includes(next.meshes[listing.id]), 'reopen uses the matching new mesh map');
    const updated = await page.locator('#pd-detail-body').innerText();
    await poll({...next, publishedAt: new Date(Date.parse(next.publishedAt) + 1000).toISOString(), meshes: {}});
    await page.waitForFunction(() => document.querySelector('#pd-freshness').textContent.includes('Latest refresh failed'));
    assert.equal(await page.locator('#pd-detail-body').innerText(), updated, 'malformed refresh retains open detail');
    assert.equal((await page.locator('.pd-card .pd-price').innerText()).trim(), expected, 'malformed refresh retains catalog and material subtotal');
    await poll(initial);
    await page.waitForFunction(() => !document.querySelector('#pd-freshness').textContent.includes('Latest refresh failed'));
    assert.equal((await page.locator('.pd-card .pd-price').innerText()).trim(), expected, 'older valid generation cannot replace last good');
    await page.locator('#pd-detail-close').click(); await open();
    assert.equal(await price.innerText(), expected, 'older generation cannot downgrade worth bundle');
    let release;
    hold = new Promise(r => { release = r; });
    const entered = new Promise(r => { heldResolve = r; });
    await visible(); await entered; const count = manifestRequests;
    await visible(); await visible(); await page.waitForTimeout(100);
    assert.equal(manifestRequests, count, 'visibility bursts do not overlap a pending request');
    release(); hold = null; await assertPoll(() => inFlight === 0);
    assert.equal(peakInFlight, 1); assert.deepEqual(missingAssets, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({passed: true, properties: initial.catalog.properties.length, runtimeAssetsFetched: assetRequests.length, c006Estimate, r008Estimate, initialEstimate: '$33,640.98', refreshedEstimate: expected, cases: ['c006 and r008 combined card/detail equality', 'textured render and orbit', 'visibility refresh', 'pinned detail', 'coherent reopen', 'malformed retains last good', 'older generation rejected', 'nonoverlapping polls']}));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
