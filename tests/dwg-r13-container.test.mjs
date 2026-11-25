import test from "node:test";
import assert from "node:assert/strict";
import { dwgR13Crc16, parseR13R15DwgHeader, readR13R15ObjectMap } from "../original/dwg-r13-container.js";
const END=[0x95,0xa0,0x4e,0x28,0x99,0x82,0x1a,0xe5,0x5e,0x41,0xe0,0x5f,0x9d,0x3a,0x4d,0x00];
const put32=(v,o,n)=>v.setUint32(o,n,true);
function mc(value){
 const negative=value<0;let n=Math.abs(value),groups=[];
 do{groups.push(n%128);n=Math.floor(n/128);}while(n>0);
 if(!negative&&(groups.at(-1)&64))groups.push(0);
 if(negative)groups[groups.length-1]|=64;
 return groups.map((v,i)=>i<groups.length-1?v|128:v);
}
function mapBlock(pairs,crc=0x1234){
 const body=pairs.flatMap(([h,l])=>[...mc(h),...mc(l)]),size=body.length+2;
 return [size>>8,size&255,...body,crc>>8,crc&255];
}
const mapBytes=()=>new Uint8Array([...mapBlock([[5,0x80]]),0,2,0,0]);
function makeFile(version="AC1015",count=3){
 const file=new Uint8Array(0x180),view=new DataView(file.buffer);
 for(let i=0;i<6;i++)file[i]=version.charCodeAt(i);
 put32(view,0x0d,0x100);view.setUint16(0x13,932,true);put32(view,0x15,count);
 const locators=[[0,0x80,16],[1,0x90,16],[2,0xa0,mapBytes().length]];
 for(let i=0;i<count;i++){const [id,offset,size]=locators[i];const p=0x19+i*9;file[p]=id;put32(view,p+1,offset);put32(view,p+5,size);}
 const crcOffset=0x19+count*9,crc=(dwgR13Crc16(file.subarray(0,crcOffset))^({3:0xa598,4:0x8101,5:0x3cc4,6:0x8461}[count]))&0xffff;
 view.setUint16(crcOffset,crc,true);file.set(END,crcOffset+2);
 file.set(mapBytes(),0xa0);return file;
}
test("parses AC1012, AC1014 and AC1015 section locator tables",()=>{
 for(const version of ["AC1012","AC1014","AC1015"]){
  const file=makeFile(version),header=parseR13R15DwgHeader(file);
  assert.equal(header.versionCode,version);assert.equal(header.fileHeader.codePage,932);
  assert.equal(header.sections[0].offset,0x80);assert.equal(header.sections[2].name,"object-map");
  assert.equal(header.headerCrc.valid,true);assert.equal(header.diagnostics.entityRecordsDecoded,false);
 }
});
test("reads legacy object map while preserving absolute file offsets",()=>{
 const file=makeFile(),header=parseR13R15DwgHeader(file),map=readR13R15ObjectMap(file,header);
 assert.equal(map.entries.length,1);assert.equal(map.entries[0].handle,5n);
 assert.equal(map.entries[0].offset,128n);assert.equal(map.section.offset,0xa0);
});
test("rejects invalid version, locator count, missing required sections and out-of-bounds ranges",()=>{
 assert.throws(()=>parseR13R15DwgHeader(new Uint8Array(10)),/truncated/);
 const wrong=makeFile("AC1018");assert.throws(()=>parseR13R15DwgHeader(wrong),/requires AC1012/);
 const count=makeFile();new DataView(count.buffer).setUint32(0x15,7,true);assert.throws(()=>parseR13R15DwgHeader(count),/locator count/);
 const range=makeFile();new DataView(range.buffer).setUint32(0x19+2*9+1,0x170,true);new DataView(range.buffer).setUint32(0x19+2*9+5,0x40,true);assert.throws(()=>parseR13R15DwgHeader(range),/exceeds file bounds/);
 const missing=makeFile();missing[0x19+2*9]=4;const crcOffset=0x19+3*9,crc=(dwgR13Crc16(missing.subarray(0,crcOffset))^0xa598)&0xffff;new DataView(missing.buffer).setUint16(crcOffset,crc,true);assert.throws(()=>parseR13R15DwgHeader(missing),/missing a required/);
});
test("reports a bad locator CRC without hiding the parsed sections",()=>{
 const file=makeFile();file[0x19+3*9]^=0x01;
 const header=parseR13R15DwgHeader(file);assert.equal(header.headerCrc.valid,false);assert.equal(header.sections[2].offset,0xa0);
});
