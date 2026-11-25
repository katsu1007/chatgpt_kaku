import test from "node:test";
import assert from "node:assert/strict";
import { parseR2000BlockHeaderRecord, readR2000BlockHeaders, assembleR2000BlockDefinitions } from "../original/dwg-r2000-block-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const bl=v=>v===0?[1,0]:[0,1,...bits(v)];
const tv=s=>[...bs(s.length),...bytesBits([...s].map(c=>c.charCodeAt(0)))];
const handle=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
function blockRecord({handleValue=300,name="CHAIR",first=501,last=502,blockEntity=301,insert=[600],base=[0,0,0],isXref=false,overlaid=false,loadedBit=0}={}){
 const baseBits=[0,1,...bits(49),...bytesBits([0,0,0,0]),...handle(handleValue),...bs(0),...bl(0),...tv(name),
  0,...bs(0),0,0,0,isXref?1:0,overlaid?1:0,loadedBit,
  ...base.flatMap(v=>v===0?[1,0]:[0,0,...bytesBits(new Uint8Array(new Float64Array([v]).buffer))]),
  ...tv(""),...insert.flatMap(()=>bits(1)),...bits(0),...tv("Block description"),...bl(0)];
 const handleStart=16+baseBits.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 baseBits.splice(10,32,...bytesBits(rl));
 const refs=[...handle(400),...handle(0),...handle(0),...handle(blockEntity)];
 if(!isXref&&!overlaid)refs.push(...handle(first),...handle(last));
 refs.push(...handle(302),...insert.flatMap(handle),...handle(401));
 const body=pack([...baseBits,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
function otherRecord(type=44,handleValue=999){
 const body=pack([0,1,...bits(type),...bytesBits([0,0,0,0]),...handle(handleValue)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length;out[1]=0;out.set(body,2);return out;
}
test("decodes R2000 BLOCK_HEADER fields and first/last entity references",()=>{
 const r=parseR2000BlockHeaderRecord(blockRecord());
 assert.equal(r.typeName,"BLOCK_HEADER");assert.equal(r.handle,300n);assert.equal(r.name,"CHAIR");
 assert.deepEqual(r.basePoint,[0,0,0]);assert.equal(r.firstEntity.value,501n);assert.equal(r.lastEntity.value,502n);
 assert.equal(r.blockEntity.value,301n);assert.equal(r.endBlock.value,302n);
 assert.equal(r.insertHandles[0].value,600n);assert.equal(r.description,"Block description");
 assert.equal(r.ownedHandles.length,0);assert.equal(r.flags.loaded,true);
});
test("indexes R2000 block headers and assembles owned entities from owner and first/last handles",()=>{
 const a=blockRecord({handleValue:300,name:"CHAIR",first:501,last:501}),b=blockRecord({handleValue:301,name:"TABLE",blockEntity:302,first:502,last:502,insert:[]}),other=otherRecord();
 const section=new Uint8Array(a.length+b.length+other.length);section.set(a);section.set(b,a.length);section.set(other,a.length+b.length);
 const map={entries:[{handle:300n,offset:0n},{handle:301n,offset:BigInt(a.length)},{handle:999n,offset:BigInt(a.length+b.length)}]};
 const blocks=readR2000BlockHeaders(section,map);assert.equal(blocks.blocks.length,2);assert.equal(blocks.byName.get("TABLE").firstEntity.value,601n);
 const assembled=assembleR2000BlockDefinitions(blocks,[
  {selfHandle:501n,ownerHandle:300n},{selfHandle:502n,ownerHandle:302n},{selfHandle:503n,ownerHandle:300n}
 ]);
 assert.deepEqual(assembled.byName.get("CHAIR").ownedHandles.map(x=>x.value),[501n]);
 assert.deepEqual(assembled.byName.get("TABLE").ownedHandles.map(x=>x.value),[502n]);
 assert.equal(assembled.diagnostics.assembledEntityCount,2);
});
test("omits first/last handles for xrefs and rejects wrong object types",()=>{
 const xref=parseR2000BlockHeaderRecord(blockRecord({isXref:true,loadedBit:0}));
 assert.equal(xref.flags.isXref,true);assert.equal(xref.flags.loaded,true);assert.equal(xref.firstEntity,null);
 assert.throws(()=>parseR2000BlockHeaderRecord(otherRecord()),/requires object type 49/);
});
