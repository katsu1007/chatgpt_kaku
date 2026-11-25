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

const bl=v=>v===0?[1,0]:v<256?[0,1,...bits(v)]:[0,0,...byteBits([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])];
const bs=v=>v===0?[1,0]:v===256?[1,1]:v<256?[0,1,...bits(v)]:[0,0,...byteBits([v&255,(v>>>8)&255])];
const tv=v=>[...bs(v.length),...byteBits([...v].map(c=>c.charCodeAt(0)))];
const rd2=(x,y)=>[...raw(x),...raw(y)];
test("decodes a closed solid R2004 HATCH polyline boundary",()=>{
 const input=pack([
  ...bl(0),...bl(0),...bd(0),...bd(0),...bl(0),...bd(0),...bl(0),...tv(""),
  ...bd(0),...bd(0),...bd(0),...bd(1),...tv("SOLID"),1,0,...bl(1),
  ...bl(2),0,1,...bl(4),
  ...rd2(0,0),...rd2(100,0),...rd2(100,50),...rd2(0,50),...bl(0),
  ...bs(0),...bs(1),...bl(0)
 ]);
 const r=decodeR2004Geometry(78,input);
 assert.equal(r.kind,"hatch");assert.equal(r.solidFill,true);assert.equal(r.name,"SOLID");
 assert.equal(r.paths.length,1);assert.equal(r.paths[0].kind,"polyline");assert.equal(r.paths[0].closed,true);
 assert.deepEqual(r.paths[0].vertices,[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}]);
 assert.equal(r.boundaryObjectCount,0);assert.equal(r.seedPoints.length,0);
});
test("decodes a HATCH edge loop with a circular arc and boundary references",()=>{
 const input=pack([
  ...bl(0),...bl(0),...bd(0),...bd(0),...bl(0),...bd(0),...bl(0),...tv(""),
  ...bd(0),...bd(0),...bd(0),...bd(1),...tv("PATTERN"),0,1,...bl(1),
  ...bl(1),...bl(2),
  ...bits(1),...rd2(0,0),...rd2(100,0),
  ...bits(2),...rd2(100,50),...bd(50),...bd(0),...bd(Math.PI),1,
  ...bl(2),...bs(0),...bs(0),...bd(0),...bd(1),0,...bs(0),...bl(0),...bl(0)
 ]);
 const r=decodeR2004Geometry(78,input);
 assert.equal(r.solidFill,false);assert.equal(r.paths[0].edges[1].kind,"arc");
 assert.equal(r.paths[0].boundaryObjectCount,2);assert.equal(r.boundaryObjectCount,2);
 assert.equal(r.pattern.lines.length,0);
});
test("rejects excessive HATCH path counts and unknown edge types",()=>{
 const head=[...bl(0),...bl(0),...bd(0),...bd(0),...bl(0),...bd(0),...bl(0),...tv(""),...bd(0),...bd(0),...bd(0),...bd(1),...tv("H"),1,0];
 assert.throws(()=>decodeR2004Geometry(78,pack([...head,...bl(20000)])),/path count/);
 const bad=pack([...head,...bl(1),...bl(0),...bl(1),99,...bl(0),...bs(0),...bs(0),...bl(0)]);
 assert.throws(()=>decodeR2004Geometry(78,bad),/edge type/);
});
