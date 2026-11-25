import test from "node:test";
import assert from "node:assert/strict";
import { DwgBitReader } from "../original/dwg-bitstream.js";
const pack=bits=>{const out=new Uint8Array(Math.ceil(bits.length/8));bits.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
const bytesBits=bytes=>Array.from(bytes).flatMap(b=>Array.from({length:8},(_,i)=>(b>>(7-i))&1));
const bits=(value,n)=>Array.from({length:n},(_,i)=>(value>>(n-1-i))&1);
const reader=(...bytes)=>new DwgBitReader(new Uint8Array(bytes));
test("reads bits most-significant-bit first across byte boundaries",()=>{const r=reader(0b10110010,0b01100000);assert.equal(r.readBits(4),11);assert.equal(r.readBits(6),0b001001);});
test("decodes bitshort compact and raw forms",()=>{
 assert.equal(reader(0b10000000).readBitShort(),0);assert.equal(reader(0b11000000).readBitShort(),256);assert.equal(new DwgBitReader(pack([0,1,...bits(0x55,8)])).readBitShort(),0x55);
 assert.equal(new DwgBitReader(pack([0,0,...bytesBits([0x34,0x12])])).readBitShort(),0x1234);
});
test("decodes bitlong compact, zero and raw forms",()=>{
 assert.equal(new DwgBitReader(pack([0,1,...bits(0x4a,8)])).readBitLong(),0x4a);assert.equal(reader(0b10000000).readBitLong(),0);
 assert.equal(new DwgBitReader(pack([0,0,...bytesBits([0x78,0x56,0x34,0x12])])).readBitLong(),0x12345678);
 assert.throws(()=>reader(0b11000000).readBitLong(),/Reserved/);
});
test("decodes bitdouble compact and IEEE little-endian forms",()=>{
 assert.equal(reader(0b01000000).readBitDouble(),1);assert.equal(reader(0b10000000).readBitDouble(),0);
 const raw=new Uint8Array(8);new DataView(raw.buffer).setFloat64(0,12.5,true);
 assert.equal(new DwgBitReader(pack([0,0,...bytesBits(raw)])).readBitDouble(),12.5);
});
test("decodes modular chars including multi-byte and negative forms",()=>{
 assert.equal(reader(0x82,0x24).readModularChar(),4610);assert.equal(reader(0x85,0x4b).readModularChar(),-1413);
});
test("decodes absolute and relative handle references",()=>{
 assert.deepEqual(reader(0x52,0x05,0xe7).readHandle(),{code:5,length:2,value:1511n,hex:"5E7"});
 assert.equal(reader(0x60).readHandle(99n).value,100n);assert.equal(reader(0x80).readHandle(99n).value,98n);
 assert.equal(reader(0xa1,0x05).readHandle(100n).value,105n);assert.equal(reader(0xc1,0x05).readHandle(100n).value,95n);
});
test("bounds checks fail clearly and modular chars require byte alignment",()=>{
 assert.throws(()=>reader(0).readBits(9),/ended/);
 assert.throws(()=>new DwgBitReader(new Uint8Array([0,0]),{bitOffset:1}).readModularChar(),/byte boundary/);
});

test("decodes modular shorts using 15-bit little-endian groups",()=>{
 assert.equal(reader(0x05,0x00).readModularShort(),5);
 assert.equal(reader(0x31,0xf4,0x8d,0x00).readModularShort(),4650033);
 assert.throws(()=>reader(0x01,0x80).readModularShort(),/ended/);
});
test("reads absolute object handles with code zero",()=>{
 assert.deepEqual(reader(0x01,0x7f).readHandle(),{code:0,length:1,value:127n,hex:"7F"});
});

test("decodes bit-double-with-default patch forms",()=>{
 const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
 const bits=v=>Array.from({length:8},(_,i)=>(v>>(7-i))&1),bytesBits=a=>a.flatMap(bits);
 assert.equal(new DwgBitReader(new Uint8Array([0])).readBitDoubleWithDefault(5.5),5.5);
 const onePatch=pack([0,1,...bytesBits([1,0,0,0])]);
 assert.ok(Math.abs(new DwgBitReader(onePatch).readBitDoubleWithDefault(1.0)-1.0000000000000002)<1e-15);
 const sixPatch=pack([1,0,...bytesBits([0,0,1,0,0,0])]);
 assert.equal(new DwgBitReader(sixPatch).readBitDoubleWithDefault(1.0),1.0000000000000002);
 const raw=new Uint8Array(8);new DataView(raw.buffer).setFloat64(0,2.5,true);
 assert.equal(new DwgBitReader(pack([1,1,...bytesBits([...raw])])).readBitDoubleWithDefault(1),2.5);
});
test("decodes thickness, extrusion and bit triplets",()=>{
 const pack=a=>{const out=new Uint8Array(Math.ceil(a.length/8));a.forEach((v,i)=>{if(v)out[i>>3]|=1<<(7-(i&7));});return out;};
 assert.equal(new DwgBitReader(new Uint8Array([0x80])).readBitThickness(),0);
 assert.deepEqual(new DwgBitReader(new Uint8Array([0x80])).readBitExtrusion(),[0,0,1]);
 assert.equal(new DwgBitReader(new Uint8Array([0b10100000])).read3B(),2);
 const extrusionBits=[0,0,1,0,1,0,1];
 assert.deepEqual(new DwgBitReader(pack(extrusionBits)).readBitExtrusion(),[1,1,1]);
});
