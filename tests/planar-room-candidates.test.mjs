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
