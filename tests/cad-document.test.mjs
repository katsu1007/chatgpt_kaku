import test from "node:test";
import assert from "node:assert/strict";
import { createCadDocument, normalizeCadEntity, transformCadPoint, attachCadEntityMetadata } from "../original/cad-document.js";

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


test("warns when only part of JWW dimension and block provenance survives flattening",()=>{
 const doc=createCadDocument({items:[
  {type:"sunpou",layer:"DIM"},
  {kind:"line",layer:"DIM",pts:[0,0,100,0]},
  {type:"block",layer:"SYMBOL",blockName:"TOILET"}
 ]},{sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":4,"count.CDataBlock":3}});
 assert.equal(doc.diagnostics.dimensionGraphics,1);
 assert.equal(doc.diagnostics.blockInstances,1);
 assert.equal(doc.diagnostics.sourceWarnings.length,2);
 assert.match(doc.diagnostics.sourceWarnings[0],/4件に対し、寸法として識別できた要素は 1件/);
 assert.match(doc.diagnostics.sourceWarnings[1],/3件に対し、ブロック由来として識別できた要素は 1件/);
});

test("does not warn when preserved JWW provenance meets or exceeds source counts",()=>{
 const doc=createCadDocument({items:[
  {type:"sunpou",layer:"DIM"},
  {type:"block",layer:"SYMBOL"}
 ]},{sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":1,"count.CDataBlock":1}});
 assert.deepEqual(doc.diagnostics.sourceWarnings,[]);
});


test("attaches complete normalized provenance to parser items without changing geometry",()=>{
 const items=[{kind:"line",pts:[0,0,100,0],layer:"WALL"},{kind:"text",text:"ROOM"}];
 const normalized=[
  {source:{type:"sen",layerScaleDenominator:50,groupIndex:2,layerIndex:1,sourceIndex:17,blockPath:["SYMBOLS","TOILET"]},semantic:{role:"block-instance",dimensionGraphic:false,blockInstance:true}},
  {source:{type:"moji",layerScaleDenominator:null,groupIndex:2,layerIndex:2,sourceIndex:18,blockPath:[]},semantic:{role:"dimension",dimensionGraphic:true,blockInstance:false}}
 ];
 const out=attachCadEntityMetadata(items,normalized);
 assert.deepEqual(out[0].pts,[0,0,100,0]);
 assert.equal(out[0].semanticRole,"block-instance");
 assert.equal(out[0].blockInstance,true);
 assert.equal(out[0].sourceGroupIndex,2);
 assert.equal(out[0].sourceLayerIndex,1);
 assert.equal(out[0].sourceEntityIndex,17);
 assert.deepEqual(out[0].blockPath,["SYMBOLS","TOILET"]);
 assert.equal(out[0].layerScaleDenominator,50);
 assert.equal(out[1].dimensionGraphic,true);
 assert.equal(out[1].semanticRole,"dimension");
 assert.equal(items[0].semanticRole,undefined);
});

test("preserves explicit parser metadata when normalized metadata is absent or weaker",()=>{
 const input=[{kind:"line",semanticRole:"wall",dimensionGraphic:false,blockPath:["EXISTING"],layerScaleDenominator:25}];
 const out=attachCadEntityMetadata(input,[{source:{blockPath:[],layerScaleDenominator:50},semantic:{role:"unclassified",dimensionGraphic:false}}]);
 assert.equal(out[0].semanticRole,"wall");
 assert.equal(out[0].layerScaleDenominator,25);
 assert.deepEqual(out[0].blockPath,["EXISTING"]);
});


test("known JWW dimension and block types override placeholder unclassified roles",()=>{
 const doc=createCadDocument({items:[
  {type:"sunpou",semanticRole:"unclassified"},
  {type:"block",semantic:{role:"unknown"}}
 ]});
 assert.equal(doc.sheets[0].entities[0].semantic.role,"dimension");
 assert.equal(doc.sheets[0].entities[0].semantic.dimensionGraphic,true);
 assert.equal(doc.sheets[0].entities[1].semantic.role,"block-instance");
 assert.equal(doc.sheets[0].entities[1].semantic.blockInstance,true);
});

test("normalized semantic metadata replaces placeholders but keeps explicit parser roles",()=>{
 const items=[
  {kind:"line",semanticRole:"unclassified",semantic:{role:"unknown",custom:"keep"}},
  {kind:"line",semanticRole:"wall"}
 ];
 const normalized=[
  {source:{},semantic:{role:"dimension",dimensionGraphic:true}},
  {source:{},semantic:{role:"block-instance",blockInstance:true}}
 ];
 const out=attachCadEntityMetadata(items,normalized);
 assert.equal(out[0].semanticRole,"dimension");
 assert.equal(out[0].dimensionGraphic,true);
 assert.equal(out[0].semantic.custom,"keep");
 assert.equal(out[1].semanticRole,"wall");
 assert.equal(out[1].blockInstance,true);
});


test("does not compare document-wide JWW source counts against a sliced frame",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",layer:"FRAME",pts:[0,0,100,0]}
 ]},{sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":12,"count.CDataBlock":8},sourceCountsComparable:false});
 assert.equal(doc.diagnostics.sourceCountsComparable,false);
 assert.deepEqual(doc.diagnostics.sourceWarnings,[]);
 assert.equal(doc.diagnostics.rawSourceTypeCounts["count.CDataSunpou"],12);
});

test("compares JWW source counts by default for a complete sheet",()=>{
 const doc=createCadDocument({items:[
  {type:"sunpou"},{type:"block"}
 ]},{sourceFormat:"JWW",sourceTypeCounts:{"count.CDataSunpou":2,"count.CDataBlock":2}});
 assert.equal(doc.diagnostics.sourceCountsComparable,true);
 assert.equal(doc.diagnostics.sourceWarnings.length,2);
});


test("preserves DWG variable line-segment widths and their units in CAD geometry",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],widthStart:4,widthEnd:6,widthSource:"vertex",widthUnit:"mm"}
 ]},{sourceFormat:"DWG"});
 const geometry=doc.sheets[0].entities[0].geometry;
 assert.deepEqual(geometry.widths,{start:4,end:6,unit:"mm",source:"vertex"});
 assert.deepEqual(geometry.points,[[0,0],[100,0]]);
});

test("does not invent line width geometry when source width is absent",()=>{
 const doc=createCadDocument({items:[{kind:"line",pts:[0,0,100,0]}]});
 assert.equal(doc.sheets[0].entities[0].geometry.widths,null);
});


test("reports preserved width metadata without treating it as wall thickness",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],widthStart:4,widthEnd:6,widthUnit:"mm"},
  {kind:"line",pts:[0,10,100,10]},
  {kind:"polyline",pts:[0,0,10,0],startWidth:0,endWidth:0,constantWidth:0}
 ]});
 assert.equal(doc.diagnostics.widthMetadataEntities,1);
 assert.deepEqual(doc.sheets[0].entities[0].geometry.widths,{start:4,end:6,unit:"mm",source:null});
});


test("preserves original source entity type when rendered geometry is expanded into segments",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],sourceGeometry:{kind:"polyline",closed:true,vertices:[[0,0],[100,0],[100,100]]}},
  {kind:"line",pts:[0,0,0,100],sourceGeometry:{kind:"mline",boundaries:[]}}
 ]},{sourceFormat:"DWG"});
 assert.equal(doc.sheets[0].entities[0].kind,"line");
 assert.equal(doc.sheets[0].entities[0].source.type,"polyline");
 assert.equal(doc.sheets[0].entities[0].source.raw.sourceGeometry.kind,"polyline");
 assert.equal(doc.sheets[0].entities[1].source.type,"mline");
});


test("explicit source entity type takes precedence over its flattened geometry kind",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",type:"sunpou",pts:[0,0,100,0],sourceGeometry:{kind:"line"}}
 ]},{sourceFormat:"JWW"});
 assert.equal(doc.sheets[0].entities[0].kind,"line");
 assert.equal(doc.sheets[0].entities[0].source.type,"sunpou");
 assert.equal(doc.sheets[0].entities[0].semantic.role,"dimension");
});


test("preserves variable width metadata on expanded DWG arc segments",()=>{
 const doc=createCadDocument({items:[
  {kind:"arc",cx:50,cy:50,r:25,a0:0,a1:Math.PI,widthStart:8,widthEnd:12,widthSource:"vertex",widthUnit:"mm"}
 ]},{sourceFormat:"DWG"});
 const geometry=doc.sheets[0].entities[0].geometry;
 assert.deepEqual(geometry.widths,{start:8,end:12,unit:"mm",source:"vertex"});
 assert.deepEqual(geometry.center,{x:50,y:50});
 assert.equal(geometry.radius,25);
});


test("inherits DWG block ancestry and insert handles as block-instance semantics",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],blockPath:["TOILET","STALL"],blockTransform:[1,0,0,1,500,200],sourceInsertHandle:"A1",sourceBlockHandle:"B2",sourceEntityHandle:"C3",blockInstanceIndex:4}
 ]},{sourceFormat:"DWG"});
 const entity=doc.sheets[0].entities[0];
 assert.equal(entity.semantic.role,"block-instance");
 assert.equal(entity.semantic.blockInstance,true);
 assert.deepEqual(entity.source.blockPath,["TOILET","STALL"]);
 assert.deepEqual(entity.source.blockTransform,[1,0,0,1,500,200]);
 assert.equal(entity.source.sourceInsertHandle,"A1");
 assert.equal(entity.source.sourceBlockHandle,"B2");
 assert.equal(entity.source.sourceEntityHandle,"C3");
 assert.equal(entity.source.blockInstanceIndex,4);
});

test("explicit wall semantics remain boundary geometry even when nested in a DWG block",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],semanticRole:"wall",blockPath:["WALL_ASSEMBLY"],sourceInsertHandle:"A1"}
 ]},{sourceFormat:"DWG"});
 const entity=doc.sheets[0].entities[0];
 assert.equal(entity.semantic.role,"wall");
 assert.equal(entity.semantic.blockInstance,false);
 assert.deepEqual(entity.source.blockPath,["WALL_ASSEMBLY"]);
});


test("propagates normalized DWG block transform and handle ancestry to analysis items",()=>{
 const items=[{kind:"line",pts:[0,0,100,0]}];
 const normalized=[{source:{
  blockPath:["SYMBOLS","URINAL"],blockTransform:[0,-1,1,0,300,400],
  sourceInsertHandle:"11",sourceBlockHandle:"22",sourceEntityHandle:"33",blockInstanceIndex:7
 },semantic:{role:"block-instance",blockInstance:true}}];
 const out=attachCadEntityMetadata(items,normalized)[0];
 assert.deepEqual(out.blockPath,["SYMBOLS","URINAL"]);
 assert.deepEqual(out.blockTransform,[0,-1,1,0,300,400]);
 assert.equal(out.sourceInsertHandle,"11");
 assert.equal(out.sourceBlockHandle,"22");
 assert.equal(out.sourceEntityHandle,"33");
 assert.equal(out.blockInstanceIndex,7);
 assert.equal(out.blockInstance,true);
});


test("falls back to non-empty base block ancestry when top-level block path is empty",()=>{
 const doc=createCadDocument({items:[
  {kind:"line",pts:[0,0,100,0],blockPath:[],base:{blockPath:["SYMBOLS","WASHBASIN"],sourceInsertHandle:"A1"}}
 ]});
 const entity=doc.sheets[0].entities[0];
 assert.deepEqual(entity.source.blockPath,["SYMBOLS","WASHBASIN"]);
 assert.equal(entity.semantic.role,"block-instance");
});


test("recovers original CAD provenance retained under expanded parser base objects",()=>{
  const raw={kind:"line",layer:"WALL",pts:[0,0,100,0],base:{
    type:"sunpou",sourceType:"CDataSunpou",handle:"BASE-17",sourceIndex:42,
    layerGroup:3,blockPath:["PLAN","DIMENSIONS"],blockInstanceIndex:6,
    blockTransform:[1,0,0,1,20,30]
  }};
  const entity=normalizeCadEntity(raw,0);
  assert.equal(entity.source.type,"CDataSunpou");
  assert.equal(entity.source.handle,"BASE-17");
  assert.equal(entity.source.sourceIndex,42);
  assert.equal(entity.source.layerGroup,"3");
  assert.deepEqual(entity.source.blockPath,["PLAN","DIMENSIONS"]);
  assert.equal(entity.source.blockInstanceIndex,6);
  assert.deepEqual(entity.source.blockTransform,[1,0,0,1,20,30]);
  assert.equal(entity.semantic.role,"dimension");
});
