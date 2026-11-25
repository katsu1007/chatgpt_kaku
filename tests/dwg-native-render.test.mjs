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
  {kind:"text",layer:"NOTES",x:10,y:80,text:"1\\\\P2\\\\S1#2;\\\\U+03A9 %%d %%p %%c",height:10,rotation:0},
  {kind:"text",layer:"NOTES",x:10,y:40,text:"A <B> & C",height:10,rotation:0}
 ]},[{name:"NOTES",color:"#111111"}]);
 const svg=renderNativeDwgSvg(prepared);
 assert.ok(svg.includes('<tspan x="0" dy="0">1</tspan>'));
 assert.ok(svg.includes('<tspan x="0" dy="12.5">2</tspan>'));
 assert.match(svg,/1\/2/);
 assert.match(svg,/Ω ° ± Ø/);
 assert.match(svg,/A &lt;B&gt; &amp; C/);
});
