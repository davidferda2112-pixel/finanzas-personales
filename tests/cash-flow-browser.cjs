const path=require('node:path'),assert=require('node:assert/strict');
const {transformSource}=require('../lib/jaeger-supabase-read');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));
 try{
  await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});
  await page.evaluate(()=>navTo('flujo'));await page.waitForFunction(()=>G.flujo&&G.flujo.filas);
  // The legacy local snapshot predates cash confirmation. Exercise the complete
  // report renderer with a deterministic confirmation and a financing receipt.
  const d=transformSource('getFlujoCaja',[],{cashFlow:[{label:'SALDO INICIAL',monthly_values:[-50]}],cashObservation:{month:'Enero 26',amount:30,reference_flow:-20},movementTotals:[{month_number:1,kind:'ingreso',subcategory:'Sueldo',amount:100},{month_number:1,kind:'necesidad',amount:67.5},{month_number:1,kind:'ingreso',operation_code:'loan_received',funding_source:'asset_transfer',amount:3}]}).data;
  await page.evaluate(data=>{G.flujo=data;renderFlujo(data);},d);
  const expected='$'+Math.abs(d.cashAvailable).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  assert.equal(await page.locator('#fl-tabla tbody tr').last().locator('td').last().innerText(),(d.cashAvailable<0?'-':'')+expected);
  assert.ok(!(await page.locator('#fl-tabla').innerText()).includes('Diferencia histórica'));
  assert.ok(!(await page.locator('#fl-tabla').innerText()).includes('Financiación recibida'));
  assert.equal(await page.locator('.cash-explanation').count(),0);
  const initial=d.filas.find(r=>r.label==='SALDO INICIAL').total;
  if(initial<0)assert.ok((await page.locator('#fl-tabla tbody tr').first().locator('td').last().innerText()).startsWith('-$'));
  await page.locator('#fl-tabla tbody tr').last().scrollIntoViewIfNeeded();
  await page.locator('.fl-table-wrap').evaluate(el=>el.scrollLeft=el.scrollWidth);
  await page.screenshot({path:path.resolve('../evidence/cash-flow-general-mobile.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);console.log('PASS: original cash-flow rows, available cash total, no asset-financing rows or explanations, signed balances, mobile rendering.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
