import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004ObjectRecordEnvelope, readR2004ObjectRecords } from "../original/dwg-r2004-object-record.js";
const bits=(v,n)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const byteBits=b=>Array.from(b).flatMap(v=>bits(v,8));
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
function record(type,handle){
 const body=pack([0,1,...bits(type,8),...byteBits([32,0,0,0]),...bits(0,4),...bits(1,4),...bits(handle,8)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length;out[1]=0;out.set(body,2);out[out.length-2]=0x12;out[out.length-1]=0x34;return out;
}
test("reads R2004 object size, type, data-bit length and self handle",()=>{
 const r=parseR2004ObjectRecordEnvelope(record(19,5));
 assert.equal(r.objectSize,8);assert.equal(r.objectType,19);assert.equal(r.typeName,"LINE");
 assert.equal(r.objectDataBits,32);assert.equal(r.handle,5n);assert.equal(r.crc,0x1234);
 assert.equal(r.diagnostics.entityPayloadDecoded,false);
});
test("resolves multiple object-map entries to record envelopes",()=>{
 const a=record(19,5),b=record(17,8),section=new Uint8Array(a.length+b.length);section.set(a);section.set(b,a.length);
 const result=readR2004ObjectRecords(section,{entries:[{handle:5n,offset:0n},{handle:8n,offset:BigInt(a.length)}]});
 assert.equal(result.records.length,2);assert.equal(result.records[1].typeName,"ARC");assert.equal(result.diagnostics.typeCounts.LINE,1);
});
test("preserves unknown object types and rejects bad boundaries or handles",()=>{
 assert.equal(parseR2004ObjectRecordEnvelope(record(200,9)).typeName,"UNKNOWN_200");
 const broken=record(19,5);broken[0]=0x7f;
 assert.throws(()=>parseR2004ObjectRecordEnvelope(broken),/bounds/);
 assert.throws(()=>readR2004ObjectRecords(record(19,5),{entries:[{handle:6n,offset:0n}]}),/handle mismatch/);
});
test("enforces object count and record size safety limits",()=>{
 assert.throws(()=>parseR2004ObjectRecordEnvelope(record(19,5),0,{maxRecordBytes:2}),/record limit/);
 assert.throws(()=>readR2004ObjectRecords(record(19,5),{entries:[{handle:5n,offset:0n}]},{maxObjects:0}),/object count/);
});
