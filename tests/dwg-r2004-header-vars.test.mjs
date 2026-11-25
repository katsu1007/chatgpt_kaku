import test from "node:test";
import assert from "node:assert/strict";
import { R2004_HEADER_FIELDS, parseR2004HeaderVariables, resolveDwgInsunits } from "../original/dwg-r2004-header-vars.js";
const START=[0xcf,0x7b,0x1f,0x23,0xfd,0xde,0x38,0xa9,0x5f,0x7c,0x68,0xb8,0x4e,0x6d,0x33,0x5f];
const END=[0x30,0x84,0xe0,0xdc,0x02,0x21,0xc7,0x56,0xa0,0x83,0x97,0x47,0xb1,0x92,0xcc,0xa0];
const bits=(v,n=8)=>Array.from({length:n},(_,i)=>(v>>(n-1-i))&1);
const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
function makeHeader(insunits=4,optionalTail=false){
 const stream=[];
 for(const f of R2004_HEADER_FIELDS){
  if(f.name==="INSUNITS")stream.push(0,1,...bits(insunits));
  else if(f.type==="B")stream.push(0);
  else if(f.type==="BS"||f.type==="BL"||f.type==="BD"||f.type==="TV")stream.push(1,0);
  else if(f.type==="CMC")stream.push(1,0,1,0,...bits(0));
  else if(f.type==="H")stream.push(...bits(0,4),...bits(0,4));
  else if(f.type==="HANDLEED")stream.push(...bits(0));
  else if(f.type==="3BD")stream.push(1,0,1,0,1,0);
  else if(f.type==="2RD")stream.push(...Array(128).fill(0));
  else if(f.type==="RC")stream.push(...bits(0));
  else if(f.type==="RS")stream.push(...Array(16).fill(0));
 }
 if(optionalTail)stream.push(1,0,1,0,1,0,1,0);
 const data=pack(stream),out=new Uint8Array(16+4+data.length+2+16),v=new DataView(out.buffer);
 out.set(START,0);v.setUint32(16,data.length,true);out.set(data,20);out.set(END,22+data.length);return out;
}
test("walks the R2004 header variable stream and extracts INSUNITS",()=>{
 const result=parseR2004HeaderVariables(makeHeader(4));
 assert.equal(result.insunits,4);assert.equal(result.units.name,"millimeters");assert.equal(result.units.scaleToMm,1);
 assert.equal(result.endingSentinelValid,true);assert.equal(result.diagnostics.fieldCount,R2004_HEADER_FIELDS.length);
});
test("resolves supported INSUNITS codes to millimeter scale",()=>{
 assert.equal(resolveDwgInsunits(1).scaleToMm,25.4);assert.equal(resolveDwgInsunits(2).scaleToMm,304.8);
 assert.equal(resolveDwgInsunits(6).scaleToMm,1000);assert.equal(resolveDwgInsunits(21).name,"US survey feet");
 assert.equal(resolveDwgInsunits(0).known,false);
});
test("rejects truncated or invalid header-variable sections",()=>{
 assert.throws(()=>parseR2004HeaderVariables(new Uint8Array(20)),/truncated/);
 const bad=makeHeader(4);bad[0]=0;assert.throws(()=>parseR2004HeaderVariables(bad),/sentinel/);
 const truncated=makeHeader(4).slice(0,30);assert.throws(()=>parseR2004HeaderVariables(truncated),/truncated|size/);
});

test("accepts optional R14+ header tail fields before the CRC",()=>{
 const result=parseR2004HeaderVariables(makeHeader(6,true));
 assert.equal(result.insunits,6);assert.equal(result.units.scaleToMm,1000);assert.equal(result.optionalTail,true);
});
