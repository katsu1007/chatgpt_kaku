import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004EntityRecord, readR2004EntityRecords, assembleR2004LegacyPolylines, resolveR2004MLineStyles } from "../original/dwg-r2004-entity-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return bytesBits([...b]);};
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const handleBits=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
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
 const a=lineRecord(),b=makeEnvelope(45,99),section=new Uint8Array(a.length+b.length);section.set(a);section.set(b,a.length);
 const result=readR2004EntityRecords(section,{entries:[{handle:5n,offset:0n},{handle:99n,offset:BigInt(a.length)}]});
 assert.equal(result.records.length,1);assert.equal(result.skippedObjects.length,1);assert.equal(result.skippedObjects[0].objectType,45);
});

function insertRecord({handle=600,owner=100,layer=200,block=300}={}){
 const geometry=[1,0,1,0,1,0,1,1,1,0,1,0,1,0];
 const base=[0,1,...bits(7),...bytesBits([0,0,0,0]),...handleBits(handle),
  ...bs(0),0,0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
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

const bl=v=>v===0?[1,0]:v<256?[0,1,...bits(v)]:[0,0,...bytesBits([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])];
const bd=v=>v===0?[1,0]:v===1?[0,1]:[0,0,...raw(v)];
const tv=v=>[...bs(v.length),...bytesBits([...v].map(c=>c.charCodeAt(0)))];
function hatchRecord(){
 const geometry=[...bl(0),...bl(0),...bd(0),...bd(0),...bl(0),...bd(0),...bl(0),...tv(""),
  ...bd(0),...bd(0),...bd(0),...bd(1),...tv("SOLID"),1,0,...bl(1),
  ...bl(2),0,1,...bl(4),...raw(0),...raw(0),...raw(100),...raw(0),...raw(100),...raw(50),...raw(0),...raw(50),...bl(1),
  ...bs(0),...bs(1),...bl(0)];
 const base=[0,1,...bits(78),...bytesBits([0,0,0,0]),...handleBits(700),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...handleBits(301)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads HATCH geometry and its boundary object handle stream",()=>{
 const r=parseR2004EntityRecord(hatchRecord());
 assert.equal(r.typeName,"HATCH");assert.equal(r.geometry.kind,"hatch");
 assert.equal(r.geometry.boundaryObjectCount,1);assert.equal(r.boundaryHandles.length,1);
 assert.equal(r.boundaryHandles[0].value,301n);assert.equal(r.layerHandle,200n);
 const records=readR2004EntityRecords(hatchRecord(),{entries:[{handle:700n,offset:0n}]});
 assert.equal(records.records.length,1);assert.equal(records.records[0].typeName,"HATCH");
});

function annotationRecord(type,geometry,handle=800){
 const base=[0,1,...bits(type),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...handleBits(300)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads TEXT and MTEXT entities with their text-style handle references",()=>{
 const textGeometry=[...bits(255),...raw(10),...raw(20),1,1,...raw(15),...tv("ROOM A")];
 const text=parseR2004EntityRecord(annotationRecord(1,textGeometry,800));
 assert.equal(text.geometry.kind,"text");assert.equal(text.geometry.text,"ROOM A");assert.equal(text.styleHandle.value,300n);
 const mtextGeometry=[...bd(100),...bd(200),...bd(0),...bd(0),...bd(0),...bd(1),...bd(1),...bd(0),...bd(0),
  ...bd(160),...bd(20),...bs(1),...bs(1),...bd(25),...bd(170),...tv("CONFERENCE"),...bs(0),...bd(1),0,...bl(0)];
 const mtext=parseR2004EntityRecord(annotationRecord(44,mtextGeometry,801));
 assert.equal(mtext.geometry.kind,"mtext");assert.equal(mtext.geometry.text,"CONFERENCE");assert.equal(mtext.styleHandle.value,300n);
 const result=readR2004EntityRecords(annotationRecord(1,textGeometry,800),{entries:[{handle:800n,offset:0n}]});
 assert.equal(result.records[0].geometry.text,"ROOM A");
});

test("decodes Japanese TEXT through the DWG code-page option",()=>{
 const sjis=[0x89,0xef,0x8b,0x63,0x8e,0xba];
 const geometry=[...bits(255),...raw(10),...raw(20),1,1,...raw(15),...bs(sjis.length),...bytesBits(sjis)];
 const r=parseR2004EntityRecord(annotationRecord(1,geometry,802),0,{textEncoding:"shift_jis"});
 assert.equal(r.geometry.text,"会議室");
});

function dimensionRecord(){
 const geometry=[...bd(0),...bd(0),...bd(1),...raw(50),...raw(25),...bd(0),...bits(0),...tv("<>"),...bd(0),...bd(0),...bd(1),...bd(1),...bd(1),...bd(0),
  ...bs(1),...bs(0),...bd(1),...bd(100),...raw(50),...raw(25),
  ...bd(0),...bd(0),...bd(0),...bd(100),...bd(0),...bd(0),...bd(0),...bd(20),...bd(0),...bd(0),...bd(0)];
 const base=[0,1,...bits(21),...bytesBits([0,0,0,0]),...handleBits(900),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...handleBits(300),...handleBits(400)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads DIMENSION values and DIMSTYLE/anonymous block references",()=>{
 const r=parseR2004EntityRecord(dimensionRecord());
 assert.equal(r.typeName,"DIMENSION_LINEAR");assert.equal(r.geometry.kind,"dimension");assert.equal(r.geometry.actualMeasurement,100);
 assert.equal(r.dimensionHandles.dimStyle.value,300n);assert.equal(r.dimensionHandles.anonymousBlock.value,400n);
 const list=readR2004EntityRecords(dimensionRecord(),{entries:[{handle:900n,offset:0n}]});
 assert.equal(list.records.length,1);assert.equal(list.records[0].geometry.dimensionName,"linear");
});

function legacyEntityRecord(type,geometry,handle,owned=[]){
 const base=[0,1,...bits(type),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...owned.flatMap(handleBits)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads R2004 legacy POLYLINE vertex ownership and assembles a bulged closed path",()=>{
 const poly=legacyEntityRecord(15,[...bs(1),...bs(0),...bd(0),...bd(0),1,...bd(5),1,...bl(2)],900,[501,502,600]);
 const v1=legacyEntityRecord(10,[...bits(0),...bd(0),...bd(0),...bd(0),...bd(0),...bd(0),...bd(1),...bd(0)],501);
 const v2=legacyEntityRecord(10,[...bits(0),...bd(100),...bd(0),...bd(0),...bd(0),...bd(0),...bd(0),...bd(0)],502);
 assert.equal(parseR2004EntityRecord(poly).geometry.kind,"polyline2d");
 assert.equal(parseR2004EntityRecord(v1).geometry.kind,"vertex2d");
 assert.equal(parseR2004EntityRecord(v2).geometry.kind,"vertex2d");
 const bytes=new Uint8Array(poly.length+v1.length+v2.length);bytes.set(poly);bytes.set(v1,poly.length);bytes.set(v2,poly.length+v1.length);
 const result=readR2004EntityRecords(bytes,{entries:[{handle:900n,offset:0n},{handle:501n,offset:BigInt(poly.length)},{handle:502n,offset:BigInt(poly.length+v1.length)}]});
 const header=result.records.find(x=>x.selfHandle===900n);
 assert.equal(header.geometry.kind,"polyline2d");assert.equal(header.polylineHandles.vertices.length,2);assert.equal(header.polylineHandles.seqend.value,600n);
 const assembled=assembleR2004LegacyPolylines(result.records);
 assert.equal(assembled.diagnostics.assembled,1);assert.equal(assembled.entities.length,1);
 assert.equal(assembled.entities[0].geometry.kind,"polyline");assert.equal(assembled.entities[0].geometry.closed,true);
 assert.deepEqual(assembled.entities[0].geometry.vertices,[{x:0,y:0,z:5},{x:100,y:0,z:5}]);
 assert.deepEqual(assembled.entities[0].geometry.bulges,[1,0]);
});
test("assembles 3D legacy polylines without applying 2D elevation",()=>{
 const header={selfHandle:900n,geometry:{kind:"polyline3d",flags:0,closed:false,ownedObjectCount:2},polylineHandles:{vertices:[{value:501n},{value:502n}],seqend:{value:600n}}};
 const a={selfHandle:501n,geometry:{kind:"vertex3d",point:[1,2,3]}},b={selfHandle:502n,geometry:{kind:"vertex3d",point:[4,5,6]}};
 const r=assembleR2004LegacyPolylines([header,a,b]);
 assert.deepEqual(r.entities[0].geometry.vertices,[{x:1,y:2,z:3},{x:4,y:5,z:6}]);
 assert.equal(r.entities[0].geometry.closed,false);
});

test("reads ATTRIB and ATTDEF with their STYLE references",()=>{
 const text=[...bits(255),...raw(10),...raw(20),1,1,...raw(15),...tv("VALUE"),...tv("ROOM_NAME"),...bs(12),...bits(1)];
 const a=parseR2004EntityRecord(annotationRecord(2,text,810));
 assert.equal(a.geometry.kind,"attrib");assert.equal(a.geometry.tag,"ROOM_NAME");assert.equal(a.styleHandle.value,300n);
 const d=parseR2004EntityRecord(annotationRecord(3,[...text,...tv("Room name")],811));
 assert.equal(d.geometry.kind,"attdef");assert.equal(d.geometry.prompt,"Room name");assert.equal(d.styleHandle.value,300n);
});

function insertWithAttributeRecord(){
 const geometry=[1,0,1,0,1,0,1,1,1,0,1,1,...bl(1)];
 const base=[0,1,...bits(7),...bytesBits([0,0,0,0]),...handleBits(610),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...handleBits(300),...handleBits(620),...handleBits(621)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads INSERT-owned ATTRIB and SEQEND handles",()=>{
 const r=parseR2004EntityRecord(insertWithAttributeRecord());
 assert.equal(r.geometry.hasAttributes,true);assert.equal(r.geometry.ownedObjectCount,1);
 assert.equal(r.insertHandles.blockHeader.value,300n);assert.equal(r.insertHandles.attributes[0].value,620n);
 assert.equal(r.insertHandles.seqend.value,621n);
});

function mlineRecord(){
 const geometry=[...bd(1),...bs(1),...bd(0),...bd(0),...bd(0),...bd(0),...bd(0),...bd(1),...bs(3),...bits(2),...bs(2),
  ...bd(0),...bd(0),...bd(0),...bd(1),...bd(0),...bd(0),...bd(0),...bd(1),...bd(0),...bs(0),...bs(0),...bs(0),...bs(0),
  ...bd(100),...bd(0),...bd(0),...bd(1),...bd(0),...bd(0),...bd(0),...bd(1),...bd(0),...bs(0),...bs(0),...bs(0),...bs(0)];
 const base=[0,1,...bits(47),...bytesBits([0,0,0,0]),...handleBits(910),...bs(0),0,
  0,0,1,0,1,1,0,1,...bits(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const body=pack([...base,...handleBits(100),...handleBits(200),...handleBits(300)]);
 const out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
test("reads MLINE style handle and derives two wall boundaries from style offsets",()=>{
 const record=mlineRecord(),entity=parseR2004EntityRecord(record);
 assert.equal(entity.geometry.kind,"mline");assert.equal(entity.mlineStyleHandle.value,300n);
 const style={handle:300n,name:"WALL",elements:[{offset:-0.5,color:{rgb:0xff0000}},{offset:0.5,color:{rgb:0x00ff00}}]};
 const result=resolveR2004MLineStyles([entity],{byHandle:new Map([["300",style]])});
 assert.equal(result.diagnostics.resolvedMLineCount,1);assert.equal(result.entities[0].geometry.boundaries.length,2);
 assert.deepEqual(result.entities[0].geometry.boundaries[0].vertices,[{x:0,y:-0.5,z:0},{x:100,y:-0.5,z:0}]);
 assert.deepEqual(result.entities[0].geometry.boundaries[1].vertices,[{x:0,y:0.5,z:0},{x:100,y:0.5,z:0}]);
});
