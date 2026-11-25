import test from "node:test";
import assert from "node:assert/strict";
import { dwgR13Crc16, parseR13R15DwgHeader } from "../original/dwg-r13-container.js";
import { parseR2000EntityRecord, readR2000DrawingEntities } from "../original/dwg-r2000-entity-reader.js";
import { DwgBitReader } from "../original/dwg-bitstream.js";
import { decodeR2004LineGeometry } from "../original/dwg-r2004-geometry.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return bytesBits([...b]);};
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const handleBits=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
// Synthetic R2000 object with the R15 common-entity field order.
const dd=(value,defaultValue)=>value===defaultValue?[0,0]:[1,1,...raw(value)];
function lineRecord({handle=5,layer=200,noLinks=true,previous=0,next=0,owner=100,startX=100,startY=200,endX=startX,endY=startY}={}){
 const geometry=[1,...raw(startX),...dd(endX,startX),...raw(startY),...dd(endY,startY),1,1];
 const base=[0,1,...bits(19),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),0,
  0,0,1,0,noLinks?1:0,...bs(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStartBit=16+base.length,rl=[handleStartBit&255,(handleStartBit>>>8)&255,(handleStartBit>>>16)&255,(handleStartBit>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(owner),...handleBits(0)];
 if(!noLinks)refs.push(...handleBits(previous),...handleBits(next));
 refs.push(...handleBits(layer));
 const body=pack([...base,...refs]),out=new Uint8Array(2+body.length+2);
 out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x34,0x12],out.length-2);return out;
}
const bd=v=>v===0?[1,0]:v===1?[0,1]:[0,0,...raw(v)];
function insertRecord({handle=7,layer=200,block=300,owner=100,insertionPoint=[10,20,0],multiple=false,hasAttributes=false,firstAttribute=501,lastAttribute=502,seqend=503,scaleFlags=3,scale=1,columns=3,rows=2,columnSpacing=5,rowSpacing=6}={}){
 const geometry=[...insertionPoint.flatMap(bd),...bits(scaleFlags,2)];
 if(scaleFlags===0){geometry.push(...raw(scale),0,0,0,0);}
 else if(scaleFlags===1){geometry.push(0,0,0,0);}
 else if(scaleFlags===2)geometry.push(...raw(scale));
 geometry.push(...bd(0),1,hasAttributes?1:0);
 if(multiple)geometry.push(...bs(columns),...bs(rows),...bd(columnSpacing),...bd(rowSpacing));
 const base=[0,1,...bits(multiple?8:7),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),0,
  0,0,1,0,1,...bs(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStart=16+base.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(owner),...handleBits(0),...handleBits(layer),...handleBits(block)];
 if(hasAttributes)refs.push(...handleBits(firstAttribute),...handleBits(lastAttribute),...handleBits(seqend));
 const body=pack([...base,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x34,0x12],out.length-2);return out;
}
function mc(value){
 const negative=value<0;let n=Math.abs(value),groups=[];
 do{groups.push(n%128);n=Math.floor(n/128);}while(n>0);
 if(!negative&&(groups.at(-1)&64))groups.push(0);
 if(negative)groups[groups.length-1]|=64;
 return groups.map((v,i)=>i<groups.length-1?v|128:v);
}
function mapBlock(pairs,crc=0x1234){const body=pairs.flatMap(([h,l])=>[...mc(h),...mc(l)]),size=body.length+2;return [size>>8,size&255,...body,crc>>8,crc&255];}
const mapBytes=entries=>new Uint8Array([...mapBlock(entries),0,2,0,0]);
const END=[0x95,0xa0,0x4e,0x28,0x99,0x82,0x1a,0xe5,0x5e,0x41,0xe0,0x5f,0x9d,0x3a,0x4d,0x00];
const put32=(v,o,n)=>v.setUint32(o,n,true);
function makeR2000File(entity){
 const map=mapBytes([[5,0x100]]),file=new Uint8Array(0x300),view=new DataView(file.buffer);
 for(let i=0;i<6;i++)file[i]="AC1015".charCodeAt(i);
 put32(view,0x0d,0x100);view.setUint16(0x13,932,true);put32(view,0x15,3);
 const locators=[[0,0x50,16],[1,0x60,16],[2,0x80,map.length]];
 for(let i=0;i<3;i++){const [id,offset,size]=locators[i],p=0x19+i*9;file[p]=id;put32(view,p+1,offset);put32(view,p+5,size);}
 const crcOffset=0x19+27;view.setUint16(crcOffset,(dwgR13Crc16(file.subarray(0,crcOffset))^0xa598)&0xffff,true);file.set(END,crcOffset+2);
 file.set(map,0x80);file.set(entity,0x100);return file;
}
function layerRecord({handle=200,name="A-WALL",values=18,color=7,layerControl=50,plotstyle=15,linetype=6}={}){
 const base=[0,1,...bits(51),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),1,0,
  ...bs(name.length),...bytesBits([...name].map(c=>c.charCodeAt(0))),0,...bs(0),0,...bs(values),...bs(color)];
 const handleStartBit=16+base.length,rl=[handleStartBit&255,(handleStartBit>>>8)&255,(handleStartBit>>>16)&255,(handleStartBit>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(layerControl),...handleBits(0),...handleBits(0),...handleBits(plotstyle),...handleBits(linetype),...handleBits(0)];
 const body=pack([...base,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
function makeR2000FileWithLayer(entity,layer){
 const layerOffset=0x100+entity.length,map=mapBytes([[5,0x100],[195,entity.length]]),file=new Uint8Array(0x400),view=new DataView(file.buffer);
 for(let i=0;i<6;i++)file[i]="AC1015".charCodeAt(i);
 put32(view,0x0d,0x100);view.setUint16(0x13,932,true);put32(view,0x15,3);
 const locators=[[0,0x50,16],[1,0x60,16],[2,0x80,map.length]];
 for(let i=0;i<3;i++){const [id,offset,size]=locators[i],p=0x19+i*9;file[p]=id;put32(view,p+1,offset);put32(view,p+5,size);}
 const crcOffset=0x19+27;view.setUint16(crcOffset,(dwgR13Crc16(file.subarray(0,crcOffset))^0xa598)&0xffff,true);file.set(END,crcOffset+2);
 file.set(map,0x80);file.set(entity,0x100);file.set(layer,layerOffset);return file;
}

function blockRecord({handleValue=300,name="*MODEL_SPACE",first=500,last=500,blockEntity=301,insert=[],base=[0,0,0]}={}){
 const baseBits=[0,1,...bits(49),...bytesBits([0,0,0,0]),...handleBits(handleValue),...bs(0),...bl(0),...tv(name),
  0,...bs(0),0,0,0,0,0,0,
  ...base.flatMap(v=>v===0?[1,0]:[0,0,...bytesBits(new Uint8Array(new Float64Array([v]).buffer))]),
  ...tv(""),...insert.flatMap(()=>bits(1)),...bits(0),...tv("Block description"),...bl(0)];
 const handleStart=16+baseBits.length,rl=[handleStart&255,(handleStart>>>8)&255,(handleStart>>>16)&255,(handleStart>>>24)&255];
 baseBits.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(90),...handleBits(0),...handleBits(0),...handleBits(0),...handleBits(blockEntity),...handleBits(first),...handleBits(last),...handleBits(blockEntity+1),...insert.flatMap(handleBits),...handleBits(blockEntity+2)];
 const body=pack([...baseBits,...refs]),out=new Uint8Array(2+body.length+2);out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x12,0x34],out.length-2);return out;
}
function makeR2000FileWithObjects(records){
 let handle=0,offset=0x100;const pairs=[],placed=[];
 for(const item of records){pairs.push([item.handle-handle,offset-(placed.length?placed[placed.length-1].offset:0)]);placed.push({...item,offset});handle=item.handle;offset+=item.bytes.length;}
 const map=mapBytes(pairs),file=new Uint8Array(Math.max(0x500,offset+32)),view=new DataView(file.buffer);
 for(let i=0;i<6;i++)file[i]="AC1015".charCodeAt(i);
 put32(view,0x0d,0x100);view.setUint16(0x13,932,true);put32(view,0x15,3);
 const locators=[[0,0x50,16],[1,0x60,16],[2,0x80,map.length]];
 for(let i=0;i<3;i++){const [id,at,size]=locators[i],p=0x19+i*9;file[p]=id;put32(view,p+1,at);put32(view,p+5,size);}
 const crcOffset=0x19+27;view.setUint16(crcOffset,(dwgR13Crc16(file.subarray(0,crcOffset))^0xa598)&0xffff,true);file.set(END,crcOffset+2);
 file.set(map,0x80);for(const item of placed)file.set(item.bytes,item.offset);return file;
}
test("decodes R2000 common entity data, CMC color and LINE geometry",()=>{
 const r=parseR2000EntityRecord(lineRecord());assert.ok(r);
 assert.equal(r.typeName,"LINE");assert.equal(r.selfHandle,5n);assert.equal(r.noLinks,true);
 assert.equal(r.color.aci,7);assert.equal(r.layerHandle,200n);assert.equal(r.ownerHandle,100n);
 assert.equal(r.geometry.kind,"line");assert.deepEqual(r.geometry.pts.map(p=>[p.x,p.y]),[[100,200],[100,200]]);
});
test("reads optional previous/next links only when noLinks is false",()=>{
 const r=parseR2000EntityRecord(lineRecord({noLinks:false,previous:50,next:60}));
 assert.equal(r.handles.previous.value,50n);assert.equal(r.handles.next.value,60n);
 assert.equal(r.layerHandle,200n);
});
test("reads R2000 entity records from absolute object-map file offsets",()=>{
 const file=makeR2000File(lineRecord()),header=parseR13R15DwgHeader(file),result=readR2000DrawingEntities(file,header);
 assert.equal(result.records.length,1);assert.equal(result.records[0].geometry.kind,"line");
 assert.equal(result.records[0].objectMapOffset,0x100n);assert.equal(result.textEncoding,"shift_jis");
});

test("R2000 synthetic LINE payload is independently readable at the expected bit offset",()=>{
 const reader=new DwgBitReader(lineRecord(),{bitOffset:108});
 assert.equal(reader.readBit(),1);assert.equal(reader.readRawDouble(),100);assert.equal(reader.readBits(2),0);
 assert.equal(reader.readRawDouble(),200);assert.equal(reader.readBits(2),0);assert.equal(reader.readBit(),1);assert.equal(reader.readBit(),1);
 const geometry=decodeR2004LineGeometry(new DwgBitReader(lineRecord(),{bitOffset:108}));
 assert.equal(geometry.zIsZero,true);assert.equal(geometry.pts[0].x,100);assert.equal(geometry.pts[0].y,200);
});

test("reads R2000 LAYER table records and resolves entity layer names",()=>{
 const file=makeR2000FileWithLayer(lineRecord(),layerRecord()),header=parseR13R15DwgHeader(file),result=readR2000DrawingEntities(file,header);
 assert.equal(result.layers.length,1);assert.equal(result.layers[0].name,"A-WALL");
 assert.equal(result.entities.length,1);assert.equal(result.entities[0].layerName,"A-WALL");
 assert.equal(result.entities[0].layerResolved,true);assert.equal(result.layerDiagnostics.layerCount,1);
});

test("decodes R2000 INSERT geometry and BLOCK_HEADER reference without R2004 owned-count field",()=>{
 const r=parseR2000EntityRecord(insertRecord());
 assert.equal(r.geometry.kind,"insert");assert.deepEqual(r.geometry.insertionPoint,[10,20,0]);
 assert.deepEqual(r.geometry.scale,{x:1,y:1,z:1,flag:3});assert.equal(r.geometry.hasAttributes,false);
 assert.equal(r.insertHandles.blockHeader.value,300n);assert.equal(r.insertHandles.seqend,null);
});
test("decodes R2000 MINSERT arrays, non-uniform scale defaults and attribute handles",()=>{
 const r=parseR2000EntityRecord(insertRecord({multiple:true,hasAttributes:true,scaleFlags:0,scale:2}));
 assert.equal(r.geometry.kind,"minsert");assert.equal(r.geometry.columns,3);assert.equal(r.geometry.rows,2);
 assert.equal(r.geometry.columnSpacing,5);assert.equal(r.geometry.rowSpacing,6);
 assert.deepEqual(r.geometry.scale,{x:2,y:2,z:2,flag:0});
 assert.equal(r.insertHandles.blockHeader.value,300n);assert.equal(r.insertHandles.firstAttribute.value,501n);
 assert.equal(r.insertHandles.lastAttribute.value,502n);assert.equal(r.insertHandles.seqend.value,503n);
});

test("expands an R2000 model-space INSERT through BLOCK_HEADER ownership",()=>{
 const layer=layerRecord(),model=blockRecord({handleValue:300,name:"*MODEL_SPACE",first:500,last:500,blockEntity:301}),
  symbol=blockRecord({handleValue:400,name:"SYMBOL",first:501,last:501,blockEntity:401,insert:[500]}),
  insert=insertRecord({handle:500,owner:300,block:400,insertionPoint:[100,200,0]}),
  line=lineRecord({handle:501,owner:400,startX:0,startY:0,endX:50,endY:0});
 const file=makeR2000FileWithObjects([{handle:200,bytes:layer},{handle:300,bytes:model},{handle:400,bytes:symbol},{handle:500,bytes:insert},{handle:501,bytes:line}]);
 const result=readR2000DrawingEntities(file,parseR13R15DwgHeader(file));
 assert.equal(result.blocks.length,2);assert.equal(result.blockExpansion.expanded,true);
 assert.equal(result.entities.length,1);assert.deepEqual(result.entities[0].geometry.pts,[100,200,150,200]);
 assert.equal(result.entities[0].sourceInsertHandle,500n);assert.deepEqual(result.entities[0].blockPath,["SYMBOL"]);
 assert.equal(result.entities[0].layerName,"A-WALL");
});
