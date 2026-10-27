const path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function checkModal(page,id,width,height){
 await page.evaluate(id=>document.getElementById(id).classList.add('open'),id);await page.waitForTimeout(300);
 const sheet=page.locator('#'+id+' .msh'),rect=await sheet.boundingBox();
 assert.ok(Math.abs(rect.x)<1&&Math.abs(rect.width-width)<1,id+' touches both sides');
 assert.ok(Math.abs(rect.y+rect.height-height)<1,id+' touches bottom');
 assert.ok(rect.y>=Math.min(height*.15,32),id+' leaves space at top');
 const failures=await sheet.evaluate(el=>{
  const errors=[];
  for(const row of el.querySelectorAll('.m-date-row,.date-filter-grid,.settings-form-grid,.tdc-source-grid,.tdc-form-row.two')){
   const fields=Array.from(row.querySelectorAll(':scope > .fg')).filter(n=>n.getClientRects().length);
   const controls=fields.map(f=>f.querySelector('input,select')).filter(n=>n&&n.getClientRects().length);
   for(const input of controls){const r=input.getBoundingClientRect(),p=input.parentElement.getBoundingClientRect();if(r.width>p.width+1||r.left<p.left-1||r.right>p.right+1)errors.push(input.id+' overflows its column');}
   if(controls.length===2){const a=controls[0].getBoundingClientRect(),b=controls[1].getBoundingClientRect();if(Math.abs(a.y-b.y)>1||Math.abs(a.height-b.height)>1||a.right>b.left)errors.push(controls.map(n=>n.id).join('/')+' misaligned: '+JSON.stringify([a.toJSON(),b.toJSON()]));}
  }
  const content=el.querySelector('.sheet-content');if(content.scrollWidth>content.clientWidth+1)errors.push('horizontal overflow');
  return errors;
 });assert.deepEqual(failures,[],id);
 const close=page.locator('#'+id+' .sheet-close'),before=await close.boundingBox();
 await page.locator('#'+id+' .sheet-content').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.equal((await close.boundingBox()).y,before.y);await close.click();
}
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));
  try{
   await page.route('**/api/apps-script',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue();});
   await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>{document.documentElement.style.setProperty('--sb','34px');document.documentElement.style.setProperty('--st','47px');});
   const boot=await page.locator('#boot-loader').boundingBox();assert.equal(boot.y+boot.height,844);
   await page.screenshot({path:path.resolve('../evidence/immersive-boot-'+engine+'.png')});
   await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});await page.unroute('**/api/apps-script');
   await page.evaluate(()=>abrirConfiguracion());await page.waitForFunction(()=>G.configuracion);await page.locator('#mov-config .sheet-close').click();
   await page.evaluate(()=>{abrirModalJapon();});await page.waitForSelector('#j-modal-body .japan-section-heading');await page.locator('#mov-japon .sheet-close').click();
   await page.evaluate(()=>abrirModalCat('Deseos'));await page.locator('#mov-cat .sheet-close').click();
   await page.evaluate(()=>{navTo('balance');});await page.waitForFunction(()=>G.balance);await page.evaluate(()=>abrirBalanceLog());await page.waitForSelector('.history-entry');await page.locator('#mov-bal-log .sheet-close').click();
   // Include editor forms and both layouts of the deferred-payment modal.
   await page.evaluate(()=>{abrirEditorTarjeta();abrirPartidaJapon('tramites');eid('tdc-mes-aplica-box').style.display='';eid('tdc-abono-extra').style.display='';});
   await checkModal(page,'mov-tdc-dif',390,844);
   await page.evaluate(()=>{eid('tdc-dif-add').style.display='none';eid('tdc-dif-pay').style.display='';});
   for(const [width,height] of [[390,844],[360,640],[430,932],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const app=await page.locator('#app').boundingBox(),nav=await page.locator('.bnv').boundingBox();
    assert.equal(app.height,height);assert.equal(nav.y+nav.height,height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.evaluate(()=>abrirModal('egreso'));await page.waitForTimeout(300);
    if(width===390)await page.screenshot({path:path.resolve('../evidence/immersive-egreso-'+engine+'.png')});
    await page.locator('#mov .sheet-close').click();
    for(const id of await page.locator('.mov').evaluateAll(ns=>ns.map(n=>n.id)))await checkModal(page,id,width,height);
    console.log('PASS '+engine+' '+width+'x'+height+': all modal edges, field rows, fixed close and full-height app.');
   }
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>{navTo('home');});await page.screenshot({path:path.resolve('../evidence/immersive-home-'+engine+'.png')});
   await page.evaluate(()=>abrirConfiguracion());await page.waitForTimeout(300);await page.screenshot({path:path.resolve('../evidence/immersive-settings-'+engine+'.png')});await page.locator('#mov-config .sheet-close').click();
   // Simulate the visual viewport panning above an on-screen keyboard.
   await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:400});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:100});visualViewport.dispatchEvent(new Event('resize'));abrirModal('egreso');});await page.waitForTimeout(300);
   const keyboard=await page.locator('#mov .msh').boundingBox();assert.ok(keyboard.y>=132);assert.equal(keyboard.y+keyboard.height,500);await page.locator('#mov .sheet-close').click();
   assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
