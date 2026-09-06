// Real captures + explicit synthetic clocks/status changes; no production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PROPERTY_PLAYWRIGHT||'C:/Users/Kings/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const web=path.resolve(__dirname,'..'),base=process.env.PROPERTY_BASE_URL||'http://127.0.0.1:4326';
const out=process.env.PROPERTY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'property-advisory-qa-'));
fs.mkdirSync(out,{recursive:true});
const amount=s=>Math.round(Number(s.match(/\$([\d,.]+)/)?.[1].replaceAll(',',''))*100);
(async()=>{
 const {projectGeneration}=await import(pathToFileURL('S:/season-0-economy-server/deploy/property-refresh-20260906/publisher.mjs').href);
 const generation=projectGeneration(web),now=Date.now();
 generation.manifest.catalog.observedAt=new Date(now-30*60000).toISOString();
 generation.manifest.catalog.expiresAt=new Date(now-15*60000).toISOString();
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 try{
  for(const[name,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   const page=await b.newPage({viewport:{width,height}}),errors=[];let current=structuredClone(generation.manifest),requests=0;
   page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(now));
   await page.route('**/property-runtime/**',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/property-runtime/current.json'){requests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(current)});}
    const a=generation.assets.get(path.basename(u.pathname));assert.ok(a,'real runtime asset present');
    return route.fulfill({status:200,body:a.data||fs.readFileSync(a.file)});
   });
   await page.goto(base+'/properties?q=c001');await page.waitForSelector('.pd-card');
   const card=page.locator('.pd-card').filter({has:page.locator('[data-open="world:c001"]')});
   const cardValue=amount(await card.locator('.pd-price').innerText());
   assert.ok(cardValue>3364098&&cardValue<=3364098+241920,'fresh hourly evidence earns bounded uplift despite expired availabilityTTL');
   await card.locator('[data-open]').first().click();
   await page.waitForFunction(()=>document.querySelector('#pd-preview-label')?.textContent.startsWith('Textured build'),null,{timeout:45000});
   const detail=page.locator('.pd-detail-info'),values=await detail.locator('.pd-appraisal-value .pd-value-breakdown dd').allTextContents();
   assert.equal(amount(await detail.locator(':scope > .pd-price').innerText()),cardValue,'card/detail same formula+generation');
   assert.equal(amount(values[0]),1209600);assert.equal(amount(values[1]),2154498);
   const increments=values.slice(2,5).map(s=>s==='Not applied'?0:amount(s));
   assert.equal(amount(values.at(-1)),3364098+increments.reduce((a,b)=>a+b,0),'visible components add exactly');
   assert.match(await detail.innerText(),/not the purchase price/);
   assert.match(await page.locator('[data-evidence="spawn"]').innerText(),/85 blocks/);
   assert.match(await page.locator('[data-evidence="traffic"]').innerText(),/Not measured/);
   assert.match(await page.locator('[data-evidence="comps"]').innerText(),/0 eligible sales/);
   const original=await detail.innerText(),next=structuredClone(current);
   next.publishedAt=new Date(now+1000).toISOString();next.catalog.properties.find(p=>p.region==='c002').status='unknown';
   current=next;const before=requests;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   for(let i=0;i<60&&requests===before;i++)await page.waitForTimeout(20);
   assert.equal(requests,before+1);await page.waitForTimeout(150);
   assert.equal(await detail.innerText(),original,'open detail pinned despite supply refresh');
   await page.locator('#pd-detail-close').click();await page.locator('[data-open="world:c001"]').first().click();
   await page.waitForFunction(()=>document.querySelector('.pd-appraisal-value')!==null);
   assert.match(await page.locator('[data-evidence="supply"]').innerText(),/1 unknown/);
   const fresh=await page.locator('.pd-appraisal-value .pd-value-breakdown dd').allTextContents();assert.equal(fresh[3],'Not applied','unknown peer suppresses supply dollars');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('#pd-detail').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   await page.locator('#pd-detail').screenshot({path:path.join(out,name+'-advisory.png')});
   await page.locator('#pd-detail-close').click();
   await page.locator('#pd-query').fill('apt_01');await page.locator('[data-open="world:apt_01"]').first().click();
   await page.waitForFunction(()=>document.querySelector('.pd-materials')!==null);
   assert.equal(await page.locator('.pd-appraisal-value').count(),0,'rent not converted into capital');
   assert.deepEqual(errors,[]);results.push({viewport:name,cardDetailParity:true,bounded:true,refreshPinned:true,rentSeparated:true});await page.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({results,out}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
