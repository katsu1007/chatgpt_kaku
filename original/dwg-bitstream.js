// KAKU-owned DWG bitstream primitives.
export class DwgBitReader {
 constructor(input,{bitOffset=0}={}) { this.bytes=input instanceof Uint8Array?input:new Uint8Array(input||0); this.bitOffset=bitOffset; if(!Number.isInteger(bitOffset)||bitOffset<0||bitOffset>this.bytes.length*8) throw new RangeError('DWG bit offset outside buffer'); }
 get remainingBits(){return this.bytes.length*8-this.bitOffset;}
 get byteOffset(){return Math.floor(this.bitOffset/8);}
 readBit(){if(this.remainingBits<1)throw new RangeError('DWG stream ended while reading a bit');const b=this.bytes[this.bitOffset>>3],s=7-(this.bitOffset&7);this.bitOffset++;return (b>>s)&1;}
 readBits(n){if(!Number.isInteger(n)||n<0||n>53)throw new RangeError('Invalid bit count');if(this.remainingBits<n)throw new RangeError('DWG stream ended while reading bits');let v=0;for(let i=0;i<n;i++)v=v*2+this.readBit();return v;}
 readBytes(n){if(!Number.isInteger(n)||n<0||this.remainingBits<n*8)throw new RangeError('DWG stream ended while reading bytes');const a=new Uint8Array(n);for(let i=0;i<n;i++)a[i]=this.readBits(8);return a;}
 readRawShort(){const b=this.readBytes(2);return b[0]|b[1]<<8;}
 readRawLong(){const b=this.readBytes(4);return b[0]|b[1]<<8|b[2]<<16|b[3]<<24;}
 readRawDouble(){const b=this.readBytes(8);return new DataView(b.buffer,b.byteOffset,b.byteLength).getFloat64(0,true);}
 readBitShort(){const c=this.readBits(2);return c===0?this.readRawShort():c===1?this.readBits(8):c===2?0:256;}
 readBitLong(){const c=this.readBits(2);if(c===0)return this.readRawLong();if(c===1)return this.readBits(8);if(c===2)return 0;throw new Error('Reserved DWG bitlong opcode 11');}
 readBitDouble(){const c=this.readBits(2);if(c===0)return this.readRawDouble();if(c===1)return 1;if(c===2)return 0;throw new Error('Reserved DWG bitdouble opcode 11');}
 readRawChar(){return this.readBits(8);}
 readText(maxBytes=65535){const length=this.readBitShort();if(length<0||length>maxBytes)throw new RangeError('Invalid DWG text length '+length);return new TextDecoder('windows-1252').decode(this.readBytes(length));}
 read2BD(){return [this.readBitDouble(),this.readBitDouble()];}
 read3BD(){return [this.readBitDouble(),this.readBitDouble(),this.readBitDouble()];}
 read2RD(){return [this.readRawDouble(),this.readRawDouble()];}
 read3RD(){return [this.readRawDouble(),this.readRawDouble(),this.readRawDouble()];}
 read3B(){let value=0;for(let i=0;i<3;i++){const bit=this.readBit();value=(value<<1)|bit;if(!bit)break;}return value;}
 readBitDoubleWithDefault(defaultValue){
  const code=this.readBits(2);if(code===0)return defaultValue;if(code===3)return this.readRawDouble();
  const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,defaultValue,true);
  const bytes=new Uint8Array(buffer);
  if(code===1){const patch=this.readBytes(4);bytes.set(patch,0);}
  else{const patch=this.readBytes(6);bytes.set(patch.slice(0,2),4);bytes.set(patch.slice(2,6),0);}
  return view.getFloat64(0,true);
 }
 readBitThickness(){return this.readBit()?0:this.readBitDouble();}
 readBitExtrusion(){return this.readBit()?[0,0,1]:this.read3BD();}
 readModularShort(){if(this.bitOffset&7)throw new Error("DWG modular short must start on a byte boundary");let value=0n,scale=1n,count=0;for(;;){if(count++>=4)throw new Error("DWG modular short exceeds 4 words");const b=this.readBytes(2),word=b[0]|(b[1]<<8);value+=BigInt(word&0x7fff)*scale;scale*=32768n;if(!(word&0x8000))break;}return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):value;}
 readModularChar(){if(this.bitOffset&7)throw new Error('DWG modular char must start on a byte boundary');let v=0,s=0,last=0,n=0;do{if(n++>=8)throw new Error('DWG modular char exceeds 8 bytes');last=this.readBits(8);let payload=last&127;if(!(last&128)&&(last&64))payload&=63;v+=payload*Math.pow(128,s++);}while(last&128);return last&64?-v:v;}
 readHandle(reference=0n){if(typeof reference!=='bigint')reference=BigInt(reference);const code=this.readBits(4),length=this.readBits(4);let value=0n;for(let i=0;i<length;i++)value=value<<8n|BigInt(this.readBits(8));if(code===6&&length===0)value=reference+1n;else if(code===8&&length===0)value=reference-1n;else if(code===10)value=reference+value;else if(code===12)value=reference-value;else if(![0,2,3,4,5].includes(code))throw new Error('Unsupported DWG handle code');return {code,length,value,hex:value.toString(16).toUpperCase()};}
}
