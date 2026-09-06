const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Kings/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),base=process.env.PROPERTY_BASE_URL||'https://www.prosperitysmp.com';
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'src/data',name),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const money=s=>Math.round(Number(s.replace(/[^0-9.]/g,''))*100);
(async()=>{
 const {appraiseProperty}=await import(pathToFileURL(path.join(root,'src/lib/property-valuation.mjs')));
 const {validateRuntimeSnapshot}=await import(pathToFileURL(path.join(root,'src/lib/property-runtime.mjs')));
 const response=await fetch(base+'/property-runtime/current.json');assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/);const snapshot=validateRuntimeSnapshot(await response.json());
 assert.ok(snapshot.catalog.savedReadAt,'saved read survives public proxy');assert.equal(snapshot.catalog.properties.length,53);
 assert.ok(Date.now()-Date.parse(snapshot.publishedAt)<7200000,'hourly publication is fresh');
 for(const p of snapshot.catalog.properties){assert.match(snapshot.materialValues[p.id].structureHash,/^[a-f0-9]{64}$/);
  const r=await fetch(base+p.preview.url);assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());
  assert.equal(digest(b),path.basename(p.preview.url,'.json'));assert.equal(JSON.parse(b).propertyId,p.id);
 }
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'property-live-appraisal-')),results=[];
 try{for(const [label,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  const page=await b.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/properties?q=c001');await page.waitForFunction(()=>document.querySelector('#pd-freshness')?.textContent.includes('Automatic snapshot published'));
  const p=snapshot.catalog.properties.find(p=>p.region==='c001'),v=snapshot.materialValues[p.id];
  const review=read('property-quality-reviews.json').reviews.find(r=>r.propertyId===p.id&&r.structureHash===v.structureHash);
  const expected=appraiseProperty(p,snapshot.catalog,v,{context:read('property-appraisal-context.json'),policy:read('property-valuation-policy.json'),review,structureHash:v.structureHash});
  assert.equal(expected.status,'advisory');assert.ok(expected.appliedBonusCents>0);
  const card=page.locator('.pd-card').filter({has:page.locator('[data-open="world:c001"]')});
  await page.waitForFunction(cents=>Math.round(Number(document.querySelector('.pd-card .pd-price').textContent.replace(/[^0-9.]/g,''))*100)===cents,expected.totalCents);
  assert.equal(money(await card.locator('.pd-price').innerText()),expected.totalCents);
  await card.locator('[data-open]').first().click();await page.waitForFunction(()=>document.querySelector('.pd-appraisal-value')!==null,null,{timeout:45000});
  assert.match(await page.locator('#pd-preview-label').innerText(),/^Textured build/);
  assert.equal(money(await page.locator('.pd-detail-info > .pd-price').innerText()),expected.totalCents);
  if(review)assert.match(await page.locator('[data-evidence="quality"]').innerText(),/AI-assisted design review/);
  assert.match(await page.locator('[data-valuation-freshness]').innerText(),/two hours/);
  const canvas=page.locator('#pd-property-scene canvas');await page.waitForTimeout(300);
  const pixels=await canvas.evaluate(c=>{const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<a.length;i+=64)colors.add(`${a[i]},${a[i+1]},${a[i+2]}`);return colors.size;});
  assert.ok(pixels>80,'textured scene nonblank');const before=digest(await canvas.screenshot()),box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.35,box.y+box.height*.5,{steps:12});await page.mouse.up();await page.waitForTimeout(300);
  assert.notEqual(digest(await canvas.screenshot()),before,'orbit changes rendered scene');
  await page.locator('#pd-detail').screenshot({path:path.join(out,label+'-scene.png')});
  await page.locator('.pd-appraisal-value').scrollIntoViewIfNeeded();await page.locator('#pd-detail').screenshot({path:path.join(out,label+'-value.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#pd-detail').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.deepEqual(errors,[]);
  results.push({label,value:expected.totalCents,premium:expected.appliedBonusCents,colors:pixels});await page.close();
 }}finally{await b.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({publishedAt:snapshot.publishedAt,savedReadAt:snapshot.catalog.savedReadAt,results},null,2));console.log(JSON.stringify({out,results,previewsVerified:53}));
})().catch(e=>{console.error(e);process.exitCode=1;});
