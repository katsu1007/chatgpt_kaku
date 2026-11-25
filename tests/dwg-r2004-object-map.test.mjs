import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004ObjectMap } from "../original/dwg-r2004-object-map.js";
function mc(value){
 const negative=value<0;let n=Math.abs(value),groups=[];
 do{groups.push(n%128);n=Math.floor(n/128);}while(n>0);
 if(!negative&&(groups.at(-1)&64))groups.push(0);
 if(negative)groups[groups.length-1]|=64;
 return groups.map((v,i)=>i<groups.length-1?v|128:v);
}
function block(pairs,crc=0x1234){
 const body=pairs.flatMap(([h,l])=>[...mc(h),...mc(l)]);
 const size=body.length+2;
 return [size>>8,size&255,...body,crc>>8,crc&255];
}
const fixture=()=>new Uint8Array([...block([[5,512]]),...block([[3,-32]],0xabcd),0,2,0,0]);
test("parses handle and logical object offsets across object-map blocks",()=>{
 const map=parseR2004ObjectMap(fixture());
 assert.equal(map.entries.length,2);
 assert.equal(map.entries[0].handleHex,"5");assert.equal(map.entries[0].offset,512n);
 assert.equal(map.entries[1].handle,8n);assert.equal(map.entries[1].offset,480n);
 assert.equal(map.diagnostics.terminalBlockFound,true);assert.equal(map.blocks.length,3);
});
test("supports multi-byte modular chars and signed location deltas",()=>{
 const data=new Uint8Array([...block([[64,4610],[-0+1,-1413]]),0,2,0,0]);
 const map=parseR2004ObjectMap(data);
 assert.equal(map.entries[0].offset,4610n);assert.equal(map.entries[1].offset,3197n);
});
test("rejects missing terminator, malformed blocks and non-increasing handles",()=>{
 assert.throws(()=>parseR2004ObjectMap(new Uint8Array(block([[5,10]])),{}),/terminal|block/);
 assert.throws(()=>parseR2004ObjectMap(new Uint8Array([0,1,0,2,0,0])),/block size/);
 assert.throws(()=>parseR2004ObjectMap(new Uint8Array([...block([[5,10],[0,1]]),0,2,0,0])),/strictly increasing/);
});
test("enforces block and entry safety limits",()=>{
 assert.throws(()=>parseR2004ObjectMap(fixture(),{maxEntries:1}),/entry limit/);
 assert.throws(()=>parseR2004ObjectMap(new Uint8Array([0x08,0x00,...new Uint8Array(2048)])),/block size/);
});
