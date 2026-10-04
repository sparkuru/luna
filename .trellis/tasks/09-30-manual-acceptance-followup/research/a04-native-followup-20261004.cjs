const assert=require('node:assert/strict');const fs=require('node:fs');
const {_android,chromium,expect}=require('/app/node_modules/@playwright/test');
let b,d;
(async()=>{
 d=(await _android.devices()).find(x=>x.model()==='PLR110');
 b=await chromium.connectOverCDP('http://127.0.0.1:19224');const p=b.contexts()[0].pages()[0];
 const shell=async c=>(await d.shell(c)).toString();
 const r=JSON.parse(fs.readFileSync('/task/results.json','utf8'));
 await p.locator('#primary-record').waitFor();
 const snap=await p.evaluate(()=>window.lunaLedger.getSnapshot('2026-10'));
 assert.equal(snap.transactions.length,1);assert.equal(snap.transactions[0].amountMinor,'-1500');assert.equal(snap.transactions[0].notes,'A04_native_note');
 r.checks.push({name:'force-stop restart committed readback',count:1,amountMinor:'-1500',notes:'A04_native_note'});
 await p.locator('[id^="transaction-details-"]').first().click();await expect(p.locator('#transaction-detail-dialog')).toBeVisible();
 await shell('input keyevent KEYCODE_BACK');await expect(p.locator('#transaction-detail-dialog')).not.toBeVisible();
 const focus=()=>p.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName}));
 try {await expect.poll(async()=>(await focus()).id).toMatch(/^transaction-details-/);r.checks.push({name:'detail BACK focus',passed:true,focus:await focus()})}
 catch(e){r.checks.push({name:'detail BACK focus',passed:false,focus:await focus(),error:e.message});}
 await p.locator('#filter-details').click();await expect(p.locator('#filter-dialog')).toBeVisible();
 await shell('input keyevent KEYCODE_BACK');await expect(p.locator('#filter-dialog')).not.toBeVisible();
 r.checks.push({name:'filter BACK',passed:true,focus:await focus()});
 await p.evaluate(()=>location.hash='/budget');await p.locator('#open-budget-editor').click();await p.locator('#budget-input').click();
 await expect.poll(async()=>(await shell('dumpsys input_method')).includes('mInputShown=true')).toBe(true);
 const box=await p.locator('#save-budget').boundingBox();const height=await p.evaluate(()=>innerHeight);assert.ok(box&&box.y+box.height<=height+1);
 await shell('input keyevent KEYCODE_BACK');await expect.poll(async()=>(await shell('dumpsys input_method')).includes('mInputShown=false')).toBe(true);
 r.checks.push({name:'budget actual IME footer',passed:true,saveWithinResizedViewport:true,firstBackKeepsRoute:p.url().endsWith('/budget')});
 await p.evaluate(()=>location.hash='/luna');
 fs.writeFileSync('/task/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r.checks.slice(-5),null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(b)await b.close();if(d)await d.close()});
