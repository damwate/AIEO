import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const PROFILE='D:/AIEO/.worktrees/feat-standard-task-management/runtime/chrome_profiles/gdc8870-warmtest';
const OUT='D:/AIEO/.worktrees/feat-standard-task-management/basic/tasks/b-20261123-standard-third-trial/acceptance/s1-supplement/warm-browser-test';
mkdirSync(OUT,{recursive:true});
const log=(m)=>{const l=`[${new Date().toISOString()}] ${m}`;console.log(l);writeFileSync(OUT+'/run.log',l+'\n',{flag:'a',encoding:'utf8'});};
const ctx=await chromium.launchPersistentContext(PROFILE,{
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,
  args:['--remote-debugging-port=9333'],viewport:{width:1600,height:1000},
});
const page=ctx.pages()[0]||await ctx.newPage();
const events=[];
page.on('response',r=>{const u=r.url(); if(u.includes('.ktx2')||u.includes('.glb')||u.includes('/assets/')) events.push({t:'resp',s:r.status(),u:u.split('/').pop().slice(0,60)});});
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning') events.push({t:m.type(),x:m.text().slice(0,120)});});
const scheme='http://share.yotin.com.cn:8870/projects/b60402ed-fc4a-45f5-b47a-b95831b8d565/schemes/c8bbcd17-ba0e-4d7d-aa9c-74036be4b9c6';
try{
  await page.goto('http://share.yotin.com.cn:8870/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1000);
  if(await page.evaluate(()=>!!document.querySelector('input[aria-label="账号"]'))){
    await page.fill('input[aria-label="账号"]','admin');await page.fill('input[aria-label="密码"]','Youting@2026');
    await page.click('button:has-text("进入工作台")');
    await page.waitForFunction(()=>!document.querySelector('input[aria-label="账号"]'),undefined,{timeout:30000}).catch(()=>{});
  }
  log('登录完成');
  await page.goto(scheme,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1500);
  log('方案详情 loaded url='+page.url());
  // 点 3D
  const b3=page.locator('button:has-text("3D")');
  log('3D button count='+await b3.count());
  await b3.first().click();
  log('已点 3D，等待贴图加载');
  await page.waitForTimeout(12000);
  await page.screenshot({path:OUT+'/01-3d-loaded.png'});
  // 等贴图响应
  const ktx2=events.filter(e=>e.t==='resp'&&e.u.includes('.ktx2'));
  const failed=events.filter(e=>e.t==='resp'&&e.s>=400);
  log(`贴图响应 ktx2=${ktx2.length}, 失败(>=400)=${failed.length}`);
  log('3D 视图按钮='+JSON.stringify((await page.locator('button').evaluateAll(els=>els.map(e=>(e.innerText||'').trim()).filter(Boolean))).slice(0,40)));
  const body3d=(await page.locator('body').innerText()).slice(0,1500).replace(/\n+/g,' | ');
  log('3D BODY='+body3d);
  // 热启动：刷新页面（贴图已缓存）
  log('刷新页面（热启动/cache 命中）');
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1500);
  await b3.first().click().catch(()=>{});
  await page.waitForTimeout(6000);
  await page.screenshot({path:OUT+'/02-after-reload-3d.png'});
  const bodyAfter=(await page.locator('body').innerText()).slice(0,1500).replace(/\n+/g,' | ');
  log('刷新后 BODY='+bodyAfter);
  const btnsAfter=await page.locator('button').evaluateAll(els=>els.map(e=>(e.innerText||'').trim()).filter(Boolean));
  log('刷新后按钮='+JSON.stringify(btnsAfter.slice(0,40)));
  // 找 AI 快拍 / 截图保存按钮并点击
  for(const label of ['AI 照片','AI快拍','AI 快拍','清晨照','截图保存']){
    const loc=page.locator(`button:has-text("${label}")`);
    if(await loc.count()){ log('点击 AI 入口: '+label); await loc.first().click(); await page.waitForTimeout(5000); await page.screenshot({path:OUT+'/03-ai-action-'+label.replace(/\s/g,'')+'.png'}); const b=(await page.locator('body').innerText()).slice(0,1200).replace(/\n+/g,' | '); log('点击后 BODY='+b); break; }
  }
  writeFileSync(OUT+'/network-events.json',JSON.stringify(events.slice(0,200),null,2),'utf8');
  log('DONE');
}catch(e){log('ERR='+e.message.slice(0,300));}
await page.waitForTimeout(10000);
await ctx.close();
