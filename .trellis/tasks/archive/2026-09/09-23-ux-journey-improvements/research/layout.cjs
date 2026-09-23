const {chromium,expect}=require('/home/wkyuu/cargo/repo/34-luna/node_modules/@playwright/test');
const fs=require('node:fs/promises');
const dir='/tmp/luna-ux-audit-20260922';
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
const ctx=await browser.newContext({locale:'zh-CN',viewport:{width:375,height:800}});
const page=await ctx.newPage();
await page.goto('http://127.0.0.1:4188');await page.locator('#workspace-name').fill('布局测试');await page.locator('#workspace-form button').click();await page.locator('#primary-record').waitFor();
await page.evaluate(async()=>{const d=new Date();const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;await window.lunaLedger.createTransaction({type:'expense',amountMinor:'2850',date,splits:[{category:'expense:0',amountMinor:'2850'}],merchant:'早餐店'});});
await page.reload();await page.locator('#expense-total').waitFor();
async function measure(name){
const data=await page.evaluate(()=>{
const selectors=['#income-total','#expense-total','#net-total','#toggle-income-amounts','#toggle-expense-amounts','#toggle-net-amounts','#open-secondary-menu','#settings-title','#settings-language','#ledger-tools-title'];
const boxes=Object.fromEntries(selectors.map(s=>{const e=document.querySelector(s);if(!e)return[s,null];const r=e.getBoundingClientRect(),style=getComputedStyle(e);return[s,{x:r.x,y:r.y,w:r.width,h:r.height,font:style.fontSize,text:e.textContent}];}));
const bars=[...document.querySelectorAll('.statistics-chart-button')].map(e=>{const r=e.getBoundingClientRect();return{w:r.width,h:r.height,label:e.getAttribute('aria-label')}});
return{url:location.href,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,boxes,bars};});
results.push({name,...data});await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});await fs.writeFile(`${dir}/layout.json`,JSON.stringify(results,null,2));}
await measure('prod-mobile-masked');await page.locator('#toggle-expense-amounts').click();await measure('prod-mobile-revealed');
for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:800});for(const route of ['/statistics','/settings/preferences','/settings/backup','/settings/conflicts']){await page.goto(`http://127.0.0.1:4188${route}`);await page.locator('#settings-title,#category-title,#ledger-tools-title').first().waitFor();await measure(`prod-${width}-${route.slice(1).replaceAll('/','-')}`);}}
await page.setViewportSize({width:375,height:800});await page.goto('http://127.0.0.1:4188/statistics');await page.locator('.statistics-chart-button').first().waitFor();await page.locator('#statistics-trend-details summary').click();await measure('prod-statistics-accessible-alternative');
await expect(page.locator('.statistics-bar-row').first()).toBeVisible();
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
