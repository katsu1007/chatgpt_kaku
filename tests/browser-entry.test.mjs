import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const exists=async p=>{try{await access(resolve(root,p));return true}catch{return false}};
test('KAKU FIELDの独自HTML入口と資産が存在する',async()=>{
 const html=await readFile(resolve(root,'index.html'),'utf8');
 assert.match(html,/<title>KAKU FIELD/);
 assert.match(html,/\.\/css\/next\.css/);
 assert.match(html,/\.\/js\/next-app\.js/);
 for(const p of ['css/next.css','js/next-app.js','legacy.html','js/main.js','css/app.css'])assert.equal(await exists(p),true,p);
});
test('新ワークスペースに現場・採寸・工事・見積・書類の主要機能がある',async()=>{
 const js=await readFile(resolve(root,'js/next-app.js'),'utf8');
 for(const s of ['現場カルテ','部屋・採寸データ','工事項目・数量拾い','見積内訳','御 見 積 書','localStorage','drawPlan'])assert.ok(js.includes(s),s);
});
