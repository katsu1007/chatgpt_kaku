import test from "node:test";
import assert from "node:assert/strict";
import { parseR2004DwgHeader, parseR2004SystemPageHeader, dwgCrc32 } from "../original/dwg-r2004-container.js";
const put32=(v,o,n)=>v.setUint32(o,n,true),put64=(v,o,n)=>v.setBigUint64(o,BigInt(n),true);
function makeR2004(){
 const file=new Uint8Array(0x100+0x200+24),v=new DataView(file.buffer);
 for(let i=0;i<6;i++)file[i]="AC1018".charCodeAt(i);
 file[0x0b]=3;file[0x0c]=1;put32(v,0x0d,0x180);file[0x11]=20;file[0x12]=2;v.setUint16(0x13,932,true);put32(v,0x18,0);put32(v,0x20,0x300);
 const p=new Uint8Array(0x6c),d=new DataView(p.buffer);
 const id="AcFssFcAJMB";for(let i=0;i<id.length;i++)p[i]=id.charCodeAt(i);
 put32(d,0x10,0x6c);put32(d,0x14,4);put32(d,0x28,9);put64(d,0x2c,0x123456n);put64(d,0x34,0x900n);
 put32(d,0x40,12);put32(d,0x50,10);put64(d,0x54,0x500n);put32(d,0x5c,11);put32(d,0x60,12);put32(d,0x64,2);
 put32(d,0x68,0);put32(d,0x68,dwgCrc32(p));
 let seed=1;for(let i=0;i<p.length;i++){seed=(Math.imul(seed,0x343fd)+0x269ec3)>>>0;file[0x80+i]=p[i]^((seed>>>16)&255);}
 put32(v,0x200,0x4163003b);put32(v,0x204,16);put32(v,0x208,4);put32(v,0x20c,2);put32(v,0x210,0xabcdef01);file.set([1,2,3,4],0x214);
 return file;
}
test("decrypts R2004 header and extracts section-map pointers",()=>{
 const result=parseR2004DwgHeader(makeR2004());
 assert.equal(result.container.fileId,"AcFssFcAJMB");assert.equal(result.container.sectionPageCount,12);
 assert.equal(result.container.sectionPageMapId,10);assert.equal(result.container.sectionPageMapAddress,0x600n);
 assert.equal(result.container.sectionMapId,11);assert.equal(result.container.crc.valid,true);
 assert.equal(result.diagnostics.sectionPayloadDecoded,false);
});
test("parses R2004 system page header and bounds-checks payload",()=>{
 const file=makeR2004(),page=parseR2004SystemPageHeader(file,0x200);
 assert.equal(page.knownType,"section-map");assert.equal(page.decompressedSize,16);
 assert.equal(page.compressedSize,4);assert.deepEqual([...page.payload],[1,2,3,4]);
 assert.throws(()=>parseR2004SystemPageHeader(file,file.length-5),/outside/);
});
test("rejects wrong versions and truncated R2004 headers",()=>{
 assert.throws(()=>parseR2004DwgHeader(new Uint8Array(20)),/truncated/);
 const bad=makeR2004();bad[0]=66;assert.throws(()=>parseR2004DwgHeader(bad),/requires AC1018/);
});
