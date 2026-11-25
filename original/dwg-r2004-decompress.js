// KAKU-owned R2004 DWG LZ77-derived section decompressor.
import { parseR2004SystemPageHeader } from "./dwg-r2004-container.js";
class Cursor {
 constructor(bytes){this.bytes=bytes;this.offset=0;}
 read(){if(this.offset>=this.bytes.length)throw new RangeError("DWG compressed stream ended unexpectedly");return this.bytes[this.offset++];}
 literals(n){if(n<0||this.offset+n>this.bytes.length)throw new RangeError("DWG literal run exceeds input");const a=this.bytes.slice(this.offset,this.offset+n);this.offset+=n;return a;}
}
function literalLength(c){const b=c.read();if(b>=0xf0)return{length:0,pending:b};if(b>0)return{length:b+3,pending:null};let n=15;for(;;){const x=c.read();if(x===0)n+=255;else{return{length:n+x+3,pending:null};}}}
function longOffset(c){const b=c.read();if(b)return b;let n=255;for(;;){const x=c.read();if(x===0)n+=255;else return n+x;}}
function twoByteOffset(c){const a=c.read(),b=c.read();return{offset:(a>>2)|(b<<6),literalCount:a&3};}
export function decompressR2004Lz77(input,expectedLength=null,{maxOutputLength=67108864}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),c=new Cursor(bytes);
 const limit=expectedLength==null?maxOutputLength:Math.min(maxOutputLength,expectedLength);
 if(!Number.isSafeInteger(limit)||limit<0)throw new RangeError("Invalid output limit");
 const out=[];let pending=null,ended=false,operations=0,literalBytes=0,backReferenceBytes=0;
 const literals=n=>{if(out.length+n>limit)throw new RangeError("DWG output exceeds declared size");for(const b of c.literals(n))out.push(b);literalBytes+=n;};
 const backref=(n,offset)=>{if(out.length+n>limit)throw new RangeError("DWG output exceeds declared size");if(!Number.isInteger(offset)||offset<1||offset>out.length)throw new Error("Invalid DWG back-reference offset "+offset);for(let i=0;i<n;i++)out.push(out[out.length-offset]);backReferenceBytes+=n;};
 const readLiteral=()=>{const r=literalLength(c);pending=r.pending;return r.length;};
 literals(readLiteral());
 while(c.offset<bytes.length||pending!==null){
  if(++operations>bytes.length*2+16)throw new Error("DWG decompression operation limit exceeded");
  const op=pending===null?c.read():pending;pending=null;if(op===0x11){ended=true;break;}
  let count,offset,lits;
  if(op===0x10){count=longOffset(c)+9;const p=twoByteOffset(c);offset=p.offset+0x3fff;lits=p.literalCount;}
  else if(op>=0x12&&op<=0x1f){count=(op&15)+2;const p=twoByteOffset(c);offset=p.offset+0x3fff;lits=p.literalCount;}
  else if(op===0x20){count=longOffset(c)+0x21;const p=twoByteOffset(c);offset=p.offset;lits=p.literalCount;}
  else if(op>=0x21&&op<=0x3f){count=op-0x1e;const p=twoByteOffset(c);offset=p.offset;lits=p.literalCount;}
  else if(op>=0x40){count=((op&0xf0)>>4)-1;const second=c.read();offset=(second<<2)|((op&0x0c)>>2);const low=op&3;lits=low===0?readLiteral():low;}
  else throw new Error("Unsupported R2004 compression opcode 0x"+op.toString(16));
  if(lits===0&&pending===null)lits=readLiteral();
  backref(count,offset);literals(lits);
 }
 if(!ended)throw new Error("R2004 compressed stream has no end marker");
 if(expectedLength!==null&&out.length!==expectedLength)throw new Error("DWG decompressed size mismatch: expected "+expectedLength+", got "+out.length);
 const result=new Uint8Array(out);
 Object.defineProperty(result,"diagnostics",{value:{operations,literalBytes,backReferenceBytes,compressedBytes:bytes.length,decompressedBytes:result.length}});
 return result;
}
export function decompressR2004SystemPage(input,offset=0){
 const page=parseR2004SystemPageHeader(input,offset);
 if(page.compressionType!==2)throw new Error("Unsupported R2004 system page compression type "+page.compressionType);
 const data=decompressR2004Lz77(page.payload,page.decompressedSize);
 return {...page,decompressedPayload:data,diagnostics:data.diagnostics};
}
