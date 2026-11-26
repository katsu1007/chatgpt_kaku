import test from "node:test";
import assert from "node:assert/strict";
import { renderDwgDimensionGeometry } from "../original/dwg-dimension-render.js";
const stroke='stroke="#222" stroke-width="1"';
const count=(s,re)=>((s.match(re)||[]).length);

test("linear and aligned dimensions render extension lines and inward arrows",()=>{
 for(const type of ["linear","aligned"]){
  const svg=renderDwgDimensionGeometry({dimensionType:type,points:{point13:[0,0],point14:[100,0],point10:[0,20]}},{stroke,color:"#222"});
  assert.equal(count(svg,/<polygon points=/g),2);
  assert.match(svg,/<line/);
 }
});

test("three-point and two-line angular dimensions render arc and arrowheads",()=>{
 const base={point15:[0,0],point13:[50,0],point14:[0,50],point10:[35,35],point16:[35,35]};
 for(const type of ["angular-3pt","angular-2line"]){
  const svg=renderDwgDimensionGeometry({dimensionType:type,points:base},{stroke,color:"#222"});
  assert.match(svg,/<polyline/);
  assert.equal(count(svg,/<polygon points=/g),2);
  assert.ok(count(svg,/<line/g)>=2);
 }
});

test("radius and diameter dimensions render leader geometry with arrowheads",()=>{
 const radius=renderDwgDimensionGeometry({dimensionType:"radius",points:{point10:[0,0],point15:[0,50]}},{stroke,color:"#222"});
 assert.equal(count(radius,/<polygon points=/g),1);
 const diameter=renderDwgDimensionGeometry({dimensionType:"diameter",points:{point10:[100,0],point15:[0,0]}},{stroke,color:"#222"});
 assert.equal(count(diameter,/<polygon points=/g),2);
});

test("ordinate dimensions render feature leaders and a feature arrow",()=>{
 const svg=renderDwgDimensionGeometry({dimensionType:"ordinate",points:{point10:[0,0],point13:[20,30],point14:[80,10]}},{stroke,color:"#222"});
 assert.equal(count(svg,/<line/g),3);
 assert.equal(count(svg,/<polygon points=/g),1);
});

test("malformed or unsupported dimensions produce no invented geometry",()=>{
 assert.equal(renderDwgDimensionGeometry({dimensionType:"radius",points:{}},{stroke,color:"#222"}),"");
 assert.equal(renderDwgDimensionGeometry({dimensionType:"unknown",points:{}},{stroke,color:"#222"}),"");
});
