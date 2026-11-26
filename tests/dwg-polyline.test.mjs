import test from "node:test";
import assert from "node:assert/strict";
import { expandBulgedPolyline, polylineToSheetItems, bulgeToSweep } from "../original/dwg-polyline.js";
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e, a+" != "+b);
test("expands straight open polyline segments without changing vertices",()=>{
 const r=expandBulgedPolyline([[0,0],[100,0],[100,50]]);
 assert.equal(r.segments.length,2);assert.equal(r.diagnostics.lineCount,2);assert.equal(r.diagnostics.arcCount,0);
 assert.deepEqual(r.segments[0].a,{x:0,y:0,z:0});assert.deepEqual(r.segments[1].b,{x:100,y:50,z:0});
});
test("decodes positive and negative bulges as signed circular arcs",()=>{
 const ccw=expandBulgedPolyline([[1,0],[0,1]],{bulges:[Math.tan(Math.PI/8),0]});
 const cw=expandBulgedPolyline([[1,0],[0,1]],{bulges:[-Math.tan(Math.PI/8),0]});
 assert.equal(ccw.segments[0].kind,"arc");near(ccw.segments[0].sweep,Math.PI/2);near(ccw.segments[0].cx,0);near(ccw.segments[0].cy,0);near(ccw.segments[0].r,1);
 near(cw.segments[0].sweep,-Math.PI/2);near(cw.segments[0].r,1);
});
test("supports semicircles and major arcs",()=>{
 const half=expandBulgedPolyline([[0,0],[100,0]],{bulges:[1,0]});
 near(half.segments[0].sweep,Math.PI);near(half.segments[0].r,50);near(half.segments[0].cx,50);near(half.segments[0].cy,0);
 const major=expandBulgedPolyline([[0,0],[100,0]],{bulges:[Math.tan(3*Math.PI/8),0]});
 near(major.segments[0].sweep,3*Math.PI/2);
});
test("closes polyline with final bulge and preserves per-vertex elevation",()=>{
 const r=expandBulgedPolyline({closed:true,vertices:[{x:0,y:0,z:2,bulge:0},{x:100,y:0,z:2,bulge:0},{x:100,y:100,z:2,bulge:Math.tan(Math.PI/8)}]});
 assert.equal(r.segments.length,3);assert.equal(r.segments[2].kind,"arc");assert.equal(r.closed,true);
 assert.equal(r.vertices[0].z,2);
});
test("maps polyline segments into KAKU line and arc items",()=>{
 const items=polylineToSheetItems({vertices:[{x:0,y:0,bulge:Math.tan(Math.PI/8)},{x:100,y:0}],closed:false},{layer:"A-WALL",handle:"AB"});
 assert.equal(items.length,1);assert.equal(items[0].kind,"arc");assert.equal(items[0].layer,"A-WALL");assert.equal(items[0].handle,"AB");
 assert.equal(items[0].sourceFormat,"DWG");
});
test("rejects malformed vertex, bulge count, non-finite and oversized inputs",()=>{
 assert.throws(()=>expandBulgedPolyline([[0,0]]),/at least two/);
 assert.throws(()=>expandBulgedPolyline([[0,0],[1,1]],{bulges:[0]}),/count/);
 assert.throws(()=>expandBulgedPolyline([[0,0],[1,1]],{bulges:[Infinity,0]}),/bulge/);
 assert.throws(()=>expandBulgedPolyline([[0,0],[1,1]],{maxSegments:1}),/limit/);
});
test("bulge conversion is stable around zero",()=>{
 near(bulgeToSweep(0),0);near(bulgeToSweep(1),Math.PI);near(bulgeToSweep(-1),-Math.PI);
});

test("preserves constant and per-vertex widths on each expanded segment",()=>{
 const constant=polylineToSheetItems({vertices:[[0,0],[100,0],[100,100]],constantWidth:12});
 assert.equal(constant.length,2);assert.deepEqual(constant.map(x=>[x.widthStart,x.widthEnd,x.widthSource]),[[12,12,"constant"],[12,12,"constant"]]);
 const variable=polylineToSheetItems({vertices:[
  {x:0,y:0,startWidth:4,endWidth:6},{x:100,y:0,startWidth:8,endWidth:10},{x:100,y:100,startWidth:3,endWidth:5}
 ]});
 assert.deepEqual(variable.map(x=>[x.widthStart,x.widthEnd,x.widthSource]),[[4,10,"vertex"],[8,5,"vertex"]]);
});
test("does not invent width metadata for zero-width or missing-width polylines",()=>{
 const items=polylineToSheetItems({vertices:[[0,0],[100,0]],constantWidth:0});
 assert.equal("widthStart" in items[0],false);
});
