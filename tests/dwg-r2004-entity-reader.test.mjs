import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004EntityRecord, readR2004EntityRecords } from "../original/dwg-r2004-entity-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return bytesBits([...b]);};
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const handleBits=v=>[...bits(0,4),...bits(1,4),...bits(v)];
function makeEnvelope(type,handle){
 const bodyBits=[0,1,...bits(type),...bytesBits([0,0,0,0]),...handleBits(handle)],body=pack(bodyBits);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);return out;
}
function lineRecord({handle=5,eed=[],graphic=null,colorBits=[0,1,...bits(7)]}={}){
 const graphicBits=graphic===null?[0]:[1,...bytesBits([graphic.length,0,0,0]),...bytesBits(graphic)];
 const geometry=[1,...raw(100),0,0,...raw(200),0,0,1,1];
 const base=[0,1,...bits(19),...bytesBits([0,0,0,0]),...handleBits(handle),
  ...bs(eed.length),...bytesBits(eed),...graphicBits,
  0,0,1,0,1,1,...colorBits,0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStartBit=16+base.length,rlBytes=[handleStartBit&255,(handleStartBit>>>8)&255,(handleStartBit>>>16)&255,(handleStartBit>>>24)&255];
 base.splice(10,32,...bytesBits(rlBytes));
 const body=pack([...base,...handleBits(100),...handleBits(200)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out[out.length-2]=0x12;out[out.length-1]=0x34;return out;
}
test("decodes common R2004 entity attributes and LINE geometry",()=>{
 const record=lineRecord(),r=parseR2004EntityRecord(record);
 assert.equal(r.typeName,"LINE");assert.equal(r.selfHandle,5n);assert.equal(r.entityMode,0);assert.equal(r.reactorCount,0);
 assert.equal(r.xdictionaryMissing,true);assert.equal(r.noLinks,true);assert.equal(r.color.aci,7);
 assert.equal(r.linetypeScale,1);assert.equal(r.invisibility,0);assert.equal(r.lineweight,0);assert.equal(r.handles.owner.value,100n);assert.equal(r.layerHandle,200n);
 assert.deepEqual(r.geometry.pts,[{x:100,y:200,z:0},{x:100,y:200,z:0}]);
 assert.equal(r.diagnostics.commonEntityDecoded,true);assert.equal(r.diagnostics.geometryDecoded,true);
});
test("skips EED and optional proxy graphics before reading common attributes",()=>{
 const r=parseR2004EntityRecord(lineRecord({eed:[0xaa,0xbb],graphic:[1,2,3]}));
 assert.deepEqual([...r.eed],[0xaa,0xbb]);assert.deepEqual([...r.graphic],[1,2,3]);assert.equal(r.geometry.kind,"line");
});
test("decodes complex entity color metadata",()=>{
 const colorBits=[0,0,...bytesBits([0,0x80]),0,0,...bytesBits([0x34,0x12])];
 const r=parseR2004EntityRecord(lineRecord({colorBits}));
 assert.equal(r.color.complex,true);assert.equal(r.color.rgb,0x1234);
});
test("resolves common entity records through object-map handles",()=>{
 const a=lineRecord({handle:5}),b=lineRecord({handle:8}),section=new Uint8Array(a.length+b.length);section.set(a);section.set(b,a.length);
 const result=readR2004EntityRecords(section,{entries:[{handle:5n,offset:0n},{handle:8n,offset:BigInt(a.length)}]});
 assert.equal(result.records.length,2);assert.equal(result.diagnostics.geometryCount,2);
 assert.throws(()=>readR2004EntityRecords(section,{entries:[{handle:6n,offset:0n}]}),/handle mismatch/);
});
test("rejects invalid EED and graphic lengths",()=>{
 const record=lineRecord();
 assert.throws(()=>parseR2004EntityRecord(lineRecord({eed:[1]}),0,{maxEedBytes:0}),/EED/);
 assert.throws(()=>parseR2004EntityRecord(lineRecord({graphic:[1]}),0,{maxGraphicBytes:0}),/graphic/);
});

test("skips non-entity objects in AcDb:AcDbObjects without treating them as entities",()=>{
 const a=lineRecord(),b=makeEnvelope(44,99),section=new Uint8Array(a.length+b.length);section.set(a);section.set(b,a.length);
 const result=readR2004EntityRecords(section,{entries:[{handle:5n,offset:0n},{handle:99n,offset:BigInt(a.length)}]});
 assert.equal(result.records.length,1);assert.equal(result.skippedObjects.length,1);assert.equal(result.skippedObjects[0].objectType,44);
});

function insertRecord({handle=600,owner=100,layer=200,block=300}={}){
 const geometry=[1,0,1,0,1,0,1,1,1,0,1,0,1,0];
 const base=[0,1,...bits(7),...bytesBits([0,0,0,0]),...handleBits(handle),
  ...bs(0),0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(owner),...handleBits(layer),...handleBits(block)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("decodes INSERT transform and its BLOCK_HEADER reference",()=>{
 const r=parseR2004EntityRecord(insertRecord());
 assert.equal(r.typeName,"INSERT");assert.equal(r.geometry.kind,"insert");
 assert.deepEqual(r.geometry.insertionPoint,[0,0,0]);assert.deepEqual(r.geometry.scale,{x:1,y:1,z:1,flag:3});
 assert.equal(r.layerHandle,200n);assert.equal(r.ownerHandle,100n);assert.equal(r.insertHandles.blockHeader.value,300n);
 assert.equal(r.insertHandles.attributes.length,0);assert.equal(r.insertHandles.seqend,null);
});
test("INSERT records are retained by the object-map entity reader",()=>{
 const record=insertRecord(),result=readR2004EntityRecords(record,{entries:[{handle:600n,offset:0n}]});
 assert.equal(result.records.length,1);assert.equal(result.records[0].typeName,"INSERT");
});
