import test from "node:test";
import assert from "node:assert/strict";
import { decodeR2004Geometry } from "../original/dwg-r2004-geometry.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const byteBits=a=>a.flatMap(v=>bits(v));
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return byteBits([...b]);};
const bd=v=>v===0?[1,0]:v===1?[0,1]:[0,0,...raw(v)];
const dd=(base,v)=>Object.is(base,v)?[0,0]:[1,1,...raw(v)];
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
test("decodes R2004 LINE with zero Z and defaulted endpoint coordinates",()=>{
 const input=pack([1,...raw(100.5),...dd(100.5,110.5),...raw(200.25),...dd(200.25,210.75),1,1]);
 const r=decodeR2004Geometry(19,input);
 assert.deepEqual(r.pts,[{x:100.5,y:200.25,z:0},{x:110.5,y:210.75,z:0}]);
 assert.equal(r.thickness,0);assert.deepEqual(r.extrusion,[0,0,1]);
});
test("decodes R2004 LINE with explicit Z, thickness and extrusion",()=>{
 const input=pack([0,...raw(10),...dd(10,12),...raw(20),...dd(20,24),...raw(30),...dd(30,35),0,...bd(2),0,...bd(0),...bd(0),...bd(1)]);
 const r=decodeR2004Geometry(19,input);
 assert.deepEqual(r.pts,[{x:10,y:20,z:30},{x:12,y:24,z:35}]);assert.equal(r.thickness,2);assert.deepEqual(r.extrusion,[0,0,1]);
});
test("decodes ARC and CIRCLE center, radius and angle fields",()=>{
 const arc=decodeR2004Geometry(17,pack([...bd(10),...bd(20),...bd(0),...bd(5.5),1,1,...bd(0),...bd(Math.PI/2)]));
 assert.deepEqual(arc.center,{x:10,y:20,z:0});assert.equal(arc.radius,5.5);assert.equal(arc.startAngle,0);assert.equal(arc.endAngle,Math.PI/2);
 const circle=decodeR2004Geometry(18,pack([...bd(1),...bd(2),...bd(0),...bd(3),1,1]));
 assert.deepEqual(circle.center,{x:1,y:2,z:0});assert.equal(circle.radius,3);
});
test("decodes POINT and SOLID geometry",()=>{
 const point=decodeR2004Geometry(27,pack([...bd(1),...bd(2),...bd(3),1,1,...bd(0)]));
 assert.deepEqual(point.point,{x:1,y:2,z:3});
 const solid=decodeR2004Geometry(31,pack([1,...bd(0),...raw(0),...raw(0),...raw(10),...raw(0),...raw(10),...raw(10),...raw(0),...raw(10),1]));
 assert.equal(solid.points.length,4);assert.equal(solid.points[2].x,10);assert.equal(solid.elevation,0);
});
test("unknown entity types are preserved as unsupported",()=>{
 assert.deepEqual(decodeR2004Geometry(999,new Uint8Array([0])),{kind:"unsupported",typeCode:999,bitOffset:0});
});

test("decodes closed R2004 LWPOLYLINE with vertices and bulges",()=>{
 const input=pack([0,1,...bits(1),...bd(0),...bd(0),...bd(0),1,
  0,1,...bits(3),...raw(0),...raw(0),...raw(10),...raw(0),...raw(10),...raw(10),
  0,1,...bits(3),...bd(1),...bd(0),...bd(0),
  1,0,1,0]);
 const r=decodeR2004Geometry(77,input);
 assert.equal(r.kind,"polyline");assert.equal(r.closed,true);assert.equal(r.vertices.length,3);
 assert.deepEqual(r.vertices,[{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:10,z:0}]);
 assert.deepEqual(r.bulges,[1,0,0]);assert.equal(r.constantWidth,0);
});

test("decodes INSERT and MINSERT insertion transforms",()=>{
 const insert=pack([...bd(10),...bd(20),...bd(0),1,1,...bd(0),1,0,1,0]);
 const a=decodeR2004Geometry(7,insert);
 assert.equal(a.kind,"insert");assert.deepEqual(a.insertionPoint,[10,20,0]);assert.deepEqual(a.scale,{x:1,y:1,z:1,flag:3});
 const minsert=pack([...bd(1),...bd(2),...bd(0),1,1,...bd(0),1,0,1,0,0,1,...bits(3),0,1,...bits(2),...bd(5),...bd(6)]);
 const b=decodeR2004Geometry(8,minsert);
 assert.equal(b.kind,"minsert");assert.equal(b.columns,3);assert.equal(b.rows,2);
 assert.equal(b.columnSpacing,5);assert.equal(b.rowSpacing,6);
});
test("decodes compact INSERT scale flags",()=>{
 const input=pack([...bd(0),...bd(0),...bd(0),0,1,...dd(1,2),...dd(1,3),...bd(0),1,0,1,0]);
 const r=decodeR2004Geometry(7,input);
 assert.deepEqual(r.scale,{x:1,y:2,z:3,flag:1});
});
