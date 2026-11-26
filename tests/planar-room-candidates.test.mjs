import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlanarRoomCandidates } from "../original/planar-room-candidates.js";
const line=(layer,x1,y1,x2,y2,extra={})=>({kind:"line",layer,pts:[x1,y1,x2,y2],...extra});
const box=(layer,x1,y1,x2,y2)=>[line(layer,x1,y1,x2,y1),line(layer,x2,y1,x2,y2),line(layer,x2,y2,x1,y2),line(layer,x1,y2,x1,y1)];
test("six toilet cubicles remain six separate bounded faces",()=>{
 const items=[...box("WALL",0,0,7000,3000),...Array.from({length:6},(_,i)=>box("WALL",200+i*1050,500,1200+i*1050,1800)).flat()];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.boundedFaces,7);assert.equal(r.diagnostics.inputSegments,28);
});
test("hidden and semantic furniture layers are excluded",()=>{
 const items=[...box("WALL",0,0,100,100),...box("FURNITURE",20,20,40,40)];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL","FURNITURE"],hiddenLayers:["FURNITURE"]});
 assert.equal(r.diagnostics.boundedFaces,1);assert.equal(r.diagnostics.inputItems,4);
});
test("numeric dimension strokes are filtered even when they share the wall layer",()=>{
 const items=[...box("WALL",0,0,1000,1000),line("WALL",100,500,900,500),{kind:"text",layer:"WALL",text:"800",x:450,y:480,size:20}];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.skippedDimensionSegments,1);assert.equal(r.diagnostics.boundedFaces,1);
});
test("closed polylines contribute their closing edge",()=>{
 const items=[{kind:"polyline",layer:"WALL",closed:true,pts:[0,0,100,0,100,100,0,100]}];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.inputSegments,4);assert.equal(r.diagnostics.boundedFaces,1);
});
test("a plausible opposing doorway gap receives one virtual closure",()=>{
 const items=[line("WALL",0,0,500,0),line("WALL",1400,0,1900,0),line("WALL",0,0,0,1000),line("WALL",1900,0,1900,1000),line("WALL",0,1000,1900,1000)];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.bridgedDoorGaps,1);assert.equal(r.diagnostics.boundedFaces,1);
});
test("text, point, block and hatch entities are not room boundaries",()=>{
 const items=[...box("WALL",0,0,100,100),{kind:"text",layer:"WALL"},{kind:"point",layer:"WALL"},{kind:"block",layer:"WALL"},{kind:"hatch",layer:"WALL",pts:[30,30,70,30,70,70,30,70]}];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.boundedFaces,1);assert.equal(r.diagnostics.skippedNonBoundaryKind,4);
});
test("native DWG HATCH strokes are excluded while explicit solid-fill candidates remain eligible",()=>{
 const items=[
  ...box("WALL",0,0,7000,3000),
  line("WALL",1000,1000,6000,1000,{hatchBoundary:true}),
  {kind:"fill",layer:"WALL",pts:[0,0,7000,0,7000,100,0,100],hatchBoundary:true,hatchFillCandidate:true}
 ];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.skippedHatchBoundary,1);
 assert.equal(r.diagnostics.acceptedWallFills,1);
});


test("explicit dimension graphics are excluded from planar room candidates",()=>{
 const items=[...box("WALL",0,0,1000,1000),line("WALL",500,0,500,1000,{dimensionLine:true})];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.skippedDimensionItems,1);
 assert.equal(r.diagnostics.boundedFaces,1);
});


test("dimension-tagged fragments are not used to invent doorway closures",()=>{
 const items=[
  line("WALL",0,0,500,0,{dimensionLine:true}),
  line("WALL",1300,0,1800,0,{dimensionExtension:true})
 ];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.skippedDimensionItems,2);
 assert.equal(r.diagnostics.bridgedDoorGaps,0);
 assert.equal(r.bridges.length,0);
});


test("face diagnostics retain source layer and calculate area only from uniform boundary scale",()=>{
 const items=[
  line("WALL",0,0,1000,0,{layerScaleDenominator:50,semanticRole:"wall"}),
  line("WALL",1000,0,1000,1000,{layerScaleDenominator:50,semanticRole:"wall"}),
  line("WALL",1000,1000,0,1000,{layerScaleDenominator:50,semanticRole:"wall"}),
  line("WALL",0,1000,0,0,{layerScaleDenominator:50,semanticRole:"wall"})
 ];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.faces.length,1);
 assert.equal(r.faces[0].sourceSummary.scaleStatus,"uniform");
 assert.equal(r.faces[0].sourceSummary.scaleDenominator,50);
 assert.equal(r.faces[0].sourceSummary.layers[0],"WALL");
 assert.equal(r.faces[0].sourceSummary.semanticRoleCounts.wall,4);
 assert.equal(r.faces[0].realAreaM2,2500);
});

test("mixed or missing source scales suppress face real-area output",()=>{
 const mixed=[...box("WALL",0,0,1000,1000)].map((item,i)=>({...item,layerScaleDenominator:i===0?50:100}));
 const unknown=[...box("WALL",0,0,1000,1000)];
 const a=analyzePlanarRoomCandidates({items:mixed,wallLayerNames:["WALL"]}).faces[0];
 const b=analyzePlanarRoomCandidates({items:unknown,wallLayerNames:["WALL"]}).faces[0];
 assert.equal(a.sourceSummary.scaleStatus,"mixed");
 assert.equal(a.realAreaM2,null);
 assert.equal(b.sourceSummary.scaleStatus,"unknown");
 assert.equal(b.realAreaM2,null);
});
