import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004SectionPageMap, parseR2004SectionMap, resolveR2004SectionPages, parseR2004DataPageHeader, decodeR2004DataPage, readR2004SectionMaps } from "../original/dwg-r2004-sections.js";
const put32=(v,o,n)=>v.setUint32(o,n>>>0,true),put64=(v,o,n)=>v.setBigUint64(o,BigInt(n),true);
const checksum=(seed,b)=>{let a=seed&65535,c=seed>>>16;for(let st=0;st<b.length;st+=0x1560){for(let i=st;i<Math.min(b.length,st+0x1560);i++){a+=b[i];c+=a;}a%=0xfff1;c%=0xfff1;}return((c<<16)|(a&65535))>>>0;};
function sectionMapBytes(){
 const b=new Uint8Array(132),v=new DataView(b.buffer);put32(v,0,1);put32(v,4,2);put32(v,8,0x7400);put32(v,16,1);
 put64(v,20,0x1000);put32(v,28,1);put32(v,32,0x7400);put32(v,36,0);put32(v,40,2);put32(v,44,1);put32(v,48,0);
 const name="AcDb:AcDbObjects";for(let i=0;i<name.length;i++)b[52+i]=name.charCodeAt(i);
 put32(v,116,2);put32(v,120,24);put64(v,124,0);return b;
}
function compressLiteral(bytes){
 const n=bytes.length;if(n<=18)return new Uint8Array([n-3,...bytes,0x11]);
 if(n<=273)return new Uint8Array([0,n-18,...bytes,0x11]);
 throw new Error("test fixture too large");
}
function systemPage(offset,type,payload,decompressedSize){
 const out=new Uint8Array(offset+20+payload.length),v=new DataView(out.buffer);
 put32(v,offset,type);put32(v,offset+4,decompressedSize);put32(v,offset+8,payload.length);put32(v,offset+12,2);out.set(payload,offset+20);return out;
}
test("parses global page map entries, gaps and absolute file offsets",()=>{
 const b=new Uint8Array(8+8+24),v=new DataView(b.buffer);
 put32(v,0,1);put32(v,4,0x20);put32(v,8,2);put32(v,12,0x30);put32(v,16,-3);put32(v,20,0x10);
 put32(v,24,7);put32(v,28,8);put32(v,32,9);put32(v,36,0);
 const map=parseR2004SectionPageMap(b);
 assert.equal(map.entries[0].fileOffset,0x100);assert.equal(map.byPageId.get(2).fileOffset,0x120);
 assert.equal(map.byPageId.get(3).isGap,true);assert.equal(map.byPageId.get(3).tree.right,9);
});
test("parses section descriptors and resolves local page references",()=>{
 const bytes=sectionMapBytes(),map=parseR2004SectionMap(bytes);
 assert.equal(map.sections[0].name,"AcDb:AcDbObjects");assert.equal(map.sections[0].size,0x1000n);
 const global=parseR2004SectionPageMap(new Uint8Array([1,0,0,0,0x20,0,0,0,2,0,0,0,0x30,0,0,0]));
 const resolved=resolveR2004SectionPages(map,global);
 assert.equal(resolved[0].pages[0].fileOffset,0x120);
});
test("decrypts data page header and verifies data/header checksums",()=>{
 const file=new Uint8Array(0x200+32+6),v=new DataView(file.buffer),offset=0x200,payload=new Uint8Array([1,65,66,67,68,0x11]);
 const h=new Uint8Array(32),d=new DataView(h.buffer);
 put32(d,0,0x4163043b);put32(d,4,1);put32(d,8,payload.length);put32(d,12,4);put32(d,16,0);put32(d,24,checksum(0,payload));
 put32(d,20,checksum(d.getUint32(24,true),h));
 const mask=(0x4164536b^offset)>>>0;
 for(let p=0;p<32;p+=4)put32(v,offset+p,(new DataView(h.buffer).getUint32(p,true)^mask)>>>0);
 file.set(payload,offset+32);
 const parsed=parseR2004DataPageHeader(file,offset);
 assert.equal(parsed.pageType,0x4163043b);assert.equal(parsed.checksums.dataValid,true);assert.equal(parsed.checksums.headerValid,true);
 assert.equal(new TextDecoder().decode(decodeR2004DataPage(file,offset).decompressedPayload),"ABCD");
});
test("walks the R2004 system page map into the section map",()=>{
 const pageMapBytes=new Uint8Array(24),pv=new DataView(pageMapBytes.buffer);
 for(let i=0;i<3;i++){put32(pv,i*8,i+1);put32(pv,i*8+4,0x100);}
 const pageMapCompressed=compressLiteral(pageMapBytes),sectionBytes=sectionMapBytes(),sectionCompressed=compressLiteral(sectionBytes);
 const file=new Uint8Array(0x400);
 const writePage=(offset,type,payload,decodedSize)=>{const v=new DataView(file.buffer);put32(v,offset,type);put32(v,offset+4,decodedSize);put32(v,offset+8,payload.length);put32(v,offset+12,2);file.set(payload,offset+20);};
 writePage(0x200,0x41630e3b,pageMapCompressed,pageMapBytes.length);
 writePage(0x300,0x4163003b,sectionCompressed,sectionBytes.length);
 const result=readR2004SectionMaps(file,{container:{sectionPageMapAddress:0x200n,sectionMapId:3}});
 assert.equal(result.pageMap.entries.length,3);assert.equal(result.sectionMap.sections[0].name,"AcDb:AcDbObjects");
 assert.equal(result.resolvedSections[0].pages[0].fileOffset,0x200);
});
test("rejects malformed maps and missing referenced pages",()=>{
 assert.throws(()=>parseR2004SectionPageMap(new Uint8Array([1,2])),/Truncated/);
 const m=sectionMapBytes(),section=parseR2004SectionMap(m);
 assert.throws(()=>resolveR2004SectionPages(section,parseR2004SectionPageMap(new Uint8Array(0))),/Missing global page/);
});
