import test from "node:test";
import assert from "node:assert/strict";
import { createR2004DwgDrawing } from "../original/dwg-r2004-sheet.js";
const entity=(layerName,layerHandle,geometry,handleHex="A")=>({layerName,layerHandle,geometry,handleHex});
test("maps decoded DWG primitives into KAKU sheet item shapes",()=>{
 const result={entities:[
  entity("A-WALL",200n,{kind:"line",pts:[{x:100,y:200,z:0},{x:300,y:400,z:0}]}),
  entity("A-WALL",200n,{kind:"arc",center:{x:400,y:500,z:0},radius:50,startAngle:0,endAngle:Math.PI}),
  entity("A-FURN",201n,{kind:"circle",center:{x:600,y:700,z:0},radius:20}),
  entity("A-WALL",200n,{kind:"solid",points:[{x:100,y:200},{x:150,y:200},{x:150,y:250},{x:100,y:250}],elevation:0}),
  entity("A-WALL",200n,{kind:"point",point:{x:250,y:300,z:0}})
 ],layers:[{name:"A-WALL",handle:100n,color:{rgb:0xff0000},flags:{on:true,frozen:false}}],diagnostics:{unresolvedLayerCount:0,skippedObjectCount:2}};
 const drawing=createR2004DwgDrawing(result,{fileName:"sample.dwg"}),sheet=drawing.sheets[0];
 assert.equal(drawing.kind,"2d");assert.equal(sheet.items.length,5);
 assert.deepEqual(sheet.origin,{x:100,y:200});assert.equal(sheet.size.w,520);assert.equal(sheet.size.h,520);
 assert.deepEqual(sheet.items[0].pts,[0,0,200,200]);assert.equal(sheet.items[1].cx,300);
 assert.equal(sheet.items[2].isCircle,true);assert.equal(sheet.items[2].layer,"A-FURN");
 assert.equal(sheet.items[3].kind,"fill");assert.equal(sheet.items[4].kind,"point");
 assert.equal(drawing.meta.units,"unknown");assert.equal(drawing.layers[0].color,"#ff0000");
 assert.ok(drawing.meta.warnings.some(x=>x.includes("INSUNITS")));
});
test("retains unresolved layer handles and reports unsupported objects",()=>{
 const drawing=createR2004DwgDrawing({entities:[
  entity(null,999n,{kind:"line",pts:[{x:0,y:0,z:0},{x:1,y:1,z:0}]}),
  entity("A",1n,{kind:"unsupported"})
 ],layers:[],diagnostics:{unresolvedLayerCount:1}});
 assert.equal(drawing.sheets[0].items.length,1);assert.equal(drawing.sheets[0].items[0].layer,"DWG:UNRESOLVED:999");
 assert.equal(drawing.meta.info.unsupported,1);assert.ok(drawing.layers[0].unresolved);
});
test("rejects drawings with no supported geometry",()=>{
 assert.throws(()=>createR2004DwgDrawing({entities:[],layers:[]}),/表示可能/);
});

test("converts native drawing units to millimeters when INSUNITS is known",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:1,name:"inches",scaleToMm:25.4},entities:[
  entity("A-WALL",200n,{kind:"line",pts:[{x:10,y:20,z:0},{x:20,y:30,z:0}]})
 ],layers:[]});
 const sheet=drawing.sheets[0];
 assert.equal(drawing.meta.units,"mm");assert.equal(drawing.meta.coordinateSpace,"sheet-mm");
 assert.deepEqual(sheet.origin,{x:254,y:508});assert.deepEqual(sheet.items[0].pts,[0,0,254,254]);
 assert.equal(sheet.size.w,254);assert.equal(sheet.size.h,254);
 assert.equal(sheet.nativeOrigin.x,10);assert.equal(sheet.nativeOrigin.y,20);
});

test("maps a bulged DWG polyline into one circular arc without flattening it",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-WALL",200n,{kind:"polyline",closed:false,vertices:[{x:0,y:0,bulge:Math.tan(Math.PI/8)},{x:100,y:0,bulge:0}]})
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,1);assert.equal(items[0].kind,"arc");assert.ok(Math.abs(items[0].r-100/Math.sqrt(2))<1e-9);assert.ok(Math.abs(items[0].a1-items[0].a0-Math.PI/2)<1e-9);
 assert.equal(items[0].sourceGeometry.kind,"polyline");
});

test("expands LWPOLYLINE bulges into native line and arc segments",()=>{
 const drawing=createR2004DwgDrawing({entities:[entity("A-WALL",200n,{kind:"polyline",closed:true,vertices:[
  {x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:10,z:0}
 ],bulges:[1,0,0],extrusion:[0,0,1]})],layers:[]});
 const sheet=drawing.sheets[0];
 assert.equal(sheet.items.length,3);assert.equal(sheet.items[0].kind,"arc");
 assert.equal(sheet.items[0].cx,5);assert.equal(sheet.items[0].cy,5);assert.equal(sheet.items[0].r,5);
 assert.equal(sheet.items[0].a1-sheet.items[0].a0,Math.PI);
 assert.equal(sheet.items[1].kind,"line");assert.equal(sheet.items[2].kind,"line");
 assert.equal(drawing.meta.info.polylines,1);assert.equal(drawing.meta.info.unsupported,0);
});
test("does not guess geometry for tilted LWPOLYLINE extrusion planes",()=>{
 assert.throws(()=>createR2004DwgDrawing({entities:[entity("A",1n,{kind:"polyline",closed:true,vertices:[
  {x:0,y:0,z:0},{x:10,y:0,z:0}
 ],bulges:[0,0],extrusion:[1,0,0]})],layers:[]}),/表示可能/);
});

test("renders transformed block line, arc and point primitives with source references",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  {...entity("A-WALL",200n,{kind:"line",pts:[100,200,150,200]}, "B1"),blockPath:["DOOR"],sourceInsertHandle:10n,sourceEntityHandle:20n},
  {...entity("A-FURN",201n,{kind:"arc",cx:150,cy:250,r:10,a0:0,a1:Math.PI}),blockPath:["CHAIR"],sourceInsertHandle:11n},
  {...entity("A-FURN",201n,{kind:"point",x:180,y:220,z:0}),blockPath:["CHAIR"],sourceInsertHandle:11n}
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.deepEqual(items[0].pts,[0,0,50,0]);
 assert.equal(items[0].sourceInsertHandle,"10");assert.equal(items[0].sourceEntityHandle,"20");
 assert.deepEqual(items[0].blockPath,["DOOR"]);
 assert.equal(items[1].kind,"arc");assert.equal(items[1].cx,50);assert.equal(items[1].cy,50);
 assert.equal(items[2].kind,"point");assert.equal(items[2].x,80);assert.equal(items[2].y,20);
});

test("maps HATCH polyline and arc boundaries without losing hatch metadata",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-HATCH",220n,{kind:"hatch",name:"SOLID",solidFill:true,patternType:1,elevation:0,paths:[
   {kind:"polyline",flags:2,closed:true,vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],bulges:[0,0,0,0]},
   {kind:"edges",flags:1,edges:[{kind:"line",start:{x:200,y:0},end:{x:250,y:0}},{kind:"arc",center:{x:250,y:25},radius:25,startAngle:0,endAngle:Math.PI,counterClockwise:true}]}
  ]},"C1")
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,6);
 assert.ok(items.every(item=>item.hatchBoundary===true));
 assert.equal(items[0].hatchName,"SOLID");assert.equal(items[0].hatchPathIndex,0);
 assert.equal(items[5].kind,"arc");assert.equal(items[5].r,25);
 assert.equal(drawing.meta.info.hatches,1);
 assert.ok(drawing.meta.warnings.some(w=>w.includes("HATCH")));
});

test("preserves TEXT and MTEXT content and placement in sheet items",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-TEXT",230n,{kind:"text",insertion:{x:100,y:200,z:0},alignment:{x:100,y:200,z:0},text:"ROOM A",rotation:Math.PI/4,height:15,widthFactor:1}),
  entity("A-TEXT",230n,{kind:"mtext",insertion:[300,400,0],xAxis:[0,1,0],text:"CONFERENCE",height:20,rectWidth:160,attachment:1,drawingDirection:1})
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,2);assert.equal(items[0].kind,"text");assert.equal(items[0].text,"ROOM A");
 assert.deepEqual([items[0].x,items[0].y],[0,0]);assert.equal(items[0].height,15);
 assert.equal(items[1].mtext,true);assert.equal(items[1].text,"CONFERENCE");assert.equal(items[1].rotation,Math.PI/2);
 assert.equal(items[1].width,160);assert.equal(drawing.meta.info.textEntities,2);
});

test("preserves dimension measurement, annotation text and referenced block handles",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  {...entity("A-DIM",240n,{kind:"dimension",dimensionName:"linear",textMidpoint:[50,25],userText:"L=<> mm",actualMeasurement:100,textRotation:0,flags1:0,point10:[0,20,0],point13:[0,0,0],point14:[100,0,0]},
   "D1"),dimensionHandles:{dimStyle:{value:300n},anonymousBlock:{value:400n}}}
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,2);assert.equal(items[0].kind,"dimension");assert.equal(items[0].dimensionType,"linear");
 assert.equal(items[0].dimensionHandles.dimStyle,"300");assert.equal(items[0].dimensionHandles.anonymousBlock,"400");
 assert.equal(items[1].kind,"text");assert.equal(items[1].text,"L=100 mm");assert.equal(items[1].dimensionText,true);
 assert.equal(drawing.meta.info.dimensionEntities,1);
});

test("maps ATTRIB values into tagged text sheet items",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-ANNO",250n,{kind:"attrib",insertion:{x:100,y:200,z:0},alignment:{x:100,y:200,z:0},text:"ROOM A",tag:"ROOM_NAME",rotation:0,height:12,widthFactor:1,attributeFlags:0})
 ],layers:[]});
 const item=drawing.sheets[0].items[0];
 assert.equal(item.kind,"text");assert.equal(item.text,"ROOM A");assert.equal(item.attribute,true);assert.equal(item.attributeTag,"ROOM_NAME");
 assert.equal(drawing.meta.info.attributeEntities,1);
});

test("approximates ELLIPSE and SPLINE as source-linked line segments",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-CURVE",260n,{kind:"ellipse",center:[100,200,0],majorAxis:[50,0,0],extrusion:[0,0,1],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2}),
  entity("A-CURVE",261n,{kind:"spline",scenario:1,degree:2,closed:false,knots:[0,0,0,1,1,1],controlPoints:[[0,0,0],[50,100,0],[100,0,0]],weightsPresent:false,weights:[]})
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.ok(items.length>50);assert.ok(items.every(item=>item.kind==="line"));
 assert.ok(items.some(item=>item.curveApproximation==="ellipse"));
 assert.ok(items.some(item=>item.curveApproximation==="spline"));
 assert.equal(drawing.meta.info.ellipseEntities,1);assert.equal(drawing.meta.info.splineEntities,1);
 assert.equal(drawing.meta.info.curveSegments,items.length);
 assert.ok(drawing.meta.warnings.some(w=>w.includes("線分近似")));
});

test("renders MLINESTYLE-derived parallel wall boundary lines",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-WALL",270n,{kind:"mline",closed:false,mlineStyleName:"WALL",boundaries:[
   {elementIndex:0,offset:-50,vertices:[{x:0,y:-50,z:0},{x:1000,y:-50,z:0}]},
   {elementIndex:1,offset:50,vertices:[{x:0,y:50,z:0},{x:1000,y:50,z:0}]}
  ]})
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,2);assert.ok(items.every(x=>x.kind==="line"&&x.mlineBoundary));
 assert.equal(items[0].mlineStyleName,"WALL");assert.equal(items[0].mlineOffset,-50);
 assert.equal(items[1].mlineOffset,50);assert.equal(drawing.meta.info.mlineEntities,1);
 assert.equal(drawing.meta.info.mlineBoundarySegments,2);
});

test("exposes only closed straight external solid HATCH paths as wall-fill candidates",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-WALL",280n,{kind:"hatch",name:"SOLID",solidFill:true,elevation:0,paths:[
   {kind:"polyline",flags:3,closed:true,vertices:[{x:0,y:0},{x:1000,y:0},{x:1000,y:100},{x:0,y:100}],bulges:[0,0,0,0]},
   {kind:"polyline",flags:2,closed:true,vertices:[{x:200,y:200},{x:300,y:200},{x:300,y:300},{x:200,y:300}],bulges:[0,0,0,0]},
   {kind:"polyline",flags:3,closed:true,vertices:[{x:400,y:400},{x:500,y:400},{x:500,y:500},{x:400,y:500}],bulges:[0,0.5,0,0]}
  ]},"H1")
 ],layers:[]});
 const items=drawing.sheets[0].items,fill=items.filter(item=>item.kind==="fill");
 assert.equal(fill.length,1);assert.equal(fill[0].hatchFillCandidate,true);
 assert.equal(fill[0].hatchPathFlags,3);assert.deepEqual(fill[0].pts,[0,0,1000,0,1000,100,0,100]);
 assert.equal(drawing.meta.info.hatchFillCandidates,1);
 assert.ok(drawing.meta.warnings.some(w=>w.includes("細長さを判定")));
});

test("DWG capability warning reflects decoded entity families without claiming full rendering",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-WALL",290n,{kind:"line",pts:[{x:0,y:0,z:0},{x:100,y:0,z:0}]})
 ],layers:[]});
 const warning=drawing.meta.warnings.join(" ");
 assert.match(warning,/旧式POLYLINE\/VERTEX/);
 assert.match(warning,/DIMENSION計測情報/);
 assert.match(warning,/HATCH境界/);
 assert.doesNotMatch(warning,/寸法・文字・HATCH等は未対応/);
});

test("approximates HATCH ellipse and spline edges as source-linked boundary segments",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-HATCH",310n,{kind:"hatch",name:"CURVES",solidFill:false,elevation:0,paths:[
   {kind:"edges",flags:1,edges:[
    {kind:"ellipse",center:{x:0,y:0},majorAxis:{x:50,y:0},minorMajorRatio:0.5,startAngle:0,endAngle:Math.PI*2,counterClockwise:true},
    {kind:"spline",degree:2,rational:false,periodic:false,knots:[0,0,0,1,1,1],
     controlPoints:[{x:100,y:0},{x:150,y:100},{x:200,y:0}]}
   ]}
  ]},"HATCH-CURVES")
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.ok(items.length>100);
 assert.ok(items.every(item=>item.kind==="line"&&item.hatchBoundary===true));
 assert.ok(items.some(item=>item.hatchCurveApproximation==="ellipse"));
 assert.ok(items.some(item=>item.hatchCurveApproximation==="spline"));
 assert.equal(drawing.meta.info.hatches,1);
 assert.equal(drawing.meta.info.hatchBoundarySegments,items.length);
 assert.ok(!drawing.meta.warnings.some(w=>w.includes("未描画のHATCH")));
});
test("reports malformed HATCH spline boundaries without aborting the drawing",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-HATCH",311n,{kind:"hatch",name:"BAD-CURVE",solidFill:false,elevation:0,paths:[
   {kind:"edges",flags:1,edges:[
    {kind:"line",start:{x:0,y:0},end:{x:100,y:0}},
    {kind:"spline",degree:3,rational:false,knots:[0,1],controlPoints:[{x:0,y:0},{x:1,y:1}]}
   ]}
  ]},"HATCH-BAD")
 ],layers:[]});
 assert.equal(drawing.sheets[0].items.length,1);
 assert.ok(drawing.meta.warnings.some(w=>w.includes("近似描画できないHATCH曲線境界：1件")));
});
