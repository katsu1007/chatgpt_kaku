import test from "node:test";
import assert from "node:assert/strict";
import { applyAffine2D, createInsertTransform, createMInsertTransforms, multiplyAffine2D, transformBlockGeometry } from "../original/dwg-block-transform.js";
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,a+" != "+b);
test("applies insertion point, base point, rotation and nonuniform scale",()=>{
 const m=createInsertTransform({insertionPoint:{x:100,y:200},scale:{x:2,y:3},rotation:Math.PI/2},{basePoint:{x:10,y:20}});
 const p=applyAffine2D(m,{x:10,y:20});near(p.x,100);near(p.y,200);
 const q=applyAffine2D(m,{x:11,y:20});near(q.x,100);near(q.y,202);
});
test("composes nested block transforms in parent-child order",()=>{
 const parent=[2,0,0,2,10,20],child=[1,0,0,1,5,7],m=multiplyAffine2D(parent,child);
 assert.deepEqual(applyAffine2D(m,{x:1,y:1}),{x:22,y:36});
});
test("creates MINSERT row and column transforms with rotated spacing",()=>{
 const transforms=createMInsertTransforms({insertionPoint:{x:0,y:0},scale:{x:2,y:2},rotation:Math.PI/2,columns:3,rows:2,columnSpacing:10,rowSpacing:5});
 assert.equal(transforms.length,6);
 const p=applyAffine2D(transforms[1],{x:0,y:0});near(p.x,0);near(p.y,20);
 const q=applyAffine2D(transforms[3],{x:0,y:0});near(q.x,-10);near(q.y,0);
});
test("transforms line and polyline geometry while preserving source properties",()=>{
 const line=transformBlockGeometry({kind:"line",pts:[0,0,10,0] },[0,1,-1,0,5,6]);
 assert.deepEqual(line.pts,[5,6,5,16]);
 const poly=transformBlockGeometry({kind:"polyline",vertices:[{x:0,y:0},{x:10,y:0}],bulges:[1,0]},[-1,0,0,1,0,0]);
 assert.deepEqual(poly.bulges,[-1,-0]);assert.deepEqual(poly.vertices,[{x:0,y:0},{x:-10,y:0}]);
});
test("transforms circular arcs with uniform scale and preserves sweep direction",()=>{
 const arc=transformBlockGeometry({kind:"arc",cx:10,cy:0,r:5,a0:0,a1:Math.PI/2},[0,2,-2,0,100,0]);
 near(arc.cx,100);near(arc.cy,20);near(arc.r,10);near(arc.a0,Math.PI/2);near(arc.a1,Math.PI);
 const mirrored=transformBlockGeometry({kind:"arc",cx:0,cy:0,r:1,a0:0,a1:Math.PI/2},[-1,0,0,1,0,0]);
 near(mirrored.a0,Math.PI);near(mirrored.a1,Math.PI/2);
});
test("routes nonuniformly scaled circular geometry to ellipse handling",()=>{
 const arc=transformBlockGeometry({kind:"arc",cx:0,cy:0,r:5,a0:0,a1:1},[2,0,0,1,0,0]);
 assert.equal(arc.kind,"ellipse");assert.equal(arc.requiresTessellation,true);
 const poly=transformBlockGeometry({kind:"polyline",vertices:[{x:0,y:0},{x:10,y:0}],bulges:[1,0]},[2,0,0,1,0,0]);
 assert.equal(poly.kind,"unsupported");
});
test("rejects invalid scale, nonplanar extrusion and excessive MINSERT arrays",()=>{
 assert.throws(()=>createInsertTransform({insertionPoint:{x:0,y:0},scale:{x:0,y:1}}),/zero/);
 assert.throws(()=>createInsertTransform({insertionPoint:{x:0,y:0},extrusion:[1,0,0]}),/Non-planar/);
 assert.throws(()=>createMInsertTransforms({insertionPoint:{x:0,y:0},columns:1000,rows:1000}),/excessive/);
});

test("transforms TEXT and MTEXT positions, orientation and scale inside blocks",()=>{
 const matrix=[0,2,-2,0,100,200];
 const text=transformBlockGeometry({kind:"text",insertion:{x:1,y:0,z:0},alignment:{x:2,y:0,z:0},rotation:0,height:10,widthFactor:1,text:"ROOM"},matrix);
 near(text.insertion.x,100);near(text.insertion.y,202);near(text.alignment.x,100);near(text.alignment.y,204);
 near(text.rotation,Math.PI/2);near(text.height,20);
 const mtext=transformBlockGeometry({kind:"mtext",insertion:{x:1,y:0,z:0},xAxis:{x:1,y:0,z:0},rectWidth:80,height:20,extentsWidth:85,extentsHeight:25,text:"NOTE"},matrix);
 assert.deepEqual(mtext.insertion,[100,202,0]);assert.deepEqual(mtext.xAxis,[0,2,0]);
 near(mtext.rectWidth,160);near(mtext.height,40);near(mtext.extentsWidth,170);
 const unsupported=transformBlockGeometry({kind:"text",insertion:{x:0,y:0},rotation:0,height:10},[2,0,0,1,0,0]);
 assert.equal(unsupported.kind,"unsupported");
});

test("transforms ELLIPSE axes and SPLINE control/fit points in nested blocks",()=>{
 const matrix=[0,2,-2,0,100,200];
 const ellipse=transformBlockGeometry({kind:"ellipse",center:[1,0,0],majorAxis:[2,0,0],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2},matrix);
 assert.deepEqual(ellipse.center,[100,202,0]);assert.deepEqual(ellipse.majorAxis,[0,4,0]);assert.equal(ellipse.axisRatio,0.5);
 const spline=transformBlockGeometry({kind:"spline",controlPoints:[[1,0,0],[2,1,0]],fitPoints:[[0,0,0]],beginTangent:[1,0,0],endTangent:[0,1,0]},matrix);
 assert.deepEqual(spline.controlPoints,[[100,202,0],[98,204,0]]);
 assert.deepEqual(spline.fitPoints,[[100,200,0]]);
 assert.deepEqual(spline.beginTangent,[0,2,0]);assert.deepEqual(spline.endTangent,[-2,0,0]);
});
