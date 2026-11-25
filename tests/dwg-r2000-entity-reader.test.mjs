import test from "node:test";
import assert from "node:assert/strict";
import { dwgR13Crc16, parseR13R15DwgHeader } from "../original/dwg-r13-container.js";
import { parseR2000EntityRecord, readR2000DrawingEntities } from "../original/dwg-r2000-entity-reader.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const raw=v=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);return bytesBits([...b]);};
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const handleBits=v=>{if(v===0)return [...bits(0,4),...bits(0,4)];const a=[];let n=v;while(n>0){a.unshift(n&255);n=Math.floor(n/256);}return [...bits(0,4),...bits(a.length,4),...bytesBits(a)];};
// Synthetic R2000 object with the R15 common-entity field order.
function lineRecord({handle=5,layer=200,noLinks=true,previous=0,next=0,owner=100}={}){
 const geometry=[1,...raw(100),0,0,...raw(200),0,0,1,1];
 const base=[0,1,...bits(19),...bytesBits([0,0,0,0]),...handleBits(handle),...bs(0),0,
  0,0,1,0,1,...bs(7),0,1,0,0,0,0,1,0,...bits(0),...geometry];
 const handleStartBit=16+base.length,rl=[handleStartBit&255,(handleStartBit>>>8)&255,(handleStartBit>>>16)&255,(handleStartBit>>>24)&255];
 base.splice(10,32,...bytesBits(rl));
 const refs=[...handleBits(owner),...handleBits(0)];
 if(!noLinks)refs.push(...handleBits(previous),...handleBits(next));
 refs.push(...handleBits(layer));
 const body=pack([...base,...refs]),out=new Uint8Array(2+body.length+2);
 out[0]=body.length&255;out[1]=body.length>>8;out.set(body,2);out.set([0x34,0x12],out.length-2);return out;
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
test("decodes R2000 common entity data, CMC color and LINE geometry",()=>{
 const r=parseR2000EntityRecord(lineRecord());
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
