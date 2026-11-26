import test from "node:test";
import assert from "node:assert/strict";
import { prepareNativeDwgSheet, renderNativeDwgSvg } from "../original/dwg-native-render.js";
test("renders native DWG line, fill, arc, point and text primitives as SVG",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:1000,h:500},items:[
  {kind:"line",layer:"WALL",pts:[0,0,100,100]},
  {kind:"fill",layer:"WALL",pts:[100,100,200,100,200,200,100,200]},
  {kind:"arc",layer:"WALL",cx:300,cy:200,r:50,a0:0,a1:Math.PI},
  {kind:"point",layer:"FIXTURE",x:400,y:300},
  {kind:"text",layer:"TEXT",x:500,y:250,text:"会議室 <A>",height:12,rotation:0},
  {kind:"dimension",layer:"DIM",x:600,y:200,actualMeasurement:1200}
 ]},[
  {name:"WALL",color:"#ff0000"},{name:"FIXTURE",color:"#00aa00"},{name:"TEXT",color:"#0000ff"},{name:"DIM",color:"#333333"}
 ]);
 const svg=renderNativeDwgSvg(prepared);
 assert.match(svg,/<svg/);assert.match(svg,/<polyline/);assert.match(svg,/<polygon/);
 assert.match(svg,/<circle/);assert.match(svg,/会議室 &lt;A&gt;/);assert.match(svg,/1200/);
 assert.match(svg,/translate\(0 500\) scale\(1 -1\)/);
});
test("respects hidden layers in the native DWG renderer",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:100,h:100},items:[
  {kind:"line",layer:"WALL",pts:[0,0,100,100]},
  {kind:"line",layer:"TEXT",pts:[0,100,100,0]}
 ]},[{name:"WALL",color:"#f00"},{name:"TEXT",color:"#00f"}]);
 const svg=renderNativeDwgSvg(prepared,Uint8Array.from([0,1]));
 assert.match(svg,/stroke="#f00"/);assert.doesNotMatch(svg,/stroke="#00f"/);
});

test("normalizes common AutoCAD MTEXT controls without losing separate lines",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:300,h:120},items:[
  {kind:"text",layer:"NOTES",x:10,y:80,text:"1\\P2\\S1#2;\\U+03A9 %%d %%p %%c",height:10,rotation:0},
  {kind:"text",layer:"NOTES",x:10,y:40,text:"A <B> & C",height:10,rotation:0}
 ]},[{name:"NOTES",color:"#111111"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.ok(svg.includes('<tspan x="0" dy="0">1</tspan>'));
 assert.ok(svg.includes('<tspan x="0" dy="12.5">21/2Ω ° ± Ø</tspan>'));
 assert.match(svg,/1\/2/);
 assert.match(svg,/Ω ° ± Ø/);
 assert.match(svg,/A &lt;B&gt; &amp; C/);
});
test("renders native linear dimension extension and dimension lines",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:200,h:120},items:[
  {kind:"dimension",layer:"DIM",dimensionType:"linear",actualMeasurement:100,x:50,y:35,
   points:{point13:[10,10,0],point14:[110,10,0],point10:[10,35,0]}}
 ]},[{name:"DIM",color:"#222222"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.match(svg,/<line x1="10" y1="10" x2="10" y2="37"/);
 assert.match(svg,/<line x1="110" y1="10" x2="110" y2="37"/);
 assert.match(svg,/<line x1="10" y1="35" x2="110" y2="35"/);
 assert.match(svg,/>100<\/text>/);
});


test("closed native DWG polylines render as closed outlines",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:100,h:100},items:[{kind:"line",closed:true,pts:[0,0,100,0,100,100,0,100]}]},[{name:"0",color:"#222"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.match(svg,/<polygon points="0,0 100,0 100,100 0,100" fill="none"/);
});

test("renders native DWG ellipse and rational spline as curve outlines",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:200,h:120},items:[
  {kind:"ellipse",layer:"CURVES",center:[50,50,0],majorAxis:[30,0,0],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2},
  {kind:"spline",layer:"CURVES",degree:2,knots:[0,0,0,1,1,1],controlPoints:[[100,10,0],[130,100,0],[160,10,0]]}
 ]},[{name:"CURVES",color:"#555555"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.equal((svg.match(/<polygon points=/g)||[]).length,1);
 assert.equal((svg.match(/<polyline points=/g)||[]).length,1);
 assert.match(svg,/stroke="#555555"/);
});

test("renders bulged closed polylines and circles with decoded center arrays",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:200,h:120},items:[
  {kind:"polyline",layer:"CURVES",closed:true,pts:[10,10,90,10,90,90,10,90],bulges:[0.25,0,0,0]},
  {kind:"circle",layer:"CURVES",center:[140,60,0],radius:20}
 ]},[{name:"CURVES",color:"#555555"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.match(svg,/<polygon points=/);
 assert.match(svg,/<circle cx="140" cy="60" r="20"/);
});

test("uses explicit dimension annotation text once when native dimension carries a text item",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:200,h:120},items:[
  {kind:"dimension",layer:"DIM",dimensionType:"linear",actualMeasurement:100,x:50,y:35,suppressMeasurementText:true,
   points:{point13:[10,10,0],point14:[110,10,0],point10:[10,35,0]}},
  {kind:"text",layer:"DIM",x:50,y:35,text:"L=100 mm",dimensionText:true,height:10}
 ]},[{name:"DIM",color:"#222222"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.equal((svg.match(/L=100 mm/g)||[]).length,1);
 assert.doesNotMatch(svg,/>100<\/text>/);
});

test("renders filled inward-pointing arrowheads for linear and aligned dimensions",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:300,h:160},items:[
  {kind:"dimension",layer:"DIM",dimensionType:"linear",actualMeasurement:100,x:50,y:35,
   points:{point13:[10,10,0],point14:[110,10,0],point10:[10,35,0]}},
  {kind:"dimension",layer:"DIM",dimensionType:"aligned",actualMeasurement:80,x:170,y:80,
   points:{point13:[130,20,0],point14:[190,80,0],point10:[130,80,0]}}
 ]},[{name:"DIM",color:"#222222"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.equal((svg.match(/<polygon points=/g)||[]).length,4);
 assert.match(svg,/fill="#222222"/);
 assert.match(svg,/<line x1="10" y1="35" x2="110" y2="35"/);
});

test("rotates fallback dimension measurement text by its text rotation",()=>{
 const prepared=prepareNativeDwgSheet({size:{w:100,h:100},items:[
  {kind:"dimension",layer:"DIM",dimensionType:"linear",actualMeasurement:50,x:20,y:30,textRotation:Math.PI/4,
   points:{point13:[0,0,0],point14:[50,0,0],point10:[0,30,0]}}
 ]},[{name:"DIM",color:"#222222"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.match(svg,/rotate\(-45\)/);
});
