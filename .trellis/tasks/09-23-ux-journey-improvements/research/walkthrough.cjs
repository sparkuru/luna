const { chromium } = require('/home/wkyuu/cargo/repo/34-luna/node_modules/playwright');
const fs = require('node:fs/promises');
const dir = '/tmp/luna-ux-audit-20260922';
const evidence = { screens: [], events: [], errors: [] };
async function capture(page, name) {
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  const data = await page.evaluate(() => {
    const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const controls = [...document.querySelectorAll('button,a,input,select,summary,textarea')].filter(visible).map(e => {
      const r = e.getBoundingClientRect();
      return { id: e.id, tag: e.tagName, text: e.getAttribute('aria-label') || e.textContent?.trim().slice(0,90), type:e.getAttribute('type'), width:r.width,height:r.height,y:r.y,disabled:e.disabled };
    });
    return { url:location.href,text:document.body.innerText,viewport:{width:innerWidth,height:innerHeight},width:document.documentElement.scrollWidth,controls,focus:document.activeElement?.id };
  });
  evidence.screens.push({name,...data});
  await fs.writeFile(`${dir}/evidence.json`, JSON.stringify(evidence,null,2));
  console.log(name, data.url, 'width',data.width);
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:900}});
 const page=await context.newPage();
 page.on('pageerror',e=>evidence.errors.push(e.message));
 page.on('dialog',async d=>{evidence.events.push({dialog:d.message()});await d.dismiss();});
 await page.goto('http://127.0.0.1:4187');
 await page.locator('#workspace-form').waitFor();
 await capture(page,'01-welcome-desktop');
 await page.locator('#workspace-form button[type=submit]').click();
 await capture(page,'02-welcome-invalid');
 await page.locator('#workspace-name').fill('两个人的小日子');
 await page.locator('#workspace-form button[type=submit]').click();
 await page.locator('#transaction-list-region').waitFor();
 await capture(page,'03-empty-ledger');
 await page.locator('#primary-record').click();
 await capture(page,'04-entry-desktop');
 await page.locator('#save-transaction').click();
 await capture(page,'05-entry-invalid');
 await page.locator('#transaction-amount').fill('28.50');
 await page.locator('#choose-category').click();
 await capture(page,'06-category-picker');
 await page.locator('#category-options button').first().click();
 await page.locator('#transaction-advanced-details summary').click();
 await page.locator('#transaction-merchant').fill('楼下早餐店');
 await page.locator('#transaction-notes').fill('两个人的早餐');
 await page.locator('#save-transaction').click();
 await page.locator('#transaction-dialog').waitFor({state:'hidden'});
 await capture(page,'07-saved-ledger');
 await page.locator('#primary-record').click();
 await page.locator('#quick-income').click();
 await page.locator('#transaction-amount').fill('8000');
 await page.locator('#choose-category').click();
 await page.locator('#category-options button').first().click();
 await page.locator('#save-transaction').click();
 await page.locator('#transaction-dialog').waitFor({state:'hidden'});
 for (const width of [1440,375]) {
  await page.setViewportSize({width,height:800});
  for(const route of ['/luna','/statistics','/settings','/budget','/settings/ledgers','/settings/categories','/settings/preferences','/settings/account','/settings/sync','/settings/backup','/settings/conflicts','/settings/sync/advanced']) {
   await page.goto(`http://127.0.0.1:4187${route}`);
   await page.locator('#workspace-name-label, #settings-title, #budget-editor-title, #category-title, #ledger-tools-title, #categories-title, #account-server-url, #ledgers-title').first().waitFor({timeout:3000}).catch(()=>{});
   await page.waitForTimeout(250);
   await capture(page,`${width}-${route.slice(1).replaceAll('/','-')}`);
  }
 }
 await page.goto('http://127.0.0.1:4187/luna');
 await page.locator('#primary-record').click();
 await capture(page,'mobile-entry');
 await page.locator('#transaction-amount').fill('15');
 await page.locator('#close-transaction').click();
 await page.locator('#primary-record').click();
 evidence.events.push({reopenDraft:await page.locator('#transaction-amount').inputValue()});
 await page.reload();
 await page.locator('#primary-record').click();
 evidence.events.push({reloadDraft:await page.locator('#transaction-amount').inputValue()});
 await page.locator('#close-transaction').click();
 await page.locator('#filter-details summary').click();
 await capture(page,'mobile-filters');
 await page.locator('#filter-query').fill('不会找到的店铺');
 await page.waitForTimeout(400);
 await capture(page,'mobile-no-results');
 await page.setViewportSize({width:640,height:450});
 await capture(page,'zoom-equivalent-ledger');
 await fs.writeFile(`${dir}/evidence.json`,JSON.stringify(evidence,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
