import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const read=async p=>readFile(resolve(root,p),'utf8');
const exists=async p=>{try{await access(resolve(root,p));return true}catch{return false}};

test('公開HTMLがフル機能のKAKU FIELDモジュールを起動する',async()=>{
 const html=await read('index.html');
 assert.match(html,/<title>KAKU FIELD/);
 assert.match(html,/\.\/css\/app\.css/);
 assert.match(html,/\.\/js\/main\.js/);
 for(const id of ['side','top','view','bottom','print'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const p of ['css/app.css','js/main.js','js/app.js','js/project.js','js/drawing.js','js/legacy.js','js/kaku-engine.html','old/index.html'])assert.equal(await exists(p),true,p);
});

test('JWW・JWC・DXFの読み込み経路がHTMLアプリから接続されている',async()=>{
 const project=await read('js/project.js');
 const legacy=await read('js/legacy.js');
 assert.match(project,/\.jww,\.jwc,\.dxf/i);
 assert.match(project,/readWithFixtures\(cad/);
 assert.match(legacy,/old\/index\.html\?reader=1/);
 assert.match(legacy,/runDrawingImport/);
});

test('現場・図面・積算・電気設備・書類の中核モジュールが残っている',async()=>{
 for(const p of ['js/calc.js','js/master-data.js','js/reader2/index.js','js/elec.js','js/lighting.js','js/piping.js','js/view3d.js','js/docs.js','js/export.js','js/store.js'])assert.equal(await exists(p),true,p);
});
