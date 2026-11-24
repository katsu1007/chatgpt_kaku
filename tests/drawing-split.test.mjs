import test from "node:test";
import assert from "node:assert/strict";
import { makeDrawingChoices, sliceSheetForFrame } from "../original/drawing-split.js";

const sheet=(items,name="sheet")=>({name,size:{w:1000,h:1000},items});
test("each CAD sheet remains selectable even when no drawing frame is found",()=>{
 const drawing={sheets:[sheet([],"one"),sheet([],"two")]};
 const choices=makeDrawingChoices(drawing,()=>[]);
 assert.equal(choices.length,2);
 assert.equal(choices[0].sheetIndex,0);
 assert.equal(choices[1].sheetIndex,1);
 assert.match(choices[1].label,/シート 2/);
});
test("multiple frames become separate drawing choices in reading order",()=>{
 const drawing={sheets:[sheet([])]};
 const frames=[[0,0,1000,700],[1200,0,2200,700]];
 const choices=makeDrawingChoices(drawing,()=>frames);
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(c=>c.frameIndex),[0,1]);
});
test("frame crop clips crossing lines, removes the frame border and excludes unrelated geometry",()=>{
 const source=sheet([
  {kind:"line",layer:"壁",pts:[-100,500,500,500,1100,500]},
  {kind:"line",layer:"枠",pts:[0,0,1000,0]},
  {kind:"text",layer:"文字",x:300,y:300,size:20,text:"教室"},
  {kind:"text",layer:"文字",x:1400,y:300,size:20,text:"別図面"},
  {kind:"arc",layer:"建具",cx:400,cy:400,r:50,a0:0,a1:Math.PI}
 ]);
 const cropped=sliceSheetForFrame(source,[0,0,1000,1000]);
 assert.equal(cropped.size.w,1000);
 assert.equal(cropped.items.filter(i=>i.kind==="line").length,1);
 assert.deepEqual(cropped.items.find(i=>i.kind==="line").pts,[0,500,500,500,1000,500].slice(0,4));
 assert.equal(cropped.items.some(i=>i.kind==="text"&&i.text==="別図面"),false);
 assert.equal(cropped.items.some(i=>i.kind==="text"&&i.text==="教室"),true);
 assert.equal(cropped.items.some(i=>i.kind==="arc"),true);
});
