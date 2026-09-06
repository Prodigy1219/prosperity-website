// Uses the preinstalled desktop QA runtime. No added project test dependency.
const {chromium}=require(process.env.PROPERTY_PLAYWRIGHT);
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const out=process.env.PROPERTY_QA_DIR;
const base=process.env.PROPERTY_BASE_URL||'http://127.0.0.1:4325';
if(!out)throw Error('Set PROPERTY_QA_DIR');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 try{
  for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/');
   const propertyLink=page.locator('footer a[href="/properties"]');
   assert.equal(await propertyLink.count(),1,'one property entry in existing-site footer');
   await propertyLink.scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home footer overflow');
   await page.screenshot({path:path.join(out,`${name}-footer.png`),fullPage:false});
   await propertyLink.click();await page.waitForSelector('.pd-card');
   assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://www.prosperitysmp.com/properties');
   assert.match(await page.locator('#pd-result-count').innerText(),/53 properties/);
   assert.equal(await page.locator('.pd-card').count(),18);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow');
   await page.screenshot({path:path.join(out,`${name}-browse.png`),fullPage:false});
   await page.locator('#pd-query').fill('market_stall');await page.waitForFunction(()=>document.querySelector('#pd-result-count').textContent.startsWith('10 '));
   await page.locator('[data-save]').first().click();await page.locator('[data-view="saved"]').click();
   assert.equal(await page.locator('.pd-card').count(),1);
   await page.reload();await page.waitForSelector('.pd-card');assert.equal(await page.locator('.pd-card').count(),1,'saved persistence');
   await page.locator('#pd-reset').click();await page.locator('[data-view="browse"]').click();
   for(let i=0;i<4;i++)await page.locator('[data-compare]').nth(i).click();
   assert.equal(await page.locator('[data-compare]:checked').count(),3,'comparison cap');
   await page.locator('#pd-compare-open').click();assert.equal(await page.locator('.pd-compare-column').count(),3);await page.locator('#pd-comparison-close').click();
   await page.locator('#pd-query').fill('c001');await page.waitForFunction(()=>document.querySelector('#pd-result-count').textContent.startsWith('1 '));
   await page.locator('.pd-thumb').first().click();await page.waitForFunction(()=>document.querySelector('#pd-preview-label').textContent.includes('Full block-volume capture'));
   assert.match(await page.locator('.pd-materials').innerText(),/57,231 occupied block cells/);
   const canvas=page.locator('#pd-property-scene canvas');
   const before=await canvas.screenshot({path:path.join(out,`${name}-surface.png`)});
   const materialSummary=await page.locator('.pd-materials').innerText();
   await page.locator('#pd-view-min-y').fill('72');await page.locator('#pd-height-apply').click();
   const heightCut=await canvas.screenshot({path:path.join(out,`${name}-height-cut.png`)});
   assert.notEqual(crypto.createHash('sha256').update(before).digest('hex'),crypto.createHash('sha256').update(heightCut).digest('hex'),'height cut changes visible geometry');
   assert.equal(await page.locator('.pd-materials').innerText(),materialSummary,'height controls never change valuation');
   const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:10});await page.mouse.up();
   const after=await canvas.screenshot();assert.notEqual(crypto.createHash('sha256').update(before).digest('hex'),crypto.createHash('sha256').update(after).digest('hex'),'orbit changes canvas pixels');
   await page.screenshot({path:path.join(out,`${name}-detail.png`),fullPage:false});await page.locator('#pd-detail-close').click();await page.locator('#pd-property-scene canvas').waitFor({state:'detached'});
   await page.locator('#pd-reset').click();await page.locator('[data-view="map"]').click();await page.waitForSelector('#pd-region-scene canvas');
   await page.waitForTimeout(1000);await page.locator('#pd-region-scene canvas').screenshot({path:path.join(out,`${name}-map.png`)});
   await page.locator('[data-view="owners"]').click();assert.equal(await page.locator('.pd-owner').count(),7);assert.equal(await page.locator('#pd-region-scene canvas').count(),0,'view change disposes map');
   await page.locator('[data-view="history"]').click();assert.equal(await page.locator('.pd-history-row').count(),4);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'final overflow');assert.deepEqual(errors,[]);
   results.push({viewport:name,width,height,passed:true,pageErrors:errors});await page.close();
  }
  const bad=await browser.newPage();const errors=[];bad.on('pageerror',e=>errors.push(e.message));await bad.route('**/property-data/catalog.json',r=>r.fulfill({status:503,body:'down'}));await bad.goto(base+'/properties');await bad.waitForSelector('.pd-empty');await bad.locator('[data-view="map"]').click();assert.match(await bad.locator('#pd-freshness').innerText(),/unavailable/);assert.deepEqual(errors,[]);results.push({case:'feed unavailable',passed:true});await bad.close();
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
