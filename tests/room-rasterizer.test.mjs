import test from "node:test";
import assert from "node:assert/strict";
import { rasterizeSegmentSupercover } from "../original/room-rasterizer.js";

function cells(x1,y1,x2,y2,cw=1,ch=1){
 const out=new Set();
 rasterizeSegmentSupercover(x1,y1,x2,y2,cw,ch,(x,y)=>{const key=x+","+y;if(out.has(key))return false;out.add(key);return true;});
 return out;
}

test("horizontal and vertical segments cover every grid cell without dilation",()=>{
 assert.deepEqual([...cells(0,0,5,0)].sort(),["0,0","1,0","2,0","3,0","4,0","5,0"]);
 assert.deepEqual([...cells(0,0,0,5)].sort(),["0,0","0,1","0,2","0,3","0,4","0,5"]);
});

test("diagonal corner crossings cover both orthogonal neighbours",()=>{
 const result=cells(0,0,3,3);
 for(let i=0;i<3;i++){
  assert.ok(result.has((i+1)+","+i));
  assert.ok(result.has(i+","+(i+1)));
  assert.ok(result.has((i+1)+","+(i+1)));
 }
});

test("supercover output is symmetric when segment direction is reversed",()=>{
 assert.deepEqual([...cells(2,7,13,4)].sort(),[...cells(13,4,2,7)].sort());
 assert.deepEqual([...cells(1,1,8,8)].sort(),[...cells(8,8,1,1)].sort());
});

test("anisotropic grid cells are respected",()=>{
 const result=cells(0,0,50,40,10,20);
 assert.ok(result.has("5,2"));
 assert.ok(result.size>=6);
});

test("invalid inputs do not mutate the raster",()=>{
 let calls=0;
 assert.equal(rasterizeSegmentSupercover(0,0,1,1,0,1,()=>{calls++;}),0);
 assert.equal(rasterizeSegmentSupercover(0,0,1,1,1,1,null),0);
 assert.equal(calls,0);
});
