import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004BlockHeaderRecord, readR2004BlockHeaders } from "../original/dwg-r2004-block-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const bl=v=>v===0?[1,0]:[0,1,...bits(v)];
const tv=s=>[...bs(s.length),...bytesBits([...s].map(c=>c.charCodeAt(0)))];
const handle=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
function blockRecord({handleValue=300,name="CHAIR",owned=[501,502],insert=[600],base=[0,0,0]}={}){
 const baseBits=[0,1,...bits(49),...bytesBits([0,0,0,0]),...handle(handleValue),...bs(0),...bl(0),1,...tv(name),
  0,...bs(0),0,0,0,0,0,...bl(owned.length),...base.flatMap(v=>v===0?[1,0]:[0,0,...bytesBits(new Uint8Array(new Float64Array([v]).buffer))]),
  ...tv(""),...insert.flatMap(()=>bits(1)),...bits(0),...tv("Block description"),...bl(0)];
 const handleStart=16+baseBits.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 baseBits.splice(10,32,...bytesBits(rl));
 const refs=[...handle(400),...handle(0),...handle(0),...handle(301),...owned.flatMap(handle),...handle(302),...insert.flatMap(handle),...handle(401)];
 const body=pack([...baseBits,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
function otherRecord(type=44,handleValue=999){
 const body=pack([0,1,...bits(type),...bytesBits([0,0,0,0]),...handle(handleValue)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length;out[1]=0;out.set(body,2);return out;
}
test("decodes BLOCK_HEADER name, base point, owned handles and INSERT handles",()=>{
 const r=parseR2004BlockHeaderRecord(blockRecord());
 assert.equal(r.typeName,"BLOCK_HEADER");assert.equal(r.handle,300n);assert.equal(r.name,"CHAIR");
 assert.deepEqual(r.basePoint,[0,0,0]);assert.deepEqual(r.ownedHandles.map(x=>x.value),[501n,502n]);
 assert.equal(r.insertHandles[0].value,600n);assert.equal(r.endBlock.value,302n);assert.equal(r.layout.value,401n);
 assert.equal(r.description,"Block description");assert.equal(r.insertCount,1);
});
test("indexes block headers by handle and name while skipping other object types",()=>{
 const a=blockRecord({handleValue:300,name:"CHAIR"}),b=blockRecord({handleValue:301,name:"TABLE",owned:[601],insert:[]}),other=otherRecord();
 const section=new Uint8Array(a.length+b.length+other.length);section.set(a);section.set(b,a.length);section.set(other,a.length+b.length);
 const result=readR2004BlockHeaders(section,{entries:[{handle:300n,offset:0n},{handle:301n,offset:BigInt(a.length)},{handle:999n,offset:BigInt(a.length+b.length)}]});
 assert.equal(result.blocks.length,2);assert.equal(result.byName.get("TABLE").ownedHandles[0].value,601n);
});
test("rejects non-BLOCK_HEADER objects and object-map handle mismatches",()=>{
 assert.throws(()=>parseR2004BlockHeaderRecord(otherRecord()),/type 49/);
 const a=blockRecord();assert.throws(()=>readR2004BlockHeaders(a,{entries:[{handle:301n,offset:0n}]}),/handle mismatch/);
});
