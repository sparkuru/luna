const assert=require('node:assert/strict');
const fs=require('node:fs');
const {_android,chromium,expect}=require('/app/node_modules/@playwright/test');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const out=process.env.LUNA_RESUME?JSON.parse(fs.readFileSync('/task/results.json','utf8')):{date:'2026-10-04',scope:'A04 keyboard/IME/BACK per user cancellation of TalkBack',checks:[],failure:null};
out.failure=null;
let d,b,p;
const record=(name,data)=>{out.checks.push({name,...data});fs.writeFileSync('/task/results.json',JSON.stringify(out,null,2));console.log('PASS',name)};
const shell=async s=>(await d.shell(s)).toString();
const ime=async()=>{const m=(await shell('dumpsys input_method')).match(/\bmInputShown=(true|false)/);assert.ok(m);return m[1]==='true'};
const back=()=>shell('input keyevent KEYCODE_BACK');
const focused=()=>p.evaluate(()=>{const n=document.activeElement;return n?.id||(n===document.body?'BODY':n?.getAttribute('aria-label')||n?.textContent?.trim().slice(0,100))});
const count=()=>p.evaluate(async()=>(await window.lunaLedger.getSnapshot('2026-10')).transactions.length);
async function nativeTree(name){
 await shell('uiautomator dump /data/local/tmp/luna-a04-ui.xml');
 const x=await shell('cat /data/local/tmp/luna-a04-ui.xml');
 assert.ok(x.includes('package="majo.im.luna.a04"'));
 const controls=[...x.matchAll(/<node\b[^>]+/g)].map(m=>m[0]).filter(n=>n.includes('clickable="true"')&&n.includes('enabled="true"'));
 const names=controls.map(n=>({id:n.match(/resource-id="([^"]*)"/)?.[1]||'',text:n.match(/text="([^"]*)"/)?.[1]||'',description:n.match(/content-desc="([^"]*)"/)?.[1]||'',hint:n.match(/hint="([^"]*)"/)?.[1]||''}));
 const blank=names.filter(n=>!n.text&&!n.description&&!n.hint);
 record('native names '+name,{controls:names,blank});
}
async function tabRoute(name){
 const order=[];
 for(let i=0;i<8;i++){
  await shell('input keyevent KEYCODE_TAB');await pause(80);
  order.push(await focused());
 }
 assert.ok(order.filter(Boolean).length>=4);
 record('native virtual TAB '+name,{order,input:'ADB KEYCODE_TAB; no physical keyboard'});
}
(async()=>{
 d=(await _android.devices()).find(x=>x.model()==='PLR110');assert.ok(d);
 b=await chromium.connectOverCDP('http://127.0.0.1:19224');p=b.contexts()[0].pages()[0];
 out.environment={model:d.model(),android:(await shell('getprop ro.build.version.release')).trim(),package:'majo.im.luna.a04',webview:(await shell('dumpsys webviewupdate')).match(/Current WebView package.*$/m)?.[0],ime:(await shell('settings get secure default_input_method')).trim()};
 const initial=await p.evaluate(()=>window.lunaLedger.getSnapshot('2026-10'));
 if(!initial.workspace){
  await p.evaluate(()=>window.lunaLedger.createWorkspace({name:'A04 synthetic acceptance',currency:'USD',precision:2,monthlyBudgetMinor:null}));
  await p.reload();await p.locator('#primary-record').waitFor();
 }
 if(!process.env.LUNA_RESUME){
 if(await p.locator('#transaction-dialog').isVisible())await back();
 await expect(p.locator('#transaction-dialog')).not.toBeVisible();
 await nativeTree('ledger');await tabRoute('ledger');
 await p.locator('#primary-record').click();
 await expect.poll(ime).toBe(false);assert.equal(await p.locator('#transaction-amount').getAttribute('inputmode'),'none');
 await p.locator('#transaction-amount').fill('');await p.locator('#transaction-amount').click();
 await shell('input keyevent KEYCODE_1 KEYCODE_2 KEYCODE_PLUS KEYCODE_3 KEYCODE_ENTER');
 await expect(p.locator('#transaction-amount')).toHaveValue('15.00');
 await expect.poll(ime).toBe(false);
 record('amount native virtual arithmetic',{expression:'12+3',evaluated:'15.00',ime:false,input:'ADB keyevents, Android Virtual device; physical keyboard absent'});
 await p.locator('.mobile-category-grid button').first().click();
 await p.locator('#choose-category').click();await expect(p.locator('#category-dialog')).toBeVisible();
 await nativeTree('category picker');await tabRoute('category picker');
 await back();await expect(p.locator('#category-dialog')).not.toBeVisible();
 await expect(p.locator('#transaction-dialog')).toBeVisible();
 await expect.poll(focused).toBe('choose-category');
 record('category BACK and focus',{parentEntryRetained:true,focus:'choose-category'});
 if(!await p.locator('#transaction-advanced-details').evaluate(n=>n.open))await p.locator('#transaction-advanced-details summary').click();
 await p.locator('#transaction-notes').click();await expect.poll(ime).toBe(true);
 await p.locator('#transaction-notes').fill('');await shell('input text A04_native_note');
 await expect(p.locator('#transaction-notes')).toHaveValue('A04_native_note');
 await back();await expect.poll(ime).toBe(false);await expect(p.locator('#transaction-dialog')).toBeVisible();
 record('real text IME and first BACK',{notes:'A04_native_note',imeOpened:true,imeDismissed:true,entryRetained:true});
 await back();await expect(p.locator('#transaction-dialog')).not.toBeVisible();await expect.poll(focused).toBe('primary-record');
 await p.locator('#primary-record').click();await expect(p.locator('#transaction-amount')).toHaveValue('15.00');await expect(p.locator('#transaction-notes')).toHaveValue('A04_native_note');
 record('second BACK retains draft and restores focus',{focus:'primary-record',amount:'15.00',notesRetained:true});
 await nativeTree('entry');await tabRoute('entry');
 if(await ime())await back();
 await p.getByRole('button',{name:'Choose files',exact:true}).click();
 await expect.poll(async()=>await shell('dumpsys window')).toContain('com.android.documentsui');
 await back();await expect(p.locator('#transaction-dialog')).toBeVisible();
 assert.equal(await p.locator('.entry-image-item').count(),0);
 record('actual image DocumentsUI cancel',{entryRetained:true,attachments:0});
 await p.locator('#save-transaction').click();await expect(p.locator('#transaction-dialog')).not.toBeVisible();
 await expect.poll(count).toBe(1);await expect.poll(focused).toBe('primary-record');
 record('UI save',{count:1,focus:'primary-record',alert:await p.locator('[role="status"],[role="alert"]').allTextContents()});
 await p.locator('[id^="transaction-details-"]').first().click();await expect(p.locator('#transaction-detail-dialog')).toBeVisible();
 await nativeTree('transaction detail');await back();await expect(p.locator('#transaction-detail-dialog')).not.toBeVisible();
 await expect.poll(focused).toMatch(/^transaction-details-/);
 record('detail BACK',{focusRestored:true,ledgerRetained:true});
 }
 await p.locator('#primary-record').click();await p.locator('#transaction-amount').fill('0');await p.locator('.mobile-category-grid button').first().click();await p.locator('#save-transaction').click();
 await expect(p.locator('#transaction-alert')).not.toHaveText('');
 assert.equal(await p.locator('#transaction-amount').getAttribute('aria-invalid'),'true');
 assert.ok((await p.locator('#transaction-amount').getAttribute('aria-describedby')).includes('transaction-alert'));
 record('invalid save preserves ledger',{count:await count(),error:await p.locator('#transaction-alert').innerText(),role:await p.locator('#transaction-alert').getAttribute('role'),associated:true});
 await back();await expect(p.locator('#transaction-dialog')).not.toBeVisible();
 for(const [name,hash]of[['statistics','/statistics'],['budget','/budget'],['settings','/settings'],['categories','/settings/categories']]){
  await p.evaluate(h=>location.hash=h,hash);await pause(600);
  await nativeTree(name);await tabRoute(name);
  if(await ime())await back();
 }
 await p.locator('.category-row-menu summary').first().click();
 await p.locator('[id^="category-open-usage-"]').first().click();await expect(p.locator('#category-usage-dialog')).toBeVisible();
 await back();await expect(p.locator('#category-usage-dialog')).not.toBeVisible();
 await expect.poll(focused).toMatch(/^category-open-usage-/);
 record('category usage BACK',{focusRestored:true});
 await p.evaluate(()=>location.hash='/settings/backup');await pause(600);
 await nativeTree('backup choices');await p.locator('#backup-choose-save').click();
 await p.locator('#ledger-export-password').fill('short');await p.locator('#ledger-export-submit').click();
 await expect(p.locator('#ledger-tools-alert')).not.toHaveText('');
 record('backup validation',{error:await p.locator('#ledger-tools-alert').innerText(),count:await count()});
 await p.locator('#ledger-export-password').fill('A04 synthetic backup password');
 if(await ime())await back();
 await p.locator('#ledger-export-submit').click();
 await expect.poll(async()=>await shell('dumpsys window'),{timeout:45000}).toContain('com.android.documentsui');
 await back();await expect.poll(async()=>p.locator('#ledger-tools-alert').innerText()).toMatch(/cancel/i);
 record('actual backup DocumentsUI cancel',{alert:await p.locator('#ledger-tools-alert').innerText(),count:await count()});
 await p.locator('#backup-choose-import').click();await p.locator('#ledger-import-file').click();
 await expect.poll(async()=>await shell('dumpsys window')).toContain('com.android.documentsui');await back();
 record('actual import DocumentsUI cancel',{count:await count(),fileSelection:await p.locator('#ledger-import-file').evaluate(n=>n.files?.length||0)});
 await p.evaluate(()=>location.hash='/luna');await pause(500);await d.screenshot({path:'/task/final-ledger.png'});
 await b.close();b=null;
 await shell('am force-stop majo.im.luna.a04');await shell('am start -n majo.im.luna.a04/majo.im.luna.MainActivity');
 record('pre-restart',{committedCount:1});
})().catch(e=>{out.failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync('/task/results.json',JSON.stringify(out,null,2));if(b)await b.close();if(d)await d.close()});
