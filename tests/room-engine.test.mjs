import test from "node:test";
import assert from "node:assert/strict";
import { extractRoomHierarchy, suggestWallLayers } from "../original/room-engine.js";
import { createCadDocument, attachCadEntityMetadata } from "../original/cad-document.js";

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
test("anonymous CAD layers are not guessed as walls without explicit selection",()=>{
  const items=[
    line("0",100,100,900,100),line("0",900,100,900,900),
    line("0",900,900,100,900),line("0",100,900,100,100),
    line("1",500,100,500,900),
    line("寸法",100,300,900,300)
  ];
  assert.throws(
    ()=>extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"0"},{name:"1"},{name:"寸法"}],selectedLayers:[]}),
    /壁レイヤー/
  );
});

test("explicit exterior selection keeps anonymous symbol outlines out while retaining named partitions",()=>{
  const items=[
    line("0",100,100,900,100),line("0",900,100,900,900),
    line("0",900,900,100,900),line("0",100,900,100,100),
    line("間仕切壁",500,100,500,900),
    // A closed, unrelated symbol on an anonymous layer must not become a room.
    line("2",180,180,320,180),line("2",320,180,320,320),
    line("2",320,320,180,320),line("2",180,320,180,180)
  ];
  const result=extractRoomHierarchy({
    items,width:1000,height:1000,
    layers:[{name:"0"},{name:"間仕切壁"},{name:"2"}],
    selectedLayers:["0"]
  });
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
  assert.deepEqual(result.diagnostics.wallLayerNames.sort(),["0","間仕切壁"]);
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
  assert.equal(result.diagnostics.minParentSpanCells,Math.max(8,Math.ceil(30/Math.min(result.grid.cw,result.grid.ch))));
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
  // Fragment joining must survive the full production pipeline, not merely
  // report six virtual closures. Each cubicle must become its own room and the
  // corridor must remain one region; no phantom sliver rooms are acceptable.
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.ok(result.diagnostics.bridgedFragmentGaps>=9);
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,7);
  const booths=result.rooms.filter(room=>{
    const width=(room.maxx-room.minx+1)*result.grid.cw;
    const height=(room.maxy-room.miny+1)*result.grid.ch;
    return width>=800&&width<=1000&&height>=1400&&height<=1600;
  });
  assert.equal(booths.length,6);
  assert.ok(result.rooms.every(room=>room.area>0));
  const cellCounts=new Int32Array(result.rooms.length);
  for(const id of result.grid.ids)if(id>=0)cellCounts[id]++;
  result.rooms.forEach((room,index)=>assert.equal(cellCounts[index],room.area));
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
 assert.equal(result.diagnostics.filteredFurnitureIslands,1);
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

test("solid HATCH wall-band candidates split rooms while ordinary area fills are ignored",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {kind:"fill",layer:"間仕切壁",pts:[490,100,510,100,510,900,490,900],hatchFillCandidate:true},
  {kind:"fill",layer:"間仕切壁",pts:[200,200,400,200,400,400,200,400],hatchFillCandidate:true}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,2);
 assert.equal(result.diagnostics.childrenKept,2);
});


test("explicit dimension-graphic metadata is excluded even when it shares a wall layer",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    {...line("外壁",500,100,500,900),dimensionGraphic:true}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.ok(result.diagnostics.skippedDimensionItems>0);
});


test("small toilet cubicles survive when the drawing covers a large warehouse floor",()=>{
  const items=[
    line("外壁",100,100,62900,100),line("外壁",62900,100,62900,24900),
    line("外壁",62900,24900,100,24900),line("外壁",100,24900,100,100),
    line("間仕切壁",3000,6500,8400,6500),
    ...Array.from({length:7},(_,i)=>line("間仕切壁",3000+i*900,5000,3000+i*900,6500))
  ];
  const result=extractRoomHierarchy({items,width:63000,height:25000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,7);
  const booths=result.rooms.filter(r=>{
    const w=(r.maxx-r.minx+1)*result.grid.cw,h=(r.maxy-r.miny+1)*result.grid.ch;
    return w>=650&&w<=1000&&h>=1200&&h<=1600;
  });
  assert.equal(booths.length,6);
  assert.ok(result.diagnostics.minChildSpanCells<=21);
});


test("automatic wall discovery ignores non-plan Jw_cad groups even when their layer is named 躯体",()=>{
  const items=[
    line("0-1 平面図 / 外壁",100,100,900,100),line("0-1 平面図 / 外壁",900,100,900,900),
    line("0-1 平面図 / 外壁",900,900,100,900),line("0-1 平面図 / 外壁",100,900,100,100),
    line("0-2 平面図 / 間仕切壁",500,100,500,900),
    line("2-1 展開図 / 躯体",1100,100,1500,100),line("2-1 展開図 / 躯体",1500,100,1500,500),
    line("2-1 展開図 / 躯体",1500,500,1100,500),line("2-1 展開図 / 躯体",1100,500,1100,100)
  ];
  const layers=[{name:"0-1 平面図 / 外壁"},{name:"0-2 平面図 / 間仕切壁"},{name:"2-1 展開図 / 躯体"}];
  const result=extractRoomHierarchy({items,width:1600,height:1000,layers,selectedLayers:[]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
  assert.ok(!result.diagnostics.wallLayerNames.includes("2-1 展開図 / 躯体"));
  assert.deepEqual(suggestWallLayers(layers).sort(),["0-1 平面図 / 外壁","0-2 平面図 / 間仕切壁"]);
});


test("real-world Jw_cad architectural layer names distinguish wall structure from finish and guide layers",()=>{
  const names=[
    "0-1 平面図 / 躯体","0-1 平面図 / 壁","0-1 平面図 / 袖壁",
    "0-1 平面図 / 耐力壁","0-1 平面図 / 改修壁","0-1 平面図 / トイレブース",
    "0-2 平面図 / パーティション","0-1 平面図 / 壁塗りつぶし",
    "0-1 平面図 / 外壁仕上","0-1 平面図 / 内壁仕上",
    "0-1 平面図 / 壁仕上ライン","0-1 平面図 / 壁部分目地",
    "0-1 平面図 / 外装ルーバー","0-1 平面図 / 基準線",
    "0-1 平面図 / 床仕上","0-1 平面図 / タイル","0-1 平面図 / 寸法"
  ];
  const actual=suggestWallLayers(names);
  for(const name of ["0-1 平面図 / 躯体","0-1 平面図 / 壁","0-1 平面図 / 袖壁","0-1 平面図 / 耐力壁","0-1 平面図 / 改修壁","0-1 平面図 / トイレブース","0-2 平面図 / パーティション","0-1 平面図 / 壁塗りつぶし"]) assert.ok(actual.includes(name),name+" should remain a wall candidate");
  for(const name of ["0-1 平面図 / 外壁仕上","0-1 平面図 / 内壁仕上","0-1 平面図 / 壁仕上ライン","0-1 平面図 / 壁部分目地","0-1 平面図 / 外装ルーバー","0-1 平面図 / 基準線","0-1 平面図 / 床仕上","0-1 平面図 / タイル","0-1 平面図 / 寸法"]) assert.ok(!actual.includes(name),name+" must not become a wall boundary layer");
});

test("uniform Jw_cad group scale converts drawing area to real square metres",()=>{
  const input={...fixture(),layers:[{name:"外壁",scale:50},{name:"間仕切壁",scale:50}]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.diagnostics.scaleAssessment.status,"uniform");
  assert.equal(result.diagnostics.scaleAssessment.denominator,50);
  for(const room of result.rooms) assert.equal(room.realAreaM2,room.drawingAreaCm2*2500/10000);
});
test("mixed layer-group scales suppress real area instead of guessing",()=>{
  const input={...fixture(),layers:[{name:"外壁",scale:50},{name:"間仕切壁",scale:10}]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.diagnostics.scaleAssessment.status,"mixed");
  assert.equal(result.diagnostics.scaleAssessment.denominator,null);
  assert.ok(result.rooms.every(room=>room.realAreaM2===null));
});
test("missing layer scale suppresses real area and identifies affected layers",()=>{
  const input={...fixture(),layers:[{name:"外壁",scale:50},{name:"間仕切壁"}]};
  const result=extractRoomHierarchy(input);
  assert.equal(result.diagnostics.scaleAssessment.status,"unknown");
  assert.deepEqual(result.diagnostics.scaleAssessment.unknownLayers,["間仕切壁"]);
  assert.ok(result.rooms.every(room=>room.realAreaM2===null));
});


test("closed CAD polylines form production room boundaries",()=>{
  const items=[
    {kind:"polyline",layer:"外壁",closed:true,pts:[100,100,900,100,900,900,100,900]},
    {kind:"polyline",layer:"間仕切壁",closed:true,pts:[500,100,500,900,100,900,100,100]}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
});

test("semantic-role dimension graphics are excluded even without legacy boolean flags",()=>{
  const items=[
    line("壁",100,100,900,100),line("壁",900,100,900,900),
    line("壁",900,900,100,900),line("壁",100,900,100,100),
    {...line("壁",100,300,900,300),semanticRole:"dimension"}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.equal(result.diagnostics.skippedDimensionItems,1);
});


test("six toilet cubicles are detected when side partitions are stored as polylines",()=>{
  const items=[
    line("外壁",100,100,6200,100),line("外壁",6200,100,6200,2400),
    line("外壁",6200,2400,100,2400),line("外壁",100,2400,100,100),
    line("間仕切壁",300,2000,5700,2000),
    ...Array.from({length:7},(_,i)=>({kind:"polyline",layer:"間仕切壁",pts:[300+i*900,500,300+i*900,2000]}))
  ];
  const result=extractRoomHierarchy({items,width:6300,height:2500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.virtualBoothClosures,6);
  assert.equal(result.rooms.length,7);
});


test("circle entities form a closed wall boundary in production room tracing",()=>{
 const items=[{kind:"circle",layer:"外壁",cx:500,cy:500,r:400}];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,1);
});

test("closed ellipse geometry is traced as a room boundary",()=>{
 const result=extractRoomHierarchy({items:[{kind:"ellipse",layer:"外壁",center:[500,500,0],majorAxis:[400,0,0],axisRatio:1,startParameter:0,endParameter:Math.PI*2}],width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,1);
});
test("bulged polyline boundaries are rasterized as curves",()=>{
 const items=[
  {kind:"polyline",layer:"外壁",pts:[100,100,900,100,900,900,100,900],bulges:[0,0,0,0],closed:true}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,1);
});

test("decoded R2004 circle center and radius fields form a production room",()=>{
 const result=extractRoomHierarchy({items:[{kind:"circle",layer:"外壁",center:[500,500,0],radius:400}],width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,1);
});
test("decoded R2004 arc center and angle fields are traced",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),line("外壁",900,900,100,900),
  {kind:"arc",layer:"外壁",center:[100,500,0],radius:400,startAngle:-Math.PI/2,endAngle:Math.PI/2}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
});

test("dimension labels using height and rotation fields suppress dimension strokes",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",100,300,900,300),
  {kind:"text",layer:"文字",x:455,y:310,height:20,text:"8000",rotation:0}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.ok(result.diagnostics.skippedDimensionSegments>0);
});

test("dimension labels with W/H prefixes and width factors are recognized",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",100,300,900,300),
  {kind:"text",layer:"文字",x:455,y:310,height:20,widthFactor:1.2,text:"W=8000 mm",rotation:0}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.ok(result.diagnostics.skippedDimensionSegments>0);
});

test("rotated dimension labels suppress matching diagonal dimension strokes",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",100,100,900,900),
  {kind:"text",layer:"文字",x:450,y:450,height:20,text:"1131",rotation:Math.PI/4}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.ok(result.diagnostics.skippedDimensionSegments>0);
});

test("ordinary room text containing a number does not suppress real partitions",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",100,300,900,300),
  {kind:"text",layer:"文字",x:455,y:310,height:20,text:"ROOM 8000",rotation:0}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.equal(result.rooms.length,2);
});

test("JWW dimension extension lines are filtered only when paired at both ends",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",200,200,800,200),line("壁",200,100,200,200),line("壁",800,100,800,200),
  {kind:"text",layer:"文字",x:480,y:210,size:20,text:"6000",rot:0}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.ok(result.diagnostics.skippedDimensionSegments>=3);
});

test("a lone perpendicular wall meeting a dimension endpoint is not discarded",()=>{
 const items=[
  line("壁",100,100,900,100),line("壁",900,100,900,900),line("壁",900,900,100,900),line("壁",100,900,100,100),
  line("壁",200,200,800,200),line("壁",200,100,200,200),
  line("壁",800,200,800,800),
  {kind:"text",layer:"文字",x:480,y:210,size:20,text:"6000",rot:0}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"},{name:"文字"}],selectedLayers:[]});
 assert.ok(result.diagnostics.skippedDimensionSegments<=2);
});

test("full-sweep JWW arcs close into room boundaries without open-arc endpoint treatment",()=>{
 const result=extractRoomHierarchy({items:[{kind:"arc",layer:"外壁",cx:500,cy:500,r:400,a0:0,a1:Math.PI*2}],width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,1);
});

test("explicit furniture and fixture semantics cannot become production room boundaries",()=>{
 const items=[
  {...line("壁",100,100,900,100),semanticRole:"fixture.toilet"},
  {...line("壁",900,100,900,900),semanticRole:"fixture.toilet"},
  {...line("壁",900,900,100,900),semanticRole:"fixture.toilet"},
  {...line("壁",100,900,100,100),semanticRole:"fixture.toilet"}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"}],selectedLayers:["壁"]});
 assert.equal(result.rooms.length,0);
 assert.equal(result.diagnostics.skippedSemanticItems,4);
});

test("explicit partition semantics remain eligible for room boundaries",()=>{
 const items=[
  {...line("壁",100,100,900,100),semanticRole:"partition"},
  {...line("壁",900,100,900,900),semanticRole:"partition"},
  {...line("壁",900,900,100,900),semanticRole:"partition"},
  {...line("壁",100,900,100,100),semanticRole:"partition"}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"}],selectedLayers:["壁"]});
 assert.equal(result.rooms.length,1);
 assert.equal(result.diagnostics.skippedSemanticItems,0);
});

test("supercover rasterization seals slanted room boundaries with a single-cell trace",()=>{
 const items=[
  line("外壁",100,100,900,200),line("外壁",900,200,800,900),
  line("外壁",800,900,150,800),line("外壁",150,800,100,100)
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.equal(result.diagnostics.rasterization,"supercover");
 assert.ok(result.diagnostics.rasterizedCells>0);
});

test("explicit floor fill polygon can seed one room when wall boundaries are absent",()=>{
 const items=[{kind:"fill",layer:"床",semanticRole:"floor",pts:[100,100,900,100,900,900,100,900]}];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"床"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 assert.equal(result.diagnostics.floorFillCount,1);
 assert.equal(result.diagnostics.floorFillUsed,true);
 assert.ok(result.diagnostics.floorMaskCells>0);
});

test("floor fill mask is split by real partition walls while furniture stays non-boundary",()=>{
 const items=[
  {kind:"fill",layer:"床",semanticRole:"floor",pts:[100,100,900,100,900,900,100,900]},
  line("壁",500,100,500,900),
  {...line("壁",250,300,400,300),semanticRole:"furniture"},
  {...line("壁",400,300,400,600),semanticRole:"furniture"},
  {...line("壁",400,600,250,600),semanticRole:"furniture"},
  {...line("壁",250,600,250,300),semanticRole:"furniture"}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"}],selectedLayers:["壁"]});
 assert.equal(result.rooms.length,2);
 assert.equal(result.diagnostics.floorFillCount,1);
 assert.ok(result.diagnostics.skippedSemanticItems>=4);
});

test("disjoint explicit floor polygons create separate fallback room regions",()=>{
 const items=[
  {kind:"fill",layer:"床",semanticRole:"floor",pts:[100,100,400,100,400,500,100,500]},
  {kind:"fill",layer:"床",semanticRole:"floor",pts:[600,100,900,100,900,500,600,500]}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"床"}],selectedLayers:[]});
 assert.equal(result.rooms.length,2);
 assert.equal(result.diagnostics.floorFillCount,2);
});

test("untagged decorative fills are not treated as floor regions",()=>{
 const items=[{kind:"fill",layer:"HATCH",pts:[100,100,900,100,900,900,100,900]}];
 assert.throws(()=>extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"HATCH"}],selectedLayers:[]}),/壁レイヤー/);
});


test("closed floor-fill polylines use bulge arcs instead of straight chord edges",()=>{
 const straight={kind:"polyline",layer:"床",semanticRole:"floor",closed:true,pts:[100,100,900,100,900,900,100,900]};
 const curved={...straight,bulges:[-0.1,0,0,0]};
 const a=extractRoomHierarchy({items:[straight],width:1000,height:1000,layers:[{name:"床"}],selectedLayers:[]});
 const b=extractRoomHierarchy({items:[curved],width:1000,height:1000,layers:[{name:"床"}],selectedLayers:[]});
 assert.equal(a.rooms.length,1);
 assert.equal(b.rooms.length,1);
 assert.notEqual(a.diagnostics.floorMaskCells,b.diagnostics.floorMaskCells);
});


test("block-contained wall geometry remains usable while fixture blocks on the same wall layer are excluded",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("間仕切壁",500,100,500,900),semanticRole:"block-instance",blockInstance:true,blockPath:["WALL_ASSEMBLY"],sourceInsertHandle:"A1"},
  {...line("間仕切壁",200,200,300,200),semanticRole:"fixture",semantic:{role:"block-instance"},blockInstance:true},
  {...line("間仕切壁",300,200,300,300),semanticRole:"fixture",semantic:{role:"block-instance"},blockInstance:true},
  {...line("間仕切壁",300,300,200,300),semanticRole:"fixture",semantic:{role:"block-instance"},blockInstance:true},
  {...line("間仕切壁",200,300,200,200),semanticRole:"fixture",semantic:{role:"block-instance"},blockInstance:true}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,2);
 assert.equal(result.parents[0].children.length,2);
 assert.ok(result.diagnostics.skippedSemanticItems>0);
});


test("DWG block provenance survives CAD normalization and drives production room extraction",()=>{
 const rawItems=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("間仕切壁",500,100,500,900),blockPath:["WALL_ASSEMBLY"],blockTransform:[1,0,0,1,0,0],sourceInsertHandle:"A1",sourceBlockHandle:"B1",sourceEntityHandle:"C1",blockInstanceIndex:2},
  {...line("間仕切壁",200,200,300,200),blockPath:["FIXTURE","SINK"],semanticRole:"fixture"},
  {...line("間仕切壁",300,200,300,300),blockPath:["FIXTURE","SINK"],semanticRole:"fixture"},
  {...line("間仕切壁",300,300,200,300),blockPath:["FIXTURE","SINK"],semanticRole:"fixture"},
  {...line("間仕切壁",200,300,200,200),blockPath:["FIXTURE","SINK"],semanticRole:"fixture"}
 ];
 const layers=[{name:"外壁"},{name:"間仕切壁"}];
 const model=createCadDocument({items:rawItems},{sourceFormat:"DWG",layers});
 const items=attachCadEntityMetadata(rawItems,model.sheets[0].entities);
 const wallBlock=items[4];
 assert.equal(wallBlock.semanticRole,"block-instance");
 assert.equal(wallBlock.blockInstance,true);
 assert.deepEqual(wallBlock.blockPath,["WALL_ASSEMBLY"]);
 assert.deepEqual(wallBlock.blockTransform,[1,0,0,1,0,0]);
 assert.equal(wallBlock.sourceInsertHandle,"A1");
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers,selectedLayers:["外壁"]});
 assert.equal(result.parents.length,1);
 assert.equal(result.rooms.length,2);
 assert.equal(result.parents[0].children.length,2);
 assert.ok(result.diagnostics.skippedSemanticItems>=4);
});


test("layer inventory counts DWG block paths and insert handles as source provenance",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("間仕切壁",500,100,500,900),blockPath:["WALL_ASSEMBLY","PARTITION"],sourceInsertHandle:"A1",sourceBlockHandle:"B1",sourceEntityHandle:"C1",blockInstance:true}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 const wall=result.diagnostics.layerInventory.find(x=>x.name==="間仕切壁");
 assert.equal(wall.sourceTagged,1);
 assert.equal(wall.blockTagged,1);
});


test("unused unknown-scale wall candidate layers do not block conversion from actual boundary layers",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  line("間仕切壁",500,100,500,900)
 ];
 const layers=[
  {name:"外壁",scale:50},
  {name:"間仕切壁",scale:50},
  {name:"壁_予備レイヤー",scale:null}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers,selectedLayers:["外壁"]});
 assert.equal(result.diagnostics.scaleAssessment.status,"uniform");
 assert.equal(result.diagnostics.scaleAssessment.denominator,50);
 assert.deepEqual(result.diagnostics.scaleAssessment.usedBoundaryLayers.sort(),["外壁","間仕切壁"]);
 assert.ok(result.rooms.every(room=>room.realAreaM2!=null));
});

test("hidden and unused wall candidates do not enter the used boundary scale set",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  line("間仕切壁",500,100,500,900),
  line("壁_非表示",200,200,800,200)
 ];
 const layers=[
  {name:"外壁",scale:50},
  {name:"間仕切壁",scale:50},
  {name:"壁_非表示",scale:10},
  {name:"壁_未使用",scale:null}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers,selectedLayers:["外壁"],hiddenLayers:["壁_非表示"]});
 assert.deepEqual(result.diagnostics.scaleAssessment.usedBoundaryLayers.sort(),["外壁","間仕切壁"]);
 assert.equal(result.diagnostics.scaleAssessment.status,"uniform");
});


test("source trace inventory counts attached original CAD handles",()=>{
 const items=[line("壁",20,20,180,20),line("壁",180,20,180,180),line("壁",180,180,20,180),line("壁",20,180,20,20)];
 items[0].sourceHandle="A0F1";items[0].sourceFormat="JWW";items[0].sourceLayerGroup="3";
 const result=extractRoomHierarchy({items,width:200,height:200,layers:[{name:"壁"}],selectedLayers:["壁"]});
 const layer=result.diagnostics.layerInventory.find(entry=>entry.name==="壁");
 assert.equal(layer.sourceTagged,1);
});


test("assesses real-area scale independently for rooms enclosed by different CAD layers",()=>{
  const items=[
    line("外壁A",100,100,400,100),line("外壁A",400,100,400,400),
    line("外壁A",400,400,100,400),line("外壁A",100,400,100,100),
    line("外壁B",600,600,900,600),line("外壁B",900,600,900,900),
    line("外壁B",900,900,600,900),line("外壁B",600,900,600,600)
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,
    layers:[{name:"外壁A",scale:50},{name:"外壁B",scale:100}],selectedLayers:[]});
  assert.equal(result.rooms.length,2);
  const byName=new Map(result.rooms.map(room=>[room.scaleAssessment.boundaryLayers[0],room]));
  assert.equal(byName.get("外壁A").scaleAssessment.status,"uniform");
  assert.equal(byName.get("外壁A").scaleAssessment.denominator,50);
  assert.equal(byName.get("外壁B").scaleAssessment.status,"uniform");
  assert.equal(byName.get("外壁B").scaleAssessment.denominator,100);
  assert.ok(byName.get("外壁A").realAreaM2>0);
  assert.ok(byName.get("外壁B").realAreaM2>byName.get("外壁A").realAreaM2);
  assert.equal(result.diagnostics.scaleAssessment.status,"mixed");
});


test("slanted doorway fragments with a modest drafting offset are joined safely",()=>{
  const items=[
    line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
    line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
    // The two wall fragments share an axis within 50 mm but are not perfectly
    // collinear, as can happen after separate CAD snapping/coordinate rounding.
    line("間仕切壁",400,100,600,500),
    line("間仕切壁",921.2,1232.9,1000,1400)
  ];
  const result=extractRoomHierarchy({items,width:1500,height:1500,
    layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.parents.length,1);
  assert.equal(result.rooms.length,2);
  assert.equal(result.diagnostics.bridgedDoorGaps,1);
});

test("nearby parallel wall ends beyond the alignment tolerance are not bridged",()=>{
  const items=[
    line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
    line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
    line("間仕切壁",500,100,500,400),
    // 100 mm sideways displacement is not a doorway continuation.
    line("間仕切壁",600,1200,600,1400)
  ];
  const result=extractRoomHierarchy({items,width:1500,height:1500,
    layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
  assert.equal(result.diagnostics.bridgedDoorGaps,0);
});


test("raw JWW Sunpou source identity suppresses dimension strokes before normalized flags are attached",()=>{
  const items=[
    line("壁",100,100,900,100),line("壁",900,100,900,900),
    line("壁",900,900,100,900),line("壁",100,900,100,100),
    {...line("壁",100,300,900,300),sourceType:"sunpou"}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"壁"}],selectedLayers:["壁"]});
  assert.equal(result.rooms.length,1);
  assert.equal(result.diagnostics.skippedDimensionItems,1);
});

test("block-instance symbols on a wall-named layer are excluded unless explicitly classified as a wall",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    // A closed toilet fixture/furniture block was inserted on a wall-named layer.
    {kind:"polyline",layer:"外壁",pts:[300,300,500,300,500,500,300,500],closed:true,semanticRole:"block-instance",blockInstance:true}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,1);
  assert.ok(result.diagnostics.skippedSemanticItems>0);
});

test("explicitly classified wall geometry inside a block remains eligible as a boundary",()=>{
  const items=[
    line("外壁",100,100,900,100),line("外壁",900,100,900,900),
    line("外壁",900,900,100,900),line("外壁",100,900,100,100),
    {kind:"line",layer:"間仕切壁",pts:[500,100,500,900],semanticRole:"wall",blockInstance:true}
  ];
  const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:[]});
  assert.equal(result.rooms.length,2);
});


test("flattened JWW block children retain native layer separately from INSERT layer and guide room boundaries",()=>{
 const rawItems=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("外壁",500,100,500,900),blockPath:["BLOCK_01"],base:{kind:"line",layer:"間仕切壁",pts:[500,100,500,900]}},
  {...line("外壁",200,200,300,200),blockPath:["FIXTURE","SINK"],base:{kind:"line",layer:"家具",pts:[200,200,300,200]}},
  {...line("外壁",300,200,300,300),blockPath:["FIXTURE","SINK"],base:{kind:"line",layer:"家具",pts:[300,200,300,300]}},
  {...line("外壁",300,300,200,300),blockPath:["FIXTURE","SINK"],base:{kind:"line",layer:"家具",pts:[300,300,200,300]}},
  {...line("外壁",200,300,200,200),blockPath:["FIXTURE","SINK"],base:{kind:"line",layer:"家具",pts:[200,300,200,200]}}
 ];
 const layers=[{name:"外壁"}];
 const model=createCadDocument({items:rawItems},{sourceFormat:"JWW",layers});
 const items=attachCadEntityMetadata(rawItems,model.sheets[0].entities);
 assert.equal(items[4].layer,"外壁");
 assert.equal(items[4].sourceNativeLayer,"間仕切壁");
 assert.equal(items[4].sourceInsertionLayer,"外壁");
 assert.equal(items[5].sourceNativeLayer,"家具");
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers,selectedLayers:["外壁"]});
 assert.equal(result.rooms.length,2);
 assert.ok(result.diagnostics.skippedSemanticItems>=4);
});


test("block children with lost native layers do not inherit wall status from INSERT layer",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("外壁",500,100,500,900),blockPath:["FIXTURE_SET"],sourceLayerProvenance:"child-layer-unavailable"}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:["外壁"]});
 assert.equal(result.rooms.length,1);
 assert.equal(result.diagnostics.skippedSemanticItems,1);
});

test("explicit wall semantics override missing block child layer provenance",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100),
  {...line("外壁",500,100,500,900),blockPath:["CUSTOM_BLOCK"],sourceLayerProvenance:"child-layer-unavailable",semanticRole:"wall"}
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:["外壁"]});
 assert.equal(result.rooms.length,2);
});


test("short same-layer wall fragments heal up to 60 mm but not beyond",()=>{
 const make=(gap)=>[
  line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
  line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
  line("間仕切壁",750,100,750,700),
  line("間仕切壁",750,700+gap,750,1400)
 ];
 const joined=extractRoomHierarchy({items:make(60),width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 assert.equal(joined.diagnostics.bridgedFragmentGaps,1);
 assert.equal(joined.rooms.length,2);
 const open=extractRoomHierarchy({items:make(61),width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 assert.equal(open.diagnostics.bridgedFragmentGaps,0);
 assert.equal(open.rooms.length,1);
});

test("short fragments on different CAD layers are not joined",()=>{
 const items=[
  line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
  line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
  line("間仕切壁",750,100,750,700),
  line("トイレブース",750,760,750,1400)
 ];
 const result=extractRoomHierarchy({items,width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"},{name:"トイレブース"}],selectedLayers:["外壁"]});
 assert.equal(result.diagnostics.bridgedFragmentGaps,0);
 assert.equal(result.rooms.length,1);
});


test("short slanted wall fragments are joined along their shared axis",()=>{
 const items=[
  line("外壁",100,100,1400,100),line("外壁",1400,100,1400,1400),
  line("外壁",1400,1400,100,1400),line("外壁",100,1400,100,100),
  line("間仕切壁",400,100,600,620),
  line("間仕切壁",611.5,650,900,1400)
 ];
 const result=extractRoomHierarchy({items,width:1500,height:1500,layers:[{name:"外壁"},{name:"間仕切壁"}],selectedLayers:["外壁"]});
 assert.equal(result.diagnostics.bridgedFragmentGaps,1);
 assert.equal(result.rooms.length,2);
});


test("rectangular room drawing area stays within 2 percent of geometric area",()=>{
 const items=[
  line("外壁",100,100,900,100),line("外壁",900,100,900,900),
  line("外壁",900,900,100,900),line("外壁",100,900,100,100)
 ];
 const result=extractRoomHierarchy({items,width:1000,height:1000,layers:[{name:"外壁"}],selectedLayers:[]});
 assert.equal(result.rooms.length,1);
 const expectedCm2=800*800/100;
 const relativeError=Math.abs(result.rooms[0].drawingAreaCm2-expectedCm2)/expectedCm2;
 assert.ok(relativeError<0.02,"area error "+(relativeError*100).toFixed(2)+"%");
});


test("furniture-shaped closed loop on a wall layer is not a room when surrounded by furniture symbols",()=>{
 const items=[
  line("壁",100,100,10000,100),line("壁",10000,100,10000,10000),
  line("壁",10000,10000,100,10000),line("壁",100,10000,100,100),
  line("壁",4000,4000,5200,4000),line("壁",5200,4000,5200,6000),
  line("壁",5200,6000,4000,6000),line("壁",4000,6000,4000,4000)
 ];
 const addRect=(layer,x1,y1,x2,y2)=>{
  items.push(line(layer,x1,y1,x2,y1),line(layer,x2,y1,x2,y2),line(layer,x2,y2,x1,y2),line(layer,x1,y2,x1,y1));
 };
 addRect("データ 005",3400,4100,3800,4500);
 addRect("データ 005",3400,4700,3800,5100);
 addRect("データ 005",5400,4100,5800,4500);
 addRect("データ 005",5400,4700,5800,5100);
 const result=extractRoomHierarchy({items,width:11000,height:11000,layers:[{name:"壁"},{name:"データ 005"}],selectedLayers:["壁"]});
 assert.equal(result.rooms.length,1);
});


test("an explicit room label preserves a small room despite nearby furniture geometry",()=>{
 const items=[
  line("壁",100,100,10000,100),line("壁",10000,100,10000,10000),
  line("壁",10000,10000,100,10000),line("壁",100,10000,100,100),
  line("壁",4000,4000,5200,4000),line("壁",5200,4000,5200,6000),
  line("壁",5200,6000,4000,6000),line("壁",4000,6000,4000,4000),
  {kind:"text",layer:"部屋名",text:"倉庫",x:4600,y:5000}
 ];
 const addRect=(layer,x1,y1,x2,y2)=>{
  items.push(line(layer,x1,y1,x2,y1),line(layer,x2,y1,x2,y2),line(layer,x2,y2,x1,y2),line(layer,x1,y2,x1,y1));
 };
 addRect("データ 005",3400,4100,3800,4500);
 addRect("データ 005",3400,4700,3800,5100);
 addRect("データ 005",5400,4100,5800,4500);
 addRect("データ 005",5400,4700,5800,5100);
 const result=extractRoomHierarchy({items,width:11000,height:11000,layers:[{name:"壁"},{name:"データ 005"},{name:"部屋名"}],selectedLayers:["壁"]});
 assert.equal(result.rooms.length,2);
 assert.equal(result.diagnostics.filteredFurnitureIslands,0);
});
