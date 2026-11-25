import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004EntityRecord, readR2004EntityRecords } from "../original/dwg-r2004-entity-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const bytesBits=a=>a.flatMap(v=>bits(v));
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return bytesBits([...b]);};
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
function lineRecord({handle=5,eed=[],graphic=null,colorBits=[0,1,...bits(7)]}={}){
 const graphicBits=graphic===null?[0]:[1,...bytesBits([graphic.length,0,0,0]),...bytesBits(graphic)];
 const geometry=[1,...raw(100),0,0,...raw(200),0,0,1,1];
 const body=pack([0,1,...bits(19),...bytesBits([0xff,0xff,0xff,0x7f]),...bits(0,4),...bits(1,4),...bits(handle),
  1,0,...bytesBits([eed.length]),...bytesBits(eed),...graphicBits,
  0,0,1,0,1,...colorBits,0,1,0,0,1,0,...bits(0),...geometry]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out[out.length-2]=0x12;out[out.length-1]=0x34;return out;
}
test("decodes common R2004 entity attributes and LINE geometry",()=>{
 const record=lineRecord(),r=parseR2004EntityRecord(record);
 assert.equal(r.typeName,"LINE");assert.equal(r.selfHandle,5n);assert.equal(r.entityMode,0);assert.equal(r.reactorCount,0);
 assert.equal(r.xdictionaryMissing,true);assert.equal(r.noLinks,true);assert.equal(r.color.aci,7);
 assert.equal(r.linetypeScale,1);assert.equal(r.invisibility,0);assert.equal(r.lineweight,0);
 assert.deepEqual(r.geometry.pts,[{x:100,y:200,z:0},{x:100,y:200,z:0}]);
 assert.equal(r.diagnostics.commonEntityDecoded,true);assert.equal(r.diagnostics.geometryDecoded,true);
});
test("skips EED and optional proxy graphics before reading common attributes",()=>{
 const r=parseR2004EntityRecord(lineRecord({eed:[0xaa,0xbb],graphic:[1,2,3]}));
 assert.deepEqual([...r.eed],[0xaa,0xbb]);assert.deepEqual([...r.graphic],[1,2,3]);assert.equal(r.geometry.kind,"line");
});
test("decodes complex entity color metadata",()=>{
 const colorBits=[0,0,...bytesBits([0,0x80,0x34,0x12])];
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
 assert.throws(()=>parseR2004EntityRecord(record,0,{maxEedBytes:0}),/EED/);
});
