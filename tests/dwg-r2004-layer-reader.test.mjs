import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004LayerRecord, readR2004LayerRecords, resolveR2004EntityLayers } from "../original/dwg-r2004-layer-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
function layerRecord({handle=200,name="A-WALL",values=18,colorFlags=0,colorName=null,bookName=null}={}){
 const base=[0,1,...bits(51),...bytesBits([0,0,0,0]),...bits(0,4),...bits(1,4),...bits(handle),
  ...bs(0),1,0,...bs(name.length),...bytesBits([...name].map(c=>c.charCodeAt(0))),0,...bs(0),0,...bs(values),
  ...bs(0),...bytesBits([0,0,255,0,0]),...bits(colorFlags)];
 if(colorFlags&1)base.push(...bs(colorName.length),...bytesBits([...colorName].map(c=>c.charCodeAt(0))));
 if(colorFlags&2)base.push(...bs(bookName.length),...bytesBits([...bookName].map(c=>c.charCodeAt(0))));
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack(base),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out[out.length-2]=0x12;out[out.length-1]=0x34;return out;
}
function genericRecord(type,handle){
 const body=pack([0,1,...bits(type),...bytesBits([0,0,0,0]),...bits(0,4),...bits(1,4),...bits(handle)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length;out[1]=0;out.set(body,2);return out;
}
test("decodes R2004 LAYER name, handle, visibility, lock and color",()=>{
 const r=parseR2004LayerRecord(layerRecord());
 assert.equal(r.handle,200n);assert.equal(r.name,"A-WALL");assert.equal(r.flags.on,true);
 assert.equal(r.flags.plottable,true);assert.equal(r.flags.frozen,false);assert.equal(r.color.rgb,0x00ff00);
});
test("reads optional CMC color and book names",()=>{
 const r=parseR2004LayerRecord(layerRecord({colorFlags:3,colorName:"Gold",bookName:"Book"}));
 assert.equal(r.color.colorName,"Gold");assert.equal(r.color.bookName,"Book");
});
test("builds a layer handle index and resolves entity layer names",()=>{
 const a=layerRecord({handle:200,name:"A-WALL"}),b=layerRecord({handle:201,name:"A-FURN"}),other=genericRecord(44,99);
 const section=new Uint8Array(a.length+b.length+other.length);section.set(a);section.set(b,a.length);section.set(other,a.length+b.length);
 const map=readR2004LayerRecords(section,{entries:[{handle:200n,offset:0n},{handle:201n,offset:BigInt(a.length)},{handle:99n,offset:BigInt(a.length+b.length)}]});
 assert.equal(map.layers.length,2);assert.equal(map.byHandle.get("201").name,"A-FURN");
 const resolved=resolveR2004EntityLayers([{layerHandle:200n},{layerHandle:201n},{layerHandle:999n}],map);
 assert.equal(resolved.entities[0].layerName,"A-WALL");assert.equal(resolved.entities[1].layerName,"A-FURN");
 assert.equal(resolved.entities[2].layerResolved,false);assert.equal(resolved.diagnostics.unresolvedLayerCount,1);
});
test("rejects non-layer objects and malformed records",()=>{
 assert.throws(()=>parseR2004LayerRecord(genericRecord(44,5)),/type 51/);
 const bad=layerRecord();bad[0]=0x7f;assert.throws(()=>parseR2004LayerRecord(bad),/bounds/);
});
