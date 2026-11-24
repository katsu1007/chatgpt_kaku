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

test("normal doorway openings are bridged so adjacent rooms remain separate",()=>{
  const items=[
    line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
    line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
    // 800 mm doorway gap in a continuous partition wall.
    line("間仕切壁",750,100,750,400),
    line("間仕切壁",750,1200,750,1400)
  ];
  const result=extractRoomHierarchy({items,width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
  assert.equal(result.diagnostics.bridgedDoorGaps,1);
});

test("toilet cubicles with door openings are extracted as separate compartments",()=>{
  const items=[
    line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
    line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
    // Two cubicle partitions, each with a 600 mm door opening.
    line("間仕切壁",500,100,500,500),line("間仕切壁",500,1100,500,1400),
    line("間仕切壁",900,100,900,500),line("間仕切壁",900,1100,900,1400)
  ];
  const result=extractRoomHierarchy({items,width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,3);
  assert.equal(result.diagnostics.bridgedDoorGaps,2);
});

test("A-WALL is recognised and DIM layer is excluded from automatic wall candidates",()=>{
  const items=[
    line("A-WALL",100,100,900,100),line("A-WALL",900,100,900,900),
    line("A-WALL",900,900,100,900),line("A-WALL",100,900,100,100),
    line("DIM",100,300,900,300),line("FURNITURE",200,200,300,300)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"A-WALL"},{name:"DIM"},{name:"FURNITURE"}],selectedLayers:[]});
  assert.equal(result.parents.length,1);
  assert.deepEqual(result.diagnostics.wallLayerNames,["A-WALL"]);
});
test("small closed title-block cells are filtered while real rooms remain",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    line("間仕切壁",500,100,500,900),
    // Tiny enclosed drafting box, far smaller than a usable room.
    line("間仕切壁",120,120,145,120),line("間仕切壁",145,120,145,145),
    line("間仕切壁",145,145,120,145),line("間仕切壁",120,145,120,120)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.rooms.length,2);
});

test("six open-front toilet cubicles are virtually closed as six separate bays",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400),line("外壁",100,2400,100,100),
    line("間仕切壁",300,2000,5700,2000),
    ...Array.from({length:7},(_,i)=>line("間仕切壁",300+i*900,500,300+i*900,2000))
  ];
  const result=extractRoomHierarchy({items,width:6300,height:2500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.ok(result.rooms.length>=6);
  const boothSeeds=result.rooms.filter(r=>r.cx*result.grid.cw>300&&r.cx*result.grid.cw<5700&&r.cy*result.grid.ch>500&&r.cy*result.grid.ch<2000);
  assert.ok(boothSeeds.length>=6);
});


test("automatic all-layer fallback preserves six virtual toilet cubicle closures",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400), // left outer edge is intentionally on another layer
    line("間仕切壁",100,2400,100,100),
    line("間仕切壁",300,2000,5700,2000),
    ...Array.from({length:7},(_,i)=>line("間仕切壁",300+i*900,500,300+i*900,2000))
  ];
  const result=extractRoomHierarchy({
    items,width:6300,height:2500,
    layers:[{name:"外壁"},{name:"間仕切壁"}],
    selectedLayers:["外壁"]
  });
  assert.equal(result.diagnostics.fallbackUsed,true);
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.equal(result.parents.length,1);
  assert.ok(result.rooms.length>=6);
  const boothRooms=result.rooms.filter(r=>{
    const x=r.cx*result.grid.cw,y=r.cy*result.grid.ch;
    return x>300&&x<5700&&y>500&&y<2000;
  });
  assert.ok(boothRooms.length>=6);
});


test("fragmented JWW partition strokes are merged before six-booth detection",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400),line("外壁",100,2400,100,100),
    // Rear wall is fragmented; each piece alone is shorter than the booth width.
    line("間仕切壁",300,2000,2050,2000),line("間仕切壁",2090,2000,3850,2000),
    line("間仕切壁",3890,2000,5700,2000),
    // Each side partition is also stored as two short pieces with a drafting gap.
    ...Array.from({length:7},(_,i)=>{
      const x=300+i*900;
      return [
        line("間仕切壁",x,500,x,1180),
        line("間仕切壁",x,1210,x,2000)
      ];
    }).flat()
  ];
  const result=extractRoomHierarchy({items,width:6300,height:2500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.ok(result.rooms.length>=6);
  const bays=result.rooms.filter(r=>{
    const x=r.cx*result.grid.cw,y=r.cy*result.grid.ch;
    return x>300&&x<5700&&y>500&&y<2000;
  });
  assert.ok(bays.length>=6);
});
