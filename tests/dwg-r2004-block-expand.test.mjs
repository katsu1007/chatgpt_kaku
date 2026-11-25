import test from "node:test";
import assert from "node:assert/strict";
import { expandR2004BlockReferences } from "../original/dwg-r2004-block-expand.js";
const h=value=>({value:BigInt(value)});
const line=(handle,pts)=>({selfHandle:BigInt(handle),handleHex:String(handle),layerName:"WALL",layerHandle:20n,geometry:{kind:"line",pts}});
const insert=(handle,block,x,y,extra={})=>({selfHandle:BigInt(handle),geometry:{kind:"insert",insertionPoint:[x,y,0],scale:{x:1,y:1,z:1},rotation:0,extrusion:[0,0,1],...extra},insertHandles:{blockHeader:h(block)}});
const block=(handle,name,owned,basePoint=[0,0,0],flags={})=>({handle:BigInt(handle),name,basePoint,ownedHandles:owned.map(h),flags});
test("expands a model-space INSERT into source-linked positioned line geometry",()=>{
 const entities=[insert(1,100,100,200),line(2,[{x:0,y:0,z:0},{x:50,y:0,z:0}])];
 const blocks=[block(90,"*Model_Space",[1]),block(100,"WALL_SYMBOL",[2])];
 const r=expandR2004BlockReferences(entities,blocks);
 assert.equal(r.diagnostics.expanded,true);assert.equal(r.diagnostics.expandedEntityCount,1);
 assert.deepEqual(r.entities[0].geometry.pts,[100,200,150,200]);
 assert.equal(r.entities[0].sourceInsertHandle,1n);assert.equal(r.entities[0].sourceEntityHandle,2n);
 assert.deepEqual(r.entities[0].blockPath,["WALL_SYMBOL"]);
});
test("expands nested blocks using parent-child transform composition",()=>{
 const entities=[insert(1,100,10,20),insert(2,200,5,0),line(3,[{x:0,y:0,z:0},{x:2,y:0,z:0}])];
 const blocks=[block(90,"*Model_Space",[1]),block(100,"OUTER",[2]),block(200,"INNER",[3])];
 const r=expandR2004BlockReferences(entities,blocks);
 assert.equal(r.entities.length,1);assert.deepEqual(r.entities[0].geometry.pts,[15,20,17,20]);
 assert.deepEqual(r.entities[0].blockPath,["OUTER","INNER"]);
});
test("expands MINSERT arrays and guards xrefs, cycles, and missing references",()=>{
 const entities=[insert(1,100,0,0,{kind:"minsert",columns:3,rows:2,columnSpacing:10,rowSpacing:5}),line(2,[{x:0,y:0,z:0},{x:1,y:0,z:0}])];
 const blocks=[block(90,"*Model_Space",[1]),block(100,"ARRAY",[2])];
 const r=expandR2004BlockReferences(entities,blocks);
 assert.equal(r.entities.length,6);assert.deepEqual(r.entities.map(e=>e.geometry.pts[0]),[0,10,20,0,10,20]);
 const xref=expandR2004BlockReferences([insert(1,100,0,0)],[block(90,"*Model_Space",[1]),block(100,"XREF",[2],[0,0,0],{isXref:true})]);
 assert.equal(xref.diagnostics.skippedXrefs,1);assert.equal(xref.entities.length,0);
 const cycle=expandR2004BlockReferences([insert(1,100,0,0),insert(2,100,0,0)],[block(90,"*Model_Space",[1]),block(100,"LOOP",[2])]);
 assert.equal(cycle.diagnostics.skippedCycles,1);
});
test("keeps original model-space geometry when block expansion has no model-space definition",()=>{
 const entities=[line(1,[{x:0,y:0,z:0},{x:1,y:1,z:0}])];
 const r=expandR2004BlockReferences(entities,[]);
 assert.equal(r.entities,entities);assert.equal(r.diagnostics.expanded,false);
});

test("expands text annotations nested inside positioned block references",()=>{
 const text={selfHandle:3n,layerName:"A-TEXT",geometry:{kind:"text",insertion:{x:1,y:0,z:0},alignment:{x:1,y:0,z:0},rotation:0,height:10,widthFactor:1,text:"ROOM"}};
 const entities=[insert(1,100,100,200),text];
 const blocks=[block(90,"*Model_Space",[1]),block(100,"LABEL",[3])];
 const r=expandR2004BlockReferences(entities,blocks);
 assert.equal(r.entities.length,1);assert.equal(r.entities[0].geometry.kind,"text");
 assert.deepEqual(r.entities[0].geometry.insertion,{x:101,y:200,z:0});
 assert.equal(r.entities[0].geometry.text,"ROOM");
});

test("includes INSERT-owned ATTRIB values in the expanded sheet entity stream",()=>{
 const ins=insert(1,100,100,200);ins.insertHandles.attributes=[h(2)];
 const attrib={selfHandle:2n,geometry:{kind:"attrib",insertion:{x:105,y:210,z:0},alignment:{x:105,y:210,z:0},rotation:0,height:12,widthFactor:1,text:"ROOM A",tag:"ROOM_NAME",attributeFlags:0}};
 const r=expandR2004BlockReferences([ins,attrib],[block(90,"*Model_Space",[1]),block(100,"CHAIR",[])]);
 const found=r.entities.find(x=>x.geometry?.kind==="attrib");
 assert.ok(found);assert.equal(found.geometry.tag,"ROOM_NAME");assert.equal(found.geometry.text,"ROOM A");
 assert.equal(found.sourceInsertHandle,1n);assert.equal(r.diagnostics.attributeCount,1);
});
test("transforms nested ATTRIB positions with the containing block transform",()=>{
 const outer=insert(1,100,100,200),nested=insert(2,200,10,0);
 nested.insertHandles.attributes=[h(3)];
 const attrib={selfHandle:3n,geometry:{kind:"attrib",insertion:{x:5,y:5,z:0},alignment:{x:5,y:5,z:0},rotation:0,height:10,widthFactor:1,text:"TAG",tag:"ID",attributeFlags:0}};
 const r=expandR2004BlockReferences([outer,nested,attrib],[block(90,"*Model_Space",[1]),block(100,"OUTER",[2]),block(200,"INNER",[])]);
 const found=r.entities.find(x=>x.geometry?.kind==="attrib");
 assert.ok(found);assert.deepEqual(found.geometry.insertion,{x:105,y:205,z:0});
});
