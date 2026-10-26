const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));
 try{
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});
 await page.evaluate(()=>abrirModalJapon());await page.waitForSelector('#j-modal-body .japan-section-heading');
 assert.ok(!(await page.locator('#j-modal-body').innerText()).includes('El progreso suma'));
 await page.getByRole('button',{name:'Seleccionar',exact:true}).click();await page.waitForFunction(()=>G.configuracion);
 await page.evaluate(()=>abrirEditorAsignacion());await page.locator('#cfg-allocation-asset').selectOption('10102.01');
 assert.equal(await page.locator('#cfg-allocation-mode').inputValue(),'full');assert.equal(await page.locator('#cfg-allocation-amount').isVisible(),false);
 const response=page.waitForResponse(r=>r.url().includes('/api/apps-script')&&r.request().postDataJSON()?.fn==='guardarAsignacionMeta');
 await page.locator('#cfg-allocation-save').click();assert.equal((await(await response).json()).ok,true);
 await page.waitForFunction(()=>G.japon&&G.japon.totalVinculado===282.33);
 await page.evaluate(()=>{eid('mov-config').classList.remove('open');abrirModalJapon();});
 await page.getByRole('button',{name:'Añadir Trámites',exact:true}).click();await page.locator('#japan-item-name').fill('Seguro de viaje');await page.locator('#japan-item-budget').fill('100');await page.locator('#japan-item-save').click();
 await page.waitForFunction(()=>G.japon.tramites.some(x=>x.nombre==='Seguro de viaje'));
 await page.getByRole('button',{name:'Editar Seguro de viaje',exact:true}).click();await page.locator('#japan-item-name').fill('Seguro Japón');await page.locator('#japan-item-budget').fill('125');await page.locator('#japan-item-save').click();
 await page.waitForFunction(()=>G.japon.tramites.some(x=>x.nombre==='Seguro Japón'&&x.presupuesto===125));
 await page.evaluate(async()=>{await gsRun('guardarBalanceItem',[{codigo:'10102.01',tipo:'Activo',grupo:'Activos Financieros',nombre:'Banco Pichincha Ahorro Flexible',valor:'350'}]);loadJapon();});
 await page.waitForFunction(()=>G.japon.totalVinculado===350);
 await page.screenshot({path:path.resolve('../evidence/japan-mobile-live.png')});
 await page.getByRole('button',{name:'Editar Seguro Japón',exact:true}).click();await page.screenshot({path:path.resolve('../evidence/japan-mobile-editor.png')});
 await page.getByRole('button',{name:'Eliminar partida',exact:true}).click();await page.waitForFunction(()=>!G.japon.tramites.some(x=>x.nombre==='Seguro Japón'));
 await page.reload();await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});
 await page.evaluate(()=>abrirModalJapon());await page.waitForFunction(()=>G.japon?.totalVinculado===350);
 assert.ok(!await page.evaluate(()=>G.japon.tramites.some(x=>x.nombre==='Seguro Japón')));
 await page.evaluate(()=>{eid('mov-japon').classList.remove('open');navTo('balance');});await page.waitForFunction(()=>G.balance);
 await page.evaluate(()=>abrirBalanceLog());await page.waitForSelector('.history-entry');
 assert.ok(!(await page.locator('#bal-log-modal-list').innerText()).includes('Pendiente de conciliación'));
 await page.locator('.history-filters > summary').click();await page.getByLabel('Mes',{exact:true}).selectOption('2026-08');await page.locator('.history-entry > summary').first().click();
 assert.ok((await page.locator('.history-entry-body').first().innerText()).includes('Movimiento histórico · Sin conciliación'));
 await page.screenshot({path:path.resolve('../evidence/balance-history-minimal-mobile.png')});
 const width=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(width<=360);
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.resolve('../evidence/balance-history-minimal-desktop.png')});
 assert.deepEqual(errors,[]);console.log('PASS mobile: complete-asset link, dynamic growth, create/rename/budget/delete item, persistence, historical no reconciliation, compact history and filters.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

