// Capture visual evidence only. No scores or approvals are generated here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PROPERTY_PLAYWRIGHT||'C:/Users/Kings/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'src/data/property-catalog.json')));
const structures=JSON.parse(fs.readFileSync(path.join(root,'src/data/property-structures.json'))).properties;
const selected=(process.env.PROPERTY_REVIEW_IDS||'c001,c002,c003,c004,c005,c006,c007,r001,r002,r003,r004,r005,r006,r007,r008,r009').split(',');
const out=process.env.PROPERTY_QA_DIR;if(!out)throw Error('Explicit output directory required');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const records=[];
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  await p.route('**/property-runtime/current.json',r=>r.fulfill({status:503,body:'unavailable'}));
  for(const region of selected){
   const parcel=catalog.properties.find(v=>v.region===region);if(!parcel)throw Error('Unknown selected property');
   await p.goto((process.env.PROPERTY_BASE_URL||'http://127.0.0.1:4326')+'/properties?q='+region);
   await p.locator(`[data-open="${parcel.id}"]`).first().click();
   await p.waitForFunction(()=>document.querySelector('#pd-preview-label')?.textContent.startsWith('Textured build'),null,{timeout:45000});
   const canvas=p.locator('#pd-property-scene canvas');
   const evidence=[];
   for(const view of ['initial','opposite']){
    if(view==='opposite'){
     const box=await canvas.boundingBox();await p.mouse.move(box.x+box.width*.65,box.y+box.height*.55);
     await p.mouse.down();await p.mouse.move(box.x+box.width*.18,box.y+box.height*.55,{steps:20});await p.mouse.up();
    }
    const bytes=await canvas.screenshot();const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(out,`${region}-${view}.png`),bytes);
    evidence.push({view,file:`${region}-${view}.png`,sha256:hash});
   }
   if(evidence[0].sha256===evidence[1].sha256)throw Error('Camera views did not change');
   records.push({propertyId:parcel.id,structureHash:structures[parcel.id].structureHash,previewUrl:parcel.preview.url,capturedAt:new Date().toISOString(),evidence});
  }
  fs.writeFileSync(path.join(out,'capture-manifest.json'),JSON.stringify({version:1,records},null,2)+'\n');
  console.log(JSON.stringify({records:records.length,images:records.length*2,out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
