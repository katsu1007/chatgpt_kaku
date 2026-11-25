import test from "node:test";
import assert from "node:assert/strict";
import { createCadDocument, normalizeCadEntity, transformCadPoint } from "../original/cad-document.js";

test("normalizes line geometry while preserving complete source entity and layer metadata", () => {
  const raw = { type:"sen", layer:"A-WALL", layer_group:2, pts:[0,0,100,0], handle:"AB12", color:3, custom:{flag:true} };
  const doc = createCadDocument({items:[raw],size:{w:1000,h:700}}, {sourceFormat:"JWW"});
  const entity = doc.sheets[0].entities[0];
  assert.equal(doc.schema,"kaku.cad-document");
  assert.equal(doc.source.format,"JWW");
  assert.equal(entity.kind,"line");
  assert.equal(entity.source.layer,"A-WALL");
  assert.equal(entity.source.layerGroup,"2");
  assert.equal(entity.source.handle,"AB12");
  assert.deepEqual(entity.geometry.points,[[0,0],[100,0]]);
  assert.deepEqual(entity.source.raw,raw);
  assert.equal(doc.sheets[0].width,1000);
  assert.equal(doc.diagnostics.kindCounts.line,1);
});

test("source snapshots are detached so later parser mutation cannot corrupt the model", () => {
  const raw = {kind:"line",layer:"W",pts:[0,0,10,0]};
  const entity = normalizeCadEntity(raw,0);
  raw.pts[0] = 999;
  assert.deepEqual(entity.geometry.points,[[0,0],[10,0]]);
  assert.deepEqual(entity.source.raw.pts,[0,0,10,0]);
});

test("keeps unsupported source entity types instead of silently dropping them", () => {
  const doc = createCadDocument({entities:[{type:"proxy_custom",layer:"X",payload:{a:1}}]});
  assert.equal(doc.sheets[0].entities.length,1);
  assert.equal(doc.sheets[0].entities[0].kind,"proxy_custom");
  assert.deepEqual(doc.sheets[0].entities[0].source.raw.payload,{a:1});
  assert.deepEqual(doc.diagnostics.unknownKinds,["proxy_custom"]);
});

test("normalizes text, dimensions, fills, arcs and block references as distinct kinds", () => {
  const doc = createCadDocument({items:[
    {kind:"text",x:10,y:20,text:"事務室",size:3},
    {type:"sunpou",x:0,y:0,text:"1200"},
    {type:"solid",pts:[0,0,20,0,20,10,0,10]},
    {type:"enko",cx:50,cy:50,r:10,start:0,end:90},
    {type:"block",blockName:"TOILET"}
  ]});
  assert.deepEqual(doc.sheets[0].entities.map(e=>e.kind),["text","dimension","fill","arc","block"]);
  assert.deepEqual(doc.sheets[0].entities[0].geometry.anchor,{x:10,y:20});
  assert.equal(doc.sheets[0].entities[1].geometry.text,"1200");
  assert.equal(doc.sheets[0].entities[3].geometry.radius,10);
  assert.deepEqual(doc.sheets[0].entities[4].source.blockPath,["TOILET"]);
});

test("duplicate handles are reported rather than overwritten", () => {
  const doc = createCadDocument({items:[
    {kind:"line",id:"same",pts:[0,0,1,1]},
    {kind:"arc",id:"same",cx:0,cy:0,r:1}
  ]});
  assert.deepEqual(doc.diagnostics.duplicateIds,["same"]);
  assert.equal(doc.sheets[0].entities.length,2);
});

test("layer inventory is stable and missing geometry is counted", () => {
  const doc = createCadDocument({items:[
    {kind:"line",layer:"Z",pts:[0,0,1,1]},
    {kind:"text",layer:"A",x:1,y:2,text:"X"},
    {kind:"proxy"}
  ]});
  assert.deepEqual(Object.keys(doc.diagnostics.layerCounts).sort(),["(レイヤーなし)","A","Z"].sort());
  assert.equal(doc.diagnostics.missingGeometry,1);
});

test("affine transform handles rotation, scale and translation", () => {
  assert.deepEqual(transformCadPoint([2,3],[0,2,-2,0,10,20]),[4,24]);
});

test("invalid transform input fails explicitly", () => {
  assert.throws(() => transformCadPoint([1,2],[1,0,0]),/変換行列/);
});


test("preserves explicit source semantics and decodes Jw_cad group/layer indices", () => {
  const doc = createCadDocument({items:[
    {type:"sunpou",layer:"2-1 展開図 / 寸法",dimensionGraphic:true,sourceIndex:17},
    {type:"block",layer:"0-3 平面図 / 記号",blockName:"TOILET"},
    {kind:"line",layer:"0-2 平面図 / 躯体",pts:[0,0,100,0]}
  ]}, {sourceFormat:"JWW"});
  const [dimension, block, plainLine] = doc.sheets[0].entities;
  assert.equal(dimension.semantic.role,"dimension");
  assert.equal(dimension.semantic.dimensionGraphic,true);
  assert.equal(dimension.semantic.groupIndex,2);
  assert.equal(dimension.semantic.layerIndex,1);
  assert.equal(dimension.source.sourceIndex,17);
  assert.equal(block.semantic.role,"block-instance");
  assert.equal(block.semantic.blockInstance,true);
  assert.equal(plainLine.semantic.role,"unclassified");
  assert.equal(plainLine.semantic.dimensionGraphic,false);
  assert.deepEqual(doc.diagnostics.semanticCounts, {
    dimension:1,
    "block-instance":1,
    unclassified:1
  });
  assert.equal(doc.diagnostics.dimensionGraphics,1);
  assert.equal(doc.diagnostics.blockInstances,1);
});

test("does not invent dimension provenance for flattened ordinary line geometry", () => {
  const doc = createCadDocument({items:[
    {kind:"line",layer:"0-1 平面図 / 寸法",pts:[0,0,100,0]}
  ]}, {sourceFormat:"JWW"});
  const entity = doc.sheets[0].entities[0];
  assert.equal(entity.semantic.role,"unclassified");
  assert.equal(entity.semantic.dimensionGraphic,false);
  assert.equal(doc.diagnostics.dimensionGraphics,0);
});
