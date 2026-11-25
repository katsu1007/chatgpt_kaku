import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlanarRoomCandidates } from "../original/planar-room-candidates.js";
const line=(layer,x1,y1,x2,y2)=>({kind:"line",layer,pts:[x1,y1,x2,y2]});
const box=(layer,x1,y1,x2,y2)=>[line(layer,x1,y1,x2,y1),line(layer,x2,y1,x2,y2),line(layer,x2,y2,x1,y2),line(layer,x1,y2,x1,y1)];
test("shadow graph identifies six separate toilet cubicles inside an outer enclosure",()=>{
 const items=[...box("WALL",0,0,7000,3000),...Array.from({length:6},(_,i)=>box("WALL",200+i*1050,500,1200+i*1050,1800)).flat()];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.boundedFaces,7);assert.equal(r.diagnostics.inputSegments,28);
});
test("hidden layers are excluded",()=>{
 const items=[...box("WALL",0,0,100,100),...box("FURNITURE",20,20,40,40)];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL","FURNITURE"],hiddenLayers:["FURNITURE"]});
 assert.equal(r.diagnostics.boundedFaces,1);assert.equal(r.diagnostics.inputItems,4);
});
test("text, arcs, fills and non-selected layers do not enter line graph",()=>{
 const items=[...box("WALL",0,0,100,100),{kind:"text",layer:"WALL"},{kind:"arc",layer:"WALL"},{kind:"fill",layer:"WALL",pts:[40,40,60,40,60,60,40,60]},line("DIM",0,50,100,50)];
 const r=analyzePlanarRoomCandidates({items,wallLayerNames:["WALL"]});
 assert.equal(r.diagnostics.inputItems,4);assert.equal(r.diagnostics.inputSegments,4);assert.equal(r.diagnostics.boundedFaces,1);
});
