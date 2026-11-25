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

test("maps decoded LWPOLYLINE geometry to KAKU arcs and lines",()=>{
 const drawing=createR2004DwgDrawing({units:{known:true,code:4,name:"millimeters",scaleToMm:1},entities:[
  entity("A-WALL",200n,{kind:"polyline",closed:true,extrusion:[0,0,1],vertices:[{x:0,y:0,z:0},{x:100,y:0,z:0},{x:100,y:100,z:0}],bulges:[Math.tan(Math.PI/8),0,0]})
 ],layers:[]});
 const items=drawing.sheets[0].items;
 assert.equal(items.length,3);assert.equal(items[0].kind,"arc");assert.equal(items[1].kind,"line");assert.equal(items[2].kind,"line");
 assert.ok(Math.abs(items[0].a1-items[0].a0-Math.PI/2)<1e-9);
 assert.equal(drawing.meta.info.polylines,1);assert.equal(drawing.meta.info.unsupported,0);
});
test("does not flatten a tilted LWPOLYLINE extrusion into the XY floor plan",()=>{
 const drawingInput={entities:[entity("A",1n,{kind:"polyline",closed:false,extrusion:[1,0,0],vertices:[{x:0,y:0},{x:10,y:0}],bulges:[0,0]})],layers:[]};
 assert.throws(()=>createR2004DwgDrawing(drawingInput),/表示可能/);
});
