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

test('JWWの解析エンジンは更新済みの外部エンジンを読み込み、失敗を画面へ返す',async()=>{
 const old=await read('old/index.html');
 const engine=await read('js/kaku-engine.html');
 const legacy=await read('js/legacy.js');
 assert.match(old,/f\.src='js\/kaku-engine\.html'/);
 assert.match(engine,/function jwwRead\(buf\)/);
 assert.match(engine,/function jwwGeom\(buf\)/);
 assert.match(engine,/const g=jwwGeom\(buf\)/);
 assert.match(legacy,/JWW読み取りエンジンの起動が120秒以内/);
 assert.match(legacy,/JWW\/DXFの読み込み結果/);
});


test('CAD inspection report exposes block child native-layer provenance counts',async()=>{
 const origin=await read('original/origin.js');
 assert.match(origin,/ブロック子図形の元レイヤー/);
 assert.match(origin,/provenance\.retained/);
 assert.match(origin,/provenance\.missing/);
 assert.match(origin,/不明な子図形は区画境界から除外/);
});


test('CAD inspection report exposes short wall-fragment repair counts',async()=>{
 const origin=await read('original/origin.js');
 assert.match(origin,/短い壁線隙間補完/);
 assert.match(origin,/d\.bridgedFragmentGaps/);
});


test('CAD inspection report exposes furniture-island exclusions',async()=>{
 const origin=await read('original/origin.js');
 assert.match(origin,/家具輪郭除外/);
 assert.match(origin,/d\.filteredFurnitureIslands/);
});
