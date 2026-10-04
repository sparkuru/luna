const assert=require('node:assert/strict');const fs=require('node:fs');
const {_android,chromium,expect}=require('/app/node_modules/@playwright/test');
let b,d;
(async()=>{
 d=(await _android.devices()).find(x=>x.model()==='PLR110');
 b=await chromium.connectOverCDP('http://127.0.0.1:19224');const p=b.contexts()[0].pages()[0];
 const shell=async c=>(await d.shell(c)).toString();
 const r=JSON.parse(fs.readFileSync('/task/results.json','utf8'));
 await p.locator('#primary-record').waitFor();
 const opener=p.locator('[id^="transaction-details-"]').first();
 for(const operation of ['BACK','close','Escape']){
  await opener.click();await expect(p.locator('#transaction-detail-dialog')).toBeVisible();
  if(operation==='BACK')await shell('input keyevent KEYCODE_BACK');
  if(operation==='close')await p.locator('#close-transaction-detail').click();
  if(operation==='Escape')await shell('input keyevent KEYCODE_ESCAPE');
  await expect(p.locator('#transaction-detail-dialog')).not.toBeVisible();await expect(opener).toBeFocused();
  r.checks.push({name:'fixed actual detail '+operation,passed:true,focusRestored:true});
 }
 await opener.click();await p.locator('#transaction-detail-edit').click();await expect(p.locator('#transaction-dialog')).toBeVisible();await expect(p.locator('#transaction-amount')).toBeFocused();
 await shell('input keyevent KEYCODE_BACK');await expect(p.locator('#transaction-dialog')).not.toBeVisible();
 r.checks.push({name:'fixed actual detail edit',passed:true,editorAmountFocus:true});
 const s=await p.evaluate(()=>window.lunaLedger.getSnapshot('2026-10'));
 assert.equal(s.transactions.length,1);assert.equal(s.transactions[0].amountMinor,'-1500');assert.equal(s.transactions[0].notes,'A04_native_note');
 r.checks.push({name:'fixed APK persisted same synthetic ledger',passed:true,count:1,amountMinor:'-1500',notesRetained:true});
 r.result='passed current revised A04 nonvoice scope';
 fs.writeFileSync('/task/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r.checks.slice(-5),null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(b)await b.close();if(d)await d.close()});
