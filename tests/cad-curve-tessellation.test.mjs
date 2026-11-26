import test from "node:test";
import assert from "node:assert/strict";
import { tessellateBulgedPolyline, tessellateEllipse, tessellateSpline, tessellateCadCurve } from "../original/cad-curve-tessellation.js";

test("bulged polylines produce curved points and preserve closed boundary",()=>{
 const r=tessellateBulgedPolyline({kind:"polyline",pts:[1,0,0,1],bulges:[Math.tan(Math.PI/8),0]});
 assert.ok(r.points.length>3);
 const mid=r.points[Math.floor(r.points.length/2)];
 assert.ok(Math.abs(mid[0]-Math.SQRT1_2)<0.02);
 assert.ok(Math.abs(mid[1]-Math.SQRT1_2)<0.02);
 const closed=tessellateBulgedPolyline({pts:[0,0,100,0,100,100],bulges:[0.25,0,0],closed:true});
 assert.equal(closed.closed,true);
 assert.ok(closed.points.length>4);
});

test("ellipse tessellation respects major axis ratio and closes full ellipses",()=>{
 const r=tessellateEllipse({center:[10,20,0],majorAxis:[100,0,0],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2});
 assert.equal(r.closed,true);
 assert.ok(r.points.length>=70);
 const xs=r.points.map(p=>p[0]),ys=r.points.map(p=>p[1]);
 assert.ok(Math.abs(Math.max(...xs)-110)<1e-6);
 assert.ok(Math.abs(Math.min(...xs)+90)<1e-6);
 assert.ok(Math.abs(Math.max(...ys)-70)<1e-6);
 assert.ok(Math.abs(Math.min(...ys)+30)<1e-6);
});

test("rational quadratic spline evaluates a quarter-circle control polygon",()=>{
 const r=tessellateSpline({degree:2,knots:[0,0,0,1,1,1],controlPoints:[[1,0,0],[1,1,0],[0,1,0]],weightsPresent:true,weights:[1,Math.SQRT1_2,1]});
 assert.ok(r.points.length>=25);
 assert.deepEqual(r.points[0],[1,0]);
 assert.deepEqual(r.points.at(-1),[0,1]);
 const mid=r.points[Math.floor(r.points.length/2)];
 assert.ok(Math.abs(mid[0]-Math.SQRT1_2)<0.002);
 assert.ok(Math.abs(mid[1]-Math.SQRT1_2)<0.002);
});

test("fit-point spline fallback produces a bounded Catmull-Rom approximation",()=>{
 const r=tessellateSpline({scenario:2,fitPoints:[[0,0,0],[10,0,0],[10,10,0],[20,10,0]]});
 assert.ok(r.points.length>=37);
 assert.deepEqual(r.points[0],[0,0]);
 assert.deepEqual(r.points.at(-1),[20,10]);
 assert.equal(r.diagnostics.fitPointApproximation,"catmull-rom");
});

test("curve tessellation rejects malformed spline data without throwing",()=>{
 assert.equal(tessellateCadCurve({kind:"spline",degree:9,controlPoints:[],knots:[]}).points.length,0);
});
