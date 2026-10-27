const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});
 assert.ok(!(await page.locator('#page-home').innerText()).includes('Egresos totales:'));
 await page.evaluate(()=>abrirConfiguracion());await page.waitForFunction(()=>G.configuracion);await page.waitForTimeout(350);
 await page.screenshot({path:path.resolve('../evidence/aero-settings-mobile.png')});
 const bounds=await page.locator('#mov-config .msh').boundingBox();assert.ok(bounds.height<=844*.85);assert.ok(bounds.y>100);
 const close=page.locator('#mov-config .sheet-close'),before=await close.boundingBox();
 await page.locator('#mov-config .sheet-content').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.equal((await close.boundingBox()).y,before.y);assert.ok(await close.isVisible());
 await close.click();await page.waitForSelector('#mov-config.open',{state:'hidden'});
 await page.evaluate(()=>abrirConfiguracion('japon'));await page.waitForSelector('#cfg-section-japon:not([hidden])');
 assert.equal(await page.locator('#cfg-section-tarjetas').isVisible(),false);
 await page.getByRole('button',{name:'+ Vincular',exact:true}).click();assert.ok(await page.locator('#cfg-allocation-asset').isVisible());
 await page.getByRole('tab',{name:'Catálogos',exact:true}).click();assert.ok(await page.locator('.settings-shortcuts').isVisible());
 await page.screenshot({path:path.resolve('../evidence/aero-settings-catalogs-mobile.png')});
 await page.keyboard.press('Escape');await page.waitForSelector('#mov-config.open',{state:'hidden'});
 await page.evaluate(()=>{navTo('balance');});await page.waitForFunction(()=>G.balance);await page.evaluate(()=>abrirBalanceLog());await page.waitForSelector('.history-entry');await page.waitForTimeout(350);
 await page.screenshot({path:path.resolve('../evidence/aero-history-mobile.png')});
 await page.locator('.history-entry').first().locator('summary').click();await page.screenshot({path:path.resolve('../evidence/aero-history-detail-mobile.png')});
 const closeHistory=page.locator('#mov-bal-log .sheet-close'),firstY=(await closeHistory.boundingBox()).y;
 await page.locator('#mov-bal-log .sheet-content').evaluate(el=>el.scrollTop=el.scrollHeight);assert.equal((await closeHistory.boundingBox()).y,firstY);
 await closeHistory.click();
 // Every existing modal gets the same reachable close control and stays within the viewport.
 for(const id of await page.locator('.mov').evaluateAll(nodes=>nodes.map(n=>n.id))){
   await page.evaluate(id=>document.getElementById(id).classList.add('open'),id);await page.waitForTimeout(280);
   const sheet=page.locator('#'+id+' .msh'),b=await sheet.boundingBox();assert.ok(b.width<=390&&b.height<=844*.85,id);
   const content=page.locator('#'+id+' .sheet-content');await content.evaluate(el=>el.scrollTop=el.scrollHeight);
   const x=page.locator('#'+id+' .sheet-close');assert.ok(await x.isVisible(),id);await x.click();
 }
 await page.evaluate(()=>navTo('flujo'));await page.waitForFunction(()=>G.flujo);assert.ok(!(await page.locator('#fl-tabla').innerText()).includes('Efectivo disponible:'));
 await page.setViewportSize({width:360,height:640});await page.evaluate(()=>abrirConfiguracion());await page.waitForTimeout(350);
 assert.equal(await page.locator('#mov-config .sheet-content').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await page.screenshot({path:path.resolve('../evidence/aero-settings-small-mobile.png')});
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(300);await page.screenshot({path:path.resolve('../evidence/aero-settings-desktop.png')});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: removable rows absent; settings tabs; all modals have fixed reachable close; mobile height/overflow; desktop; no JS errors.');
})().catch(e=>{console.error(e);process.exit(1);});
