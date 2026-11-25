import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004MLineStyleRecord, readR2004MLineStyleRecords } from "../original/dwg-r2004-mline-style-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const bs=v=>v===0?[1,0]:v<256?[0,1,...bits(v)]:[0,0,...bytesBits([v&255,(v>>>8)&255])];
const bl=v=>v===0?[1,0]:v<256?[0,1,...bits(v)]:[0,0,...bytesBits([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])];
const bd=v=>v===0?[1,0]:v===1?[0,1]:[0,0,...Array.from(new Uint8Array(new Float64Array([v]).buffer)).flatMap(x=>bits(x))];
const tv=s=>[...bs(s.length),...bytesBits([...s].map(c=>c.charCodeAt(0)))];
const handle=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
function record({handleValue=300,name="WALL",offsets=[-0.5,0.5]}={}){
 const cmc=(rgb)=>[...bs(0),...bl(rgb),...bits(0)];
 const base=[0,1,...bits(73),...bytesBits([0,0,0,0]),...handle(handleValue),...bs(0),...bl(0),1,
  ...tv(name),...tv("Two-line wall"),...bs(0),...cmc(0x808080),...bd(0),...bd(1),...bits(offsets.length)];
 for(let i=0;i<offsets.length;i++)base.push(...bd(offsets[i]),...cmc(i?0x00ff00:0xff0000),...bs(0));
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handle(100)]),out=new Uint8Array(2+body.length+2);
 out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("decodes MLINESTYLE name, colors, flags and element offsets",()=>{
 const r=parseR2004MLineStyleRecord(record());
 assert.equal(r.name,"WALL");assert.equal(r.description,"Two-line wall");assert.equal(r.elements.length,2);
 assert.equal(r.elements[0].offset,-0.5);assert.equal(r.elements[1].offset,0.5);
 assert.equal(r.elements[0].color.rgb,0xff0000);assert.equal(r.elements[1].color.rgb,0x00ff00);
 assert.equal(r.parentHandle.value,100n);
});
test("indexes MLINESTYLE records by handle and name",()=>{
 const a=record({handleValue:300,name:"WALL"}),b=record({handleValue:301,name:"DOUBLE"});
 const bytes=new Uint8Array(a.length+b.length);bytes.set(a);bytes.set(b,a.length);
 const r=readR2004MLineStyleRecords(bytes,{entries:[{handle:300n,offset:0n},{handle:301n,offset:BigInt(a.length)}]});
 assert.equal(r.styles.length,2);assert.equal(r.byName.get("DOUBLE").handle,301n);
});
