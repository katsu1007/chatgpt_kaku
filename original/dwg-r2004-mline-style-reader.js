// KAKU-owned R2004 MLINESTYLE object reader.
import { DwgBitReader } from "./dwg-bitstream.js?v=20261125-codepage1";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
function readColor(reader){
 const colorIndex=reader.readBitShort(),rgb=reader.readBitLong(),colorFlags=reader.readRawChar();
 const colorName=colorFlags&1?reader.readText(4096):null,bookName=colorFlags&2?reader.readText(4096):null;
 return {colorIndex,rgb,colorFlags,colorName,bookName};
}
export function parseR2004MLineStyleRecord(input,offset=0,{maxEedBytes=1024*1024,maxElements=64,textEncoding="windows-1252"}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),env=parseR2004ObjectRecordEnvelope(bytes,offset);
 if(env.objectType!==73)throw new Error("R2004 MLINESTYLE parser requires object type 73");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8,textEncoding});
 r.readModularShort();r.readBitShort();const objectDataBits=r.readRawLong(),selfHandle=r.readHandle();
 const eedSize=r.readBitShort();if(eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2004 MLINESTYLE EED size");
 const eed=r.readBytes(eedSize),reactorCount=r.readBitLong(),xdictionaryMissing=r.readBit()===1;
 if(reactorCount<0||reactorCount>100000)throw new RangeError("Invalid R2004 MLINESTYLE reactor count");
 const name=r.readText(4096),description=r.readText(16384),flags=r.readBitShort(),fillColor=readColor(r),startAngle=r.readBitDouble(),endAngle=r.readBitDouble(),elementCount=r.readRawChar();
 if(elementCount<0||elementCount>maxElements)throw new RangeError("Invalid R2004 MLINESTYLE element count");
 const elements=[];
 for(let i=0;i<elementCount;i++)elements.push({offset:r.readBitDouble(),color:readColor(r),linetypeIndex:r.readBitShort()});
 const handleBitOffset=offset*8+objectDataBits;
 if(r.bitOffset>handleBitOffset||handleBitOffset>env.recordEnd*8-16)throw new Error("Invalid R2004 MLINESTYLE handle-stream offset");
 r.bitOffset=handleBitOffset;
 const parentHandle=r.readHandle(selfHandle.value),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(r.readHandle(selfHandle.value));
 const xdictionary=xdictionaryMissing?null:r.readHandle(selfHandle.value);
 return {...env,handle:selfHandle.value,handleHex:selfHandle.hex,name,description,flags,fillColor,startAngle,endAngle,elements,eed,reactorCount,xdictionaryMissing,
  parentHandle,reactors,xdictionary,handleBitOffset,diagnostics:{...env.diagnostics,mlineStyleDecoded:true,elementCount:elements.length}};
}
export function readR2004MLineStyleRecords(sectionBytes,objectMap,options){
 const styles=[];
 for(const item of objectMap.entries){
  const offset=Number(item.offset),env=parseR2004ObjectRecordEnvelope(sectionBytes,offset);
  if(env.objectType!==73)continue;
  const style=parseR2004MLineStyleRecord(sectionBytes,offset,options);
  if(style.handle!==BigInt(item.handle))throw new Error("R2004 MLINESTYLE object-map handle mismatch");
  styles.push(style);
 }
 return {styles,byHandle:new Map(styles.map(style=>[style.handle.toString(),style])),byName:new Map(styles.map(style=>[style.name,style])),
  diagnostics:{mlineStyleCount:styles.length}};
}
