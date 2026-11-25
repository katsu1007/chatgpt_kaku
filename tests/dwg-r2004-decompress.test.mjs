import test from "node:test";
import assert from "node:assert/strict";
import { decompressR2004Lz77, decompressR2004SystemPage } from "../original/dwg-r2004-decompress.js";
const ascii=s=>new Uint8Array([...s].map(c=>c.charCodeAt(0)));
test("copies initial literal run and stops at end marker",()=>{
 const r=decompressR2004Lz77(new Uint8Array([5,...ascii("ABCDEFGH"),0x11]),8);
 assert.equal(new TextDecoder().decode(r),"ABCDEFGH");assert.equal(r.diagnostics.literalBytes,8);
});
test("expands backward reference followed by literal",()=>{
 const r=decompressR2004Lz77(new Uint8Array([1,...ascii("ABCD"),0x41,1,0x21,0x11]),8);
 assert.equal(new TextDecoder().decode(r),"ABCDABC!");
});
test("supports overlapping LZ77 copies",()=>{
 const r=decompressR2004Lz77(new Uint8Array([1,...ascii("AAAA"),0x46,0,0x42,0x43,0x11]),9);
 assert.equal(new TextDecoder().decode(r),"AAAAAAABC");
});
test("decodes extended literal lengths",()=>{
 const r=decompressR2004Lz77(new Uint8Array([0,2,...ascii("12345678901234567890"),0x11]),20);
 assert.equal(new TextDecoder().decode(r),"12345678901234567890");
});
test("rejects invalid offsets, missing end marker and size mismatch",()=>{
 assert.throws(()=>decompressR2004Lz77(new Uint8Array([1,65,66,67,68,0x41,0,0x11]),7),/offset/);
 assert.throws(()=>decompressR2004Lz77(new Uint8Array([1,65,66,67,68]),4),/end marker/);
 assert.throws(()=>decompressR2004Lz77(new Uint8Array([5,...ascii("ABCDEFGH"),0x11]),9),/size mismatch/);
});
test("decodes R2004 system page payload with declared output size",()=>{
 const input=new Uint8Array(26),v=new DataView(input.buffer);
 v.setUint32(0,0x4163003b,true);v.setUint32(4,4,true);v.setUint32(8,6,true);v.setUint32(12,2,true);
 input.set([1,65,66,67,68,0x11],20);
 const page=decompressR2004SystemPage(input);
 assert.equal(new TextDecoder().decode(page.decompressedPayload),"ABCD");
});
