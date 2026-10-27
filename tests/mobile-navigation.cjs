const path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>localStorage.setItem('jaeger_access_key','local-test'));
  try{
   await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.G&&G.mesData);await page.locator('#boot-loader').waitFor({state:'hidden'});
   assert.equal(await page.locator('meta[name=apple-mobile-web-app-status-bar-style]').getAttribute('content'),'default');
   for(const [width,height] of [[390,844],[360,640],[430,932]]){
    await page.setViewportSize({width,height});
    for(const safe of [0,34]){
     await page.evaluate(value=>document.documentElement.style.setProperty('--sb',value+'px'),safe);
     const nav=await page.locator('.bnv').boundingBox(),row=await page.locator('.tr').boundingBox();
     assert.equal(nav.x,0);assert.equal(nav.width,width);assert.equal(nav.y+nav.height,height);
     assert.equal(Math.round(nav.y+nav.height-row.y-row.height),safe);
     assert.equal(await page.locator('.bnv').evaluate(el=>getComputedStyle(el).position),'fixed');
     assert.equal(await page.locator('.bnv').evaluate(el=>getComputedStyle(el,'::after').display),'none');
     for(const tab of await page.locator('.bnv .tab').all()){const box=await tab.boundingBox();assert.ok(box.y>=nav.y&&box.y+box.height<=height-safe+1);}
    }
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve('../evidence/navigation-cfac-pattern-'+engine+'.png')});
   console.log('PASS '+engine+': full-width fixed navigation, bottom edge, safe area inside background, no artificial extension.');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
