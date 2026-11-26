import test from "node:test";
import assert from "node:assert/strict";
import { ocsBasis, transformOcsPoint, transformOcsVector, isWorldZNormal, isValidOcsNormal, tessellateOcsArc, tessellateOcsPolyline } from "../original/dwg-ocs.js";

test("default OCS basis is identity and world-Z normal is recognized",()=>{
 const b=ocsBasis([0,0,1]);
 assert.deepEqual(b,{x:[1,0,0],y:[0,1,0],z:[0,0,1]});
 assert.deepEqual(transformOcsPoint([10,20,30],[0,0,1]),[10,20,30]);
 assert.equal(isWorldZNormal([0,0,1]),true);
 assert.equal(isWorldZNormal([0,0,-1]),false);
});

test("arbitrary-axis OCS basis maps a tilted plane orthonormally into WCS",()=>{
 const n=[0,Math.SQRT1_2,Math.SQRT1_2],b=ocsBasis(n);
 const x=transformOcsVector([1,0,0],n),y=transformOcsVector([0,1,0],n),z=transformOcsVector([0,0,1],n);
 const dot=(a,c)=>a.reduce((sum,v,i)=>sum+v*c[i],0);
 assert.ok(Math.abs(dot(x,y))<1e-9);assert.ok(Math.abs(dot(x,z))<1e-9);assert.ok(Math.abs(dot(y,z))<1e-9);
 assert.ok(Math.abs(Math.hypot(...x)-1)<1e-9);assert.deepEqual(z,b.z);
 assert.deepEqual(x,[-1,0,0]);
});

test("tilted OCS arcs and circles are tessellated into WCS points",()=>{
 const normal=[0,Math.SQRT1_2,Math.SQRT1_2];
 const arc=tessellateOcsArc({center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI/2,normal});
 const circle=tessellateOcsArc({center:[0,0,0],radius:10,normal,circle:true});
 assert.equal(arc.closed,false);assert.ok(arc.points.length>=10);
 assert.equal(circle.closed,true);assert.ok(circle.points.length>=70);
 assert.ok(circle.points.some(p=>Math.abs(p[2])>1));
});

test("tilted OCS bulged polylines preserve curved geometry after transform",()=>{
 const r=tessellateOcsPolyline({vertices:[{x:0,y:0,z:5},{x:100,y:0,z:5}],bulges:[Math.tan(Math.PI/8),0],extrusion:[0,Math.SQRT1_2,Math.SQRT1_2]});
 assert.ok(r.points.length>3);
 assert.equal(r.diagnostics.ocsTransformed,true);
 assert.ok(r.points.some(p=>Math.abs(p[2])>0));
});

test("invalid extrusion normals are rejected safely",()=>{
 assert.equal(isValidOcsNormal([0,0,0]),false);
 assert.deepEqual(tessellateOcsArc({center:[0,0,0],radius:1,normal:[0,0,0]}).points,[]);
 assert.deepEqual(tessellateOcsPolyline({vertices:[[0,0],[1,0]],extrusion:[0,0,0]}).points,[]);
});
