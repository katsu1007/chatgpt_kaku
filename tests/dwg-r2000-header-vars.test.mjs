import test from "node:test";
import assert from "node:assert/strict";
import { parseR2000HeaderVariables, R2000_HEADER_FIELDS } from "../original/dwg-r2000-header-vars.js";
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1),bytesBits=a=>a.flatMap(v=>bits(v));
const bs=v=>v===0?[1,0]:[0,1,...bits(v)];
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const START=[0xcf,0x7b,0x1f,0x23,0xfd,0xde,0x38,0xa9,0x5f,0x7c,0x68,0xb8,0x4e,0x6d,0x33,0x5f];
const END=[0x30,0x84,0xe0,0xdc,0x02,0x21,0xc7,0x56,0xa0,0x83,0x97,0x47,0xb1,0x92,0xcc,0xa0];
function makeHeader(insunits=4){
 const data=[];
 for(const field of R2000_HEADER_FIELDS){
  if(field.name==="INSUNITS"){data.push(...bs(insunits));continue;}
  if(field.name==="CEPSNTYPE"){data.push(...bs(0));continue;}
  if(field.name==="HEADER_FLAGS"){data.push(...bs(0));continue;}
  switch(field.type){
   case "B":data.push(0);break;
   case "BS":case "BL":case "BD":case "TV":case "CMC":data.push(1,0);break;
   case "H":data.push(...bits(0,8));break;
   case "3BD":data.push(1,0,1,0,1,0);break;
   case "2RD":data.push(...new Array(16).fill(0).flatMap(()=>bits(0)));break;
   case "RC":data.push(...bits(0));break;
   case "RS":data.push(...bytesBits([0,0]));break;
   default:throw new Error("Unknown fixture field "+field.type);
  }
 }
 const dataBytes=pack(data),sectionSize=dataBytes.length+2,file=new Uint8Array(16+4+sectionSize+16);
 file.set(START,0);new DataView(file.buffer).setUint32(16,sectionSize,true);file.set(dataBytes,20);
 new DataView(file.buffer).setUint16(20+dataBytes.length,0x1234,true);file.set(END,20+sectionSize);return file;
}
test("R2000 header field order excludes R2004-only fields and retains INSUNITS",()=>{
 const names=R2000_HEADER_FIELDS.map(x=>x.name);
 assert.ok(names.includes("INSUNITS"));assert.ok(names.includes("HEADER_FLAGS"));
 assert.ok(!names.some(x=>x.startsWith("R2004_")));
 assert.ok(!names.includes("DICT_MATERIALS"));assert.ok(!names.includes("SORTENTS"));
});
test("reads and validates R2000 INSUNITS from the header variable section",()=>{
 const result=parseR2000HeaderVariables(makeHeader(4));
 assert.equal(result.insunits,4);assert.equal(result.units.known,true);assert.equal(result.units.scaleToMm,1);
 assert.equal(result.endingSentinelValid,true);assert.equal(result.diagnostics.formatFamily,"R2000");
});
test("keeps unitless drawings unscaled and rejects a damaged ending sentinel",()=>{
 const unitless=parseR2000HeaderVariables(makeHeader(0));assert.equal(unitless.units.known,false);assert.equal(unitless.units.scaleToMm,null);
 const damaged=makeHeader(4);damaged[damaged.length-1]^=1;
 const invalid=parseR2000HeaderVariables(damaged);assert.equal(invalid.endingSentinelValid,false);assert.equal(invalid.units.known,false);
});
