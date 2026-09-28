// Fresh, disposable browser audit; this is not APK/device evidence.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const output='captures/mobile-ux-audit-20260926/browser';
mkdirSync(output,{recursive:true});
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','vite.web.config.ts','--host','127.0.0.1','--port','4193'],{stdio:'ignore'});
let browser;
try {
  for(let n=0;n<80;n++) {
    try { if((await fetch('http://127.0.0.1:4193')).ok) break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({channel:'chrome',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:457,height:999},locale:'zh-CN'});
  await page.goto('http://127.0.0.1:4193');
  await page.locator('#workspace-form').waitFor();
  await page.evaluate(async()=>window.lunaLedger.updateSettings({locale:'zh-CN'}));
  await page.reload();
  await page.locator('#workspace-form').waitFor();
  await page.evaluate(()=>{document.documentElement.dataset.clientSurface='mobile';});
  // Expanding the shared Setup component does not require a workspace.
  async function capture(label) {
    await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/${label}.png`,fullPage:true});
    writeFileSync(`${output}/${label}.json`,JSON.stringify(await page.evaluate(()=>({url:location.href,text:document.body.innerText,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,surface:document.documentElement.dataset.clientSurface})),null,2));
    console.log(label);
  }
  await capture('welcome');
  await page.locator('#setup-advanced > summary').click();
  await capture('welcome-advanced');
  await page.locator('#setup-restore').click();
  await capture('welcome-restore');
  await page.locator('#setup-back').click();
  await page.locator('#setup-connect').click();
  await capture('welcome-account');
  await page.locator('#setup-back').click();
  await page.goto('http://127.0.0.1:4193/setup');
  await capture('setup-alias');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
