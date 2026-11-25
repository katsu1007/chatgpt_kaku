import test from "node:test";
import assert from "node:assert/strict";
import { extractRoomHierarchy, suggestWallLayers } from "../original/room-engine.js";

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
test("selecting only interior partition layers still prefers a known exterior boundary",()=>{
  const input={...fixture(),selectedLayers:["間仕切壁"]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.parents.length,1);
  assert.equal(result.parents[0].children.length,4);
  assert.equal(result.rooms.length,4);
  assert.deepEqual(result.diagnostics.parentLayerNames,["外壁"]);
  assert.equal(result.diagnostics.fallbackUsed,false);
});

test("hidden partition layer is excluded and parent region remains",()=>{
  const input={...fixture(),hiddenLayers:["間仕切壁"]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,1);
  assert.equal(result.diagnostics.childrenKept,0);
});
test("explicitly selecting all wall candidates keeps exterior walls as parent boundary",()=>{
  const input=fixture();
  const result=extractRoomHierarchy({...input,selectedLayers:["外壁","間仕切壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.parents[0].children.length,4);
  assert.equal(result.rooms.length,4);
  assert.deepEqual(result.diagnostics.parentLayerNames,["外壁"]);
  assert.deepEqual(result.diagnostics.wallLayerNames.sort(),["外壁","間仕切壁"]);
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

test("polyline corner vertices are not mistaken for doorway endpoints",()=>{
  const items=[
    line("外壁",50,50,1450,50),line("外壁",1450,50,1450,950),
    line("外壁",1450,950,50,950),line("外壁",50,950,50,50),
    {kind:"line",layer:"間仕切壁",pts:[100,100,500,100,500,400]},
    line("間仕切壁",1100,100,1400,100)
  ];
  const result=extractRoomHierarchy({items,width:1500,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.bridgedDoorGaps,0);
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

test("compact filled CAD symbols are ignored as room boundaries",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    {kind:"fill",layer:"外壁",pts:[450,450,470,450,470,470,450,470]}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.ok(result.diagnostics.skippedNonWallFills>0);
});
test("long thin filled wall bands remain usable as partition boundaries",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    {kind:"fill",layer:"間仕切壁",pts:[490,100,510,100,510,900,490,900]}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.rooms.length,2);
});

test("wall layer suggestions exclude dimensions, furniture, equipment and annotations",()=>{
  assert.deepEqual(
    suggestWallLayers(["外壁","間仕切壁","トイレブース","A-WALL","建築寸法","壁注記","設備","FURNITURE","DIM","HATCH","A-WALL-HATCH"]),
    ["外壁","間仕切壁","トイレブース","A-WALL"]
  );
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
test("small valid room is retained beside a much larger hall by span rather than hall-area ratio",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    // A 40 x 40 mm enclosed room: small relative to the hall, but large enough
    // in both dimensions to be a plausible small service/utility space.
    line("間仕切壁",700,700,740,700),line("間仕切壁",740,700,740,740),
    line("間仕切壁",740,740,700,740),line("間仕切壁",700,740,700,700)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.rooms.length,2);
  assert.ok(result.diagnostics.minChildSpanCells>0);
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
  // Six enclosed cubicles plus one connected circulation area: no merged bays,
  // duplicate fragments, or phantom micro-rooms are acceptable.
  assert.equal(result.rooms.length,7);
  const boothSeeds=result.rooms.filter(r=>{
    const w=(r.maxx-r.minx+1)*result.grid.cw,h=(r.maxy-r.miny+1)*result.grid.ch;
    return w<1100&&h>1000;
  });
  assert.equal(boothSeeds.length,6);
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
  assert.equal(result.diagnostics.minParentSpanCells,Math.max(8,Math.ceil(Math.min(result.grid.nx,result.grid.ny)*.03)));
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,7);
  const boothRooms=result.rooms.filter(r=>{
    const w=(r.maxx-r.minx+1)*result.grid.cw,h=(r.maxy-r.miny+1)*result.grid.ch;
    return w<1100&&h>1000;
  });
  assert.equal(boothRooms.length,6);
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
  // This fixture isolates geometric fragment joining. Flood-fill room counts
  // are covered by the continuous-wall cubicle fixture above.
  assert.equal(result.diagnostics.virtualBoothClosures,6);
});


test("six-booth detection stays correct with many unrelated distant CAD segments",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400),line("外壁",100,2400,100,100),
    line("間仕切壁",300,2000,5700,2000),
    ...Array.from({length:7},(_,i)=>line("間仕切壁",300+i*900,500,300+i*900,2000)),
    ...Array.from({length:1200},(_,i)=>{
      const x=20000+(i%40)*200,y=20000+Math.floor(i/40)*200;
      return line("雑線",x,y,x+80,y+30);
    })
  ];
  const result=extractRoomHierarchy({items,width:6300,height:2500,layers:[{name:"外壁"},{name:"間仕切壁"},{name:"雑線"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.virtualBoothClosures,6);
});


test("room extraction retains more than 160 valid rooms in a large floor plan",()=>{
  const width=2000,height=1200,items=[
    line("外壁",100,100,width-100,100),
    line("外壁",width-100,100,width-100,height-100),
    line("外壁",width-100,height-100,100,height-100),
    line("外壁",100,height-100,100,100),
    ...Array.from({length:17},(_,i)=>line("間仕切壁",100+(i+1)*100,100,100+(i+1)*100,height-100)),
    ...Array.from({length:9},(_,i)=>line("間仕切壁",100,100+(i+1)*100,width-100,100+(i+1)*100))
  ];
  const result=extractRoomHierarchy({items,width,height,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,180);
  assert.equal(result.diagnostics.childrenKept,180);
  const pixelCounts=new Int32Array(result.rooms.length);
  for(const id of result.grid.ids)if(id>=0)pixelCounts[id]++;
  result.rooms.forEach((room,index)=>assert.equal(pixelCounts[index],room.area));
});


test("Japanese toilet-booth layers are automatically recognized as wall candidates",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400),line("外壁",100,2400,100,100),
    line("トイレブース",300,2000,5700,2000),
    ...Array.from({length:7},(_,i)=>line("トイレブース",300+i*900,500,300+i*900,2000))
  ];
  const result=extractRoomHierarchy({
    items,width:6300,height:2500,
    layers:[{name:"外壁"},{name:"トイレブース"}],
    selectedLayers:[]
  });
  assert.deepEqual(result.diagnostics.wallLayerNames.sort(),["トイレブース","外壁"]);
  assert.equal(result.parents.length,1);
  assert.equal(result.diagnostics.virtualBoothClosures,6);
});


test("near-miss partition endpoint snaps to the receiving wall without closing a real doorway",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    line("間仕切壁",500,100,500,898)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.rooms.length,2);
  assert.ok(result.diagnostics.snappedTJunctions>0);
});

test("endpoint-to-wall repair does not bridge a normal 120 mm doorway",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    line("間仕切壁",500,100,500,440),
    line("間仕切壁",500,560,500,900)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.rooms.length,1);
});

test("layer inventory reports primitive counts and surviving source metadata",()=>{
  const items=[
    {...line("外壁",100,100,900,100),sourceType:"sen",blockName:"WALL-A"},
    line("外壁",900,100,900,900),
    {kind:"text",layer:"文字",x:200,y:200,size:10,text:"会議室",entityType:"moji"}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"文字"}],selectedLayers:[]});
  const wall=result.diagnostics.layerInventory.find(x=>x.name==="外壁");
  const textLayer=result.diagnostics.layerInventory.find(x=>x.name==="文字");
  assert.equal(wall.line,2);
  assert.equal(wall.sourceTagged,1);
  assert.equal(wall.blockTagged,1);
  assert.equal(textLayer.text,1);
  assert.ok(result.diagnostics.usedSegments>0);
});

test("HATCH boundary outlines are excluded from room detection",()=>{
  const input=fixture();
  const hatch=[
    {kind:"line",layer:"外壁",pts:[150,150,350,150],hatchBoundary:true},
    {kind:"line",layer:"外壁",pts:[350,150,350,350],hatchBoundary:true},
    {kind:"line",layer:"外壁",pts:[350,350,150,350],hatchBoundary:true},
    {kind:"line",layer:"外壁",pts:[150,350,150,150],hatchBoundary:true}
  ];
  const result=extractRoomHierarchy({...input,items:[...input.items,...hatch]});
  assert.equal(result.rooms.length,4);
  assert.equal(result.parents.length,1);
});
