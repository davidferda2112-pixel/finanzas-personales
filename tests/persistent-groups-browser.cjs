const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const openSession=async()=>{const context=await browser.newContext({viewport:{width:360,height:780}});await context.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));const page=await context.newPage();await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});await page.evaluate(()=>navTo('balance'));await page.waitForFunction(()=>G.balance);return {context,page};};
 try{
 const first=await openSession(),name='Grupo persistente '+Date.now();
 await first.page.evaluate(()=>abrirBalanceItem('crear'));await first.page.getByRole('button',{name:'Nuevo grupo',exact:true}).click();await first.page.locator('#bal-item-nombre').fill(name);
 const saved=first.page.waitForResponse(r=>r.url().includes('/api/apps-script')&&r.request().postDataJSON()?.fn==='guardarBalanceGrupo');await first.page.locator('#bal-item-save').click();assert.equal((await(await saved).json()).ok,true);
 await first.page.waitForFunction(n=>document.querySelector('#b-act-list').textContent.includes(n),name);
 await first.page.reload();await first.page.waitForFunction(()=>window.G&&G.mesData);await first.page.locator('#boot-loader').waitFor({state:'hidden'});await first.page.evaluate(()=>navTo('balance'));await first.page.waitForFunction(n=>document.querySelector('#b-act-list').textContent.includes(n),name);
 await first.context.close();
 const second=await openSession();await second.page.waitForFunction(n=>document.querySelector('#b-act-list').textContent.includes(n),name);
 await second.page.evaluate(()=>abrirBalanceItem('crear'));await second.page.waitForFunction(n=>Array.from(document.querySelector('#bal-item-grupo').options).some(o=>o.value===n),name);
 await second.page.locator('#bal-item-grupo').selectOption(name);await second.page.locator('#bal-item-nombre').fill('Activo entre sesiones');await second.page.locator('#bal-item-valor').fill('100');
 const itemResponse=second.page.waitForResponse(r=>r.url().includes('/api/apps-script')&&r.request().postDataJSON()?.fn==='guardarBalanceItem');await second.page.locator('#bal-item-save').click();const item=await(await itemResponse).json();assert.equal(item.ok,true);await second.context.close();
 const third=await openSession();await third.page.waitForFunction(id=>G.balance.activos.some(x=>x.codigo===id&&x.valor===100),item.codigo);
 await third.page.evaluate(()=>abrirModal('ahorro'));await third.page.waitForFunction(id=>Array.from(document.querySelector('#m-sub').options).some(o=>o.dataset.balanceId===id),item.codigo);
 await third.page.evaluate(()=>document.querySelector('#mov').classList.remove('open'));await third.page.screenshot({path:path.resolve('../evidence/mobile-persistent-groups.png')});
 await third.context.close();
 console.log('PASS: grupo vacío visible tras recargar, cerrar contexto y abrir nueva sesión; activo visible y seleccionable en una tercera sesión sin compartir almacenamiento.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

