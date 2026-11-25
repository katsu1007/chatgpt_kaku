import test from "node:test";
import assert from "node:assert/strict";
import { readR2004SectionContent } from "../original/dwg-r2004-section-reader.js";
const put32=(v,o,n)=>v.setUint32(o,n>>>0,true);
const checksum=(seed,b)=>{let a=seed&65535,c=seed>>>16;for(let st=0;st<b.length;st+=0x1560){for(let i=st;i<Math.min(b.length,st+0x1560);i++){a+=b[i];c+=a;}a%=0xfff1;c%=0xfff1;}return((c<<16)|(a&65535))>>>0;};
const ascii=s=>new Uint8Array([...s].map(c=>c.charCodeAt(0)));
function writePage(file,offset,sectionId,startOffset,payload,decompressedSize){
 const h=new Uint8Array(32),v=new DataView(h.buffer);
 put32(v,0,0x4163043b);put32(v,4,sectionId);put32(v,8,payload.length);put32(v,12,decompressedSize);put32(v,16,startOffset);put32(v,24,checksum(0,payload));put32(v,20,checksum(v.getUint32(24,true),h));
 const mask=(0x4164536b^offset)>>>0,d=new DataView(file.buffer);
 for(let p=0;p<32;p+=4)put32(d,offset+p,(v.getUint32(p,true)^mask)>>>0);
 file.set(payload,offset+32);
}
const compressed=s=>new Uint8Array([1,...ascii(s),0x11]);
const section=(size,compressedFlag,pages)=>({name:"AcDb:AcDbObjects",size:BigInt(size),compressed:compressedFlag,encrypted:0,sectionId:7,pages});
test("assembles one compressed R2004 page into its logical section",()=>{
 const file=new Uint8Array(0x300),payload=compressed("ABCD");writePage(file,0x100,7,0,payload,4);
 const result=readR2004SectionContent(file,section(4,2,[{pageId:1,fileOffset:0x100,compressedSize:payload.length,startOffset:0}]));
 assert.equal(new TextDecoder().decode(result.data),"ABCD");assert.equal(result.diagnostics.pageCount,1);
});
test("assembles multiple pages in logical offset order",()=>{
 const file=new Uint8Array(0x400),a=compressed("ABCD"),b=compressed("EFGH");
 writePage(file,0x100,7,0,a,4);writePage(file,0x200,7,4,b,4);
 const result=readR2004SectionContent(file,section(8,2,[
  {pageId:1,fileOffset:0x100,compressedSize:a.length,startOffset:0},
  {pageId:2,fileOffset:0x200,compressedSize:b.length,startOffset:4}
 ]));
 assert.equal(new TextDecoder().decode(result.data),"ABCDEFGH");assert.equal(result.diagnostics.coveredBytes,8);
});
test("supports uncompressed sections",()=>{
 const file=new Uint8Array(0x300),payload=ascii("WALL");writePage(file,0x100,7,0,payload,4);
 const result=readR2004SectionContent(file,section(4,1,[{pageId:1,fileOffset:0x100,compressedSize:4,startOffset:0}]));
 assert.equal(new TextDecoder().decode(result.data),"WALL");
});
test("rejects corrupt checksums, overlapping pages and encrypted sections",()=>{
 const file=new Uint8Array(0x300),payload=compressed("ABCD");writePage(file,0x100,7,0,payload,4);file[0x100+32]^=1;
 assert.throws(()=>readR2004SectionContent(file,section(4,2,[{pageId:1,fileOffset:0x100,compressedSize:payload.length,startOffset:0}])),/checksum/);
 assert.throws(()=>readR2004SectionContent(file,section(8,2,[
  {pageId:1,fileOffset:0x100,compressedSize:payload.length,startOffset:0},
  {pageId:2,fileOffset:0x100,compressedSize:payload.length,startOffset:0}
 ])),/checksum|Overlapping/);
 assert.throws(()=>readR2004SectionContent(file,{...section(4,2,[]),encrypted:1}),/Encrypted/);
});
test("enforces section allocation limits and page bounds",()=>{
 assert.throws(()=>readR2004SectionContent(new Uint8Array(0),section(1000,2,[]),{maxSectionBytes:10}),/size limit/);
 assert.throws(()=>readR2004SectionContent(new Uint8Array(10),section(4,2,[{pageId:1,fileOffset:99,compressedSize:5,startOffset:0}])),/outside file/);
});
