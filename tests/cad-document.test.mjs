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


test("attaches Jw_cad layer-group scale to each entity without altering sheet coordinates", () => {
  const doc = createCadDocument({items:[
    {kind:"line",layer:"0-1 平面図 / 躯体",pts:[0,0,100,0]},
    {kind:"line",layer:"2-1 展開図 / 躯体",pts:[0,0,20,0]},
    {kind:"line",layer:"DXF-WALL",pts:[0,0,10,0]}
  ]}, {sourceFormat:"JWW",layers:[
    {name:"0-1 平面図 / 躯体",scale:50},
    {name:"2-1 展開図 / 躯体",scale:10}
  ]});
  const [plan,elevation,dxfUnknown] = doc.sheets[0].entities;
  assert.equal(plan.source.layerScaleDenominator,50);
  assert.equal(plan.semantic.layerScaleDenominator,50);
  assert.equal(elevation.source.layerScaleDenominator,10);
  assert.equal(dxfUnknown.source.layerScaleDenominator,null);
  assert.deepEqual(plan.geometry.points,[[0,0],[100,0]]);
  assert.deepEqual(doc.diagnostics.layerScaleCounts,{"10":1,"50":1,unknown:1});
  assert.equal(doc.diagnostics.unscaledEntities,1);
});


test("warns when JWW source dimensions are flattened into unclassified geometry", () => {
  const doc = createCadDocument({items:[
    {kind:"line",layer:"0-1 平面図 / 寸法",pts:[0,0,100,0]},
    {kind:"text",layer:"0-1 平面図 / 寸法",x:50,y:5,text:"1000"}
  ]}, {sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":12}});
  assert.equal(doc.diagnostics.rawSourceTypeCounts["count.CDataSunpou"],12);
  assert.equal(doc.diagnostics.dimensionGraphics,0);
  assert.equal(doc.diagnostics.sourceWarnings.length,1);
  assert.match(doc.diagnostics.sourceWarnings[0],/寸法オブジェクト/);
});

test("warns when JWW block references lose their instance identity after expansion", () => {
  const doc = createCadDocument({items:[
    {kind:"line",layer:"0-1 平面図 / 記号",pts:[0,0,10,0]}
  ]}, {sourceFormat:"JWW",sourceTypeCounts:{"count.CDataBlock":4}});
  assert.equal(doc.diagnostics.blockInstances,0);
  assert.equal(doc.diagnostics.sourceWarnings.length,1);
  assert.match(doc.diagnostics.sourceWarnings[0],/ブロック参照/);
});

test("does not warn when source semantics are retained", () => {
  const doc = createCadDocument({items:[
    {type:"sunpou",layer:"0-1 平面図 / 寸法"},
    {type:"block",layer:"0-1 平面図 / 記号"}
  ]}, {sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":1,"count.CDataBlock":1}});
  assert.deepEqual(doc.diagnostics.sourceWarnings,[]);
});


test("inherits semantic role, dimension flags and block ancestry from parser base metadata",()=>{
  const doc=createCadDocument({items:[
    {kind:"line",layer:"WALL",pts:[0,0,100,0],base:{semantic:{role:"dimension"},dimensionLine:true,blockPath:["SYMBOLS","DIM"]}},
    {kind:"line",layer:"WALL",pts:[0,0,0,100],base:{blockName:"TOILET"}}
  ]});
  const [dimension,nested]=doc.sheets[0].entities;
  assert.equal(dimension.semantic.role,"dimension");
  assert.equal(dimension.semantic.dimensionGraphic,true);
  assert.deepEqual(dimension.source.blockPath,["SYMBOLS","DIM"]);
  assert.equal(nested.semantic.role,"unclassified");
  assert.deepEqual(nested.source.blockPath,["TOILET"]);
});


test("closed polyline and width metadata survive CAD document normalization",()=>{
 const doc=createCadDocument({items:[{kind:"polyline",closed:true,pts:[0,0,100,0,100,100],bulges:[0.25,0,0],startWidth:2,endWidth:3,constantWidth:1}]});
 const geometry=doc.sheets[0].entities[0].geometry;
 assert.equal(geometry.closed,true);
 assert.deepEqual(geometry.bulges,[0.25,0,0]);
 assert.deepEqual(geometry.widths,{start:2,end:3,constant:1});
});

test("normalizes ellipse and spline curves into bounded geometry",()=>{
 const doc=createCadDocument({items:[
  {kind:"ellipse",center:[10,20,0],majorAxis:[100,0,0],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2},
  {kind:"spline",degree:2,knots:[0,0,0,1,1,1],controlPoints:[[0,0],[50,0],[50,50]]}
 ]});
 const [ellipse,spline]=doc.sheets[0].entities;
 assert.equal(ellipse.kind,"ellipse");
 assert.ok(ellipse.geometry.points.length>=70);
 assert.ok(ellipse.bounds.maxX>=110);
 assert.equal(spline.kind,"spline");
 assert.ok(spline.geometry.points.length>=24);
 assert.ok(spline.bounds.maxY>0);
});

test("CAD document accepts decoded center arrays for arcs and circles",()=>{
 const doc=createCadDocument({items:[
  {kind:"circle",center:[10,20,0],radius:5},
  {kind:"arc",center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI}
 ]});
 const [circle,arc]=doc.sheets[0].entities;
 assert.deepEqual(circle.geometry.center,{x:10,y:20});
 assert.deepEqual(circle.bounds,{minX:5,minY:15,maxX:15,maxY:25});
 assert.deepEqual(arc.geometry.center,{x:0,y:0});
 assert.deepEqual(arc.geometry.startAngle,0);
});


test("normalizes bulged polyline arcs into CAD document geometry",()=>{
 const doc=createCadDocument({items:[
  {kind:"polyline",pts:[0,0,100,0,100,100],bulges:[Math.tan(Math.PI/8),0,0],closed:false}
 ]});
 const geometry=doc.sheets[0].entities[0].geometry;
 assert.ok(geometry.points.length>4);
 assert.ok(geometry.curveDiagnostics?.tessellatedPointCount>4);
 assert.equal(geometry.closed,false);
 assert.deepEqual(geometry.bulges,[Math.tan(Math.PI/8),0,0]);
 assert.ok(geometry.points.some(point=>point[1]<0));
});

test("normalizes bulge values carried on vertex records",()=>{
 const doc=createCadDocument({items:[
  {kind:"polyline",vertices:[{x:0,y:0,bulge:Math.tan(Math.PI/8)},{x:100,y:0},{x:100,y:100}],closed:false}
 ]});
 const geometry=doc.sheets[0].entities[0].geometry;
 assert.ok(geometry.points.length>4);
 assert.ok(geometry.points.some(point=>point[1]<0));
});
