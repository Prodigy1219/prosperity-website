const {chromium}=require(process.env.PROPERTY_PLAYWRIGHT);
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const base=process.env.PROPERTY_BASE_URL||'http://127.0.0.1:4326';
const out=process.env.PROPERTY_QA_DIR;if(!out)throw Error('Set PROPERTY_QA_DIR');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const results=[];
 try{
  const context=await b.newContext();
  await context.route('**/property-runtime/current.json',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
   const p=await context.newPage(),errors=[];await p.setViewportSize({width,height});
   p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.goto(base+'/properties');await p.waitForSelector('.pd-card');
   for(const id of ['c006','r001','apt_01','market_stall_01']){
    await p.locator('#pd-query').fill(id);const button=p.locator(`[data-open="world:${id}"]`).first();await button.waitFor();await button.click();
    await p.waitForFunction(()=>document.querySelector('#pd-preview-label').textContent.startsWith('Textured build'),{},{timeout:45000});
    await p.locator('#pd-property-scene canvas').screenshot({path:path.join(out,`${name}-${id}.png`)});
    assert.ok(await p.locator('.pd-materials').isVisible(),'independent valuation present');
    if(id==='apt_01')assert.equal(await p.locator('.pd-value-breakdown').count(),0,'rental price never summed with capital');
    await p.locator('#pd-detail-close').click();await p.locator('#pd-property-scene canvas').waitFor({state:'detached'});
    results.push({viewport:name,property:id,passed:true});
   }
   assert.deepEqual(errors,[]);await p.close();
  }
  // Corrupt bytes cannot become a render. Existing truthful material data survives.
  const p=await context.newPage();await p.route('**/property-meshes/*.mesh',r=>r.fulfill({status:200,body:'corrupt'}));
  await p.goto(base+'/properties');await p.waitForSelector('.pd-card');await p.locator('#pd-query').fill('c001');
  await p.locator('[data-open="world:c001"]').first().click();
  await p.waitForFunction(()=>document.querySelector('#pd-preview-label').textContent.includes('Detailed preview unavailable'));
  assert.match(await p.locator('.pd-materials').innerText(),/57,231 occupied block cells/);
  assert.equal(await p.locator('.pd-height-controls').count(),0,'no nonfunctional controls on fallback');
  results.push({case:'corrupt mesh retains valuation',passed:true});await p.close();
  fs.writeFileSync(path.join(out,'detail-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
