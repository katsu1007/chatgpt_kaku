import test from "node:test";
import assert from "node:assert/strict";
import { extractRoomHierarchy } from "../original/room-engine.js";

const line=(layer,x1,y1,x2,y2)=>({kind:"line",layer,pts:[x1,y1,x2,y2]});
function fixture(){
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    line("間仕切壁",500,100,500,900),
    line("間仕切壁",100,500,900,500)
  ];
  return {items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]};
}
test("outer boundary becomes one parent and internal partitions become four child rooms",()=>{
  const result=extractRoomHierarchy(fixture());
  assert.equal(result.parents.length,1);
  assert.equal(result.parents[0].children.length,4);
  assert.equal(result.rooms.length,4);
  assert.equal(result.diagnostics.supplementalLayers,1);
});
test("hidden partition layer is excluded and parent region remains",()=>{
  const input={...fixture(),hiddenLayers:["間仕切壁"]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,1);
  assert.equal(result.diagnostics.childrenKept,0);
});
test("all wall layers are classified automatically without manual selection",()=>{
  const input=fixture();
  input.items.push(line("寸法",100,300,900,300),line("家具",200,200,300,300));
  input.layers.push({name:"寸法"},{name:"家具"});
  const result=extractRoomHierarchy({...input,selectedLayers:[]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,4);
  assert.deepEqual(result.diagnostics.wallLayerNames.sort(),["外壁","間仕切壁"]);
  assert.match(result.diagnostics.autoMode,/外周レイヤー/);
});
test("numeric layer names fall back to geometric classification",()=>{
  const items=[
    line("0",100,100,900,100),line("0",900,100,900,900),
    line("0",900,900,100,900),line("0",100,900,100,100),
    line("1",500,100,500,900),
    line("寸法",100,300,900,300)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"0"},{name:"1"},{name:"寸法"}],selectedLayers:[]});
  assert.equal(result.parents.length,2);
  assert.equal(result.rooms.length,2);
  assert.deepEqual(result.diagnostics.wallLayerNames.sort(),["0","1"]);
});

test("separate parent spaces keep their own child-room ownership and label points",()=>{
  const items=[
    line("外壁",100,100,400,100),line("外壁",400,100,400,900),
    line("外壁",400,900,100,900),line("外壁",100,900,100,100),
    line("外壁",600,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,600,900),line("外壁",600,900,600,100),
    line("間仕切壁",250,100,250,900),line("間仕切壁",750,100,750,900)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,2);
  assert.deepEqual(result.parents.map(p=>p.children.length),[2,2]);
  assert.equal(result.rooms.length,4);
  for(const room of result.rooms){
    const cellX=Math.round(room.labelX),cellY=Math.round(room.labelY);
    assert.equal(result.grid.ids[cellY*result.grid.nx+cellX],room.id);
  }
});

test("door opening in a partition stays open and does not create a false room split",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    // The 120 mm gap represents a doorway; it must not be bridged by cleanup.
    line("間仕切壁",500,100,500,440),
    line("間仕切壁",500,560,500,900)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,1);
  assert.equal(result.diagnostics.childrenKept,0);
});

test("diagonal partition connected to both boundary walls separates two rooms",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    line("間仕切壁",300,100,700,900)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
  assert.equal(result.parents[0].children.length,2);
  for(const room of result.rooms){
    const cellX=Math.round(room.labelX),cellY=Math.round(room.labelY);
    assert.equal(result.grid.ids[cellY*result.grid.nx+cellX],room.id);
  }
});

test("tiny drafting endpoint gap is healed without changing normal room topology",()=>{
  const items=[
    line("外壁",100,100,499.5,100),line("外壁",500.5,100,900,100),
    line("外壁",900,100,900,900),line("外壁",900,900,100,900),
    line("外壁",100,900,100,100)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.ok(result.diagnostics.endpointCount>=10);
});

test("dimension line on the same layer is ignored when a numeric dimension label sits on it",()=>{
  const items=[
    line("壁",100,100,900,100),line("壁",900,100,900,900),
    line("壁",900,900,100,900),line("壁",100,900,100,100),
    // A dimension stroke shares the wall layer but carries a numeric dimension label.
    line("壁",100,300,900,300),
    {kind:"text",layer:"文字",x:455,y:310,size:20,text:"8000",rot:0}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.ok(result.diagnostics.skippedDimensionSegments>0);
});
