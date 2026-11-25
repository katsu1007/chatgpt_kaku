import test from "node:test";
import assert from "node:assert/strict";
import { inspectCadFileHeader, getDwgVersionTable } from "../original/cad-format-probe.js";
const bytes=s=>new Uint8Array([...s].map(c=>c.charCodeAt(0)));
test("recognizes DWG release signatures without claiming entity decoding",()=>{
 for(const [code,version] of [["AC1012","R13"],["AC1015","R2000"],["AC1018","R2004"],["AC1021","R2007"],["AC1024","R2010"],["AC1027","R2013"],["AC1032","R2018"]]){
  const r=inspectCadFileHeader(bytes(code+"payload"),"drawing.dwg");
  assert.equal(r.format,"dwg");assert.equal(r.version,version);assert.equal(r.nativeDecodeReady,false);
 }
});
test("distinguishes legacy JWW and binary DXF signatures",()=>{
 assert.equal(inspectCadFileHeader(bytes("JwwData.payload"),"a.jww").format,"jww");
 assert.equal(inspectCadFileHeader(new Uint8Array([65,117,116,111,67,65,68,32,66,105,110,97,114,121,32,68,88,70,13,10,26,0]),"a.dxf").format,"dxf-binary");
});
test("unknown and truncated files are not misidentified as DWG",()=>{
 assert.equal(inspectCadFileHeader(bytes("AC10"),"x.dwg").format,"unknown");
 assert.equal(inspectCadFileHeader(bytes("garbage"),"x.bin").format,"unknown");
});
test("DWG version inventory is unique and complete for known signatures",()=>{
 const rows=getDwgVersionTable();assert.ok(rows.length>=10);assert.equal(new Set(rows.map(x=>x.versionCode)).size,rows.length);
});
