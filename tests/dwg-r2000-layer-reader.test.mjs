import test from "node:test";
import assert from "node:assert/strict";
import { parseR2000LayerRecord, readR2000LayerRecords, resolveR2000EntityLayers } from "../original/dwg-r2000-layer-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const handleBits=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
function layerRecord({handle=200,name="A-WALL",values=26,color=7,layerControl=50,plotstyle=15,linetype=6}={}){
 const base=[0,1,...bits(51),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),1,0,
  ...bs(name.length),...bytesBits([...name].map(c=>c.charCodeAt(0))),0,...bs(0),0,...bs(values),...bs(color)];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(layerControl),...handleBits(0),...handleBits(0),...handleBits(plotstyle),...handleBits(linetype),...handleBits(0)];
 const body=pack([...base,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
function genericRecord(type,handle){
 const body=pack([0,1,...bits(type),...bytesBits([0,0,0,0]),...bits(0,4),...bits(1,4),...bits(handle)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);return out;
}
test("decodes R2000 LAYER name, ACI color, visibility flags and table handles",()=>{
 const r=parseR2000LayerRecord(layerRecord());
 assert.equal(r.handle,200n);assert.equal(r.name,"A-WALL");assert.equal(r.xrefIndex,-1);
 assert.equal(r.flags.on,true);assert.equal(r.flags.plottable,true);assert.equal(r.flags.locked,true);
 assert.equal(r.color.aci,7);assert.equal(r.handles.layerControl.value,50n);
 assert.equal(r.handles.plotstyle.value,15n);assert.equal(r.handles.linetype.value,6n);
});
test("indexes R2000 layer records and resolves entity layer handles",()=>{
 const bytes=layerRecord(),objectMap={entries:[{handle:200n,offset:0n}]};
 const layers=readR2000LayerRecords(bytes,objectMap);
 assert.equal(layers.layers.length,1);
 const resolved=resolveR2000EntityLayers([{layerHandle:200n},{layerHandle:999n}],layers);
 assert.equal(resolved.entities[0].layerName,"A-WALL");assert.equal(resolved.entities[0].layerResolved,true);
 assert.equal(resolved.entities[1].layerResolved,false);assert.equal(resolved.diagnostics.unresolvedLayerCount,1);
});
test("rejects non-LAYER records and object-map handle mismatches",()=>{
 assert.throws(()=>parseR2000LayerRecord(genericRecord(19,5),0),/requires object type 51/);
 assert.throws(()=>readR2000LayerRecords(layerRecord(),{entries:[{handle:201n,offset:0n}]}),/R2000 layer object-map handle mismatch/);
});
