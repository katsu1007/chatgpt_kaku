// KAKU-owned R2004 BLOCK_HEADER object decoder.
import { DwgBitReader } from "./dwg-bitstream.js";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
export function parseR2004BlockHeaderRecord(input,offset=0,{maxEedBytes=1024*1024,maxPreviewBytes=16*1024*1024,maxOwnedObjects=100000,maxInserts=100000}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),env=parseR2004ObjectRecordEnvelope(bytes,offset);
 if(env.objectType!==49)throw new Error("R2004 block-header parser requires object type 49");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8});
 r.readModularShort();r.readBitShort();const objectDataBits=r.readRawLong(),selfHandle=r.readHandle();
 const eedSize=r.readBitShort();if(eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2004 BLOCK_HEADER EED size");
 const eed=r.readBytes(eedSize),reactorCount=r.readBitLong(),xdictionaryMissing=r.readBit()===1;
 if(reactorCount<0||reactorCount>maxOwnedObjects)throw new RangeError("Invalid R2004 BLOCK_HEADER reactor count");
 const name=r.readText(4096),is64Flag=r.readBit()===1,xrefIndex=r.readBitShort()-1,xrefDependent=r.readBit()===1;
 const anonymous=r.readBit()===1,hasAttributes=r.readBit()===1,isXref=r.readBit()===1,xrefOverlaid=r.readBit()===1,loadedBit=r.readBit()===1;
 const ownedObjectCount=r.readBitLong();if(ownedObjectCount<0||ownedObjectCount>maxOwnedObjects)throw new RangeError("Invalid R2004 BLOCK_HEADER owned-object count");
 const basePoint=r.read3BD(),xrefPath=r.readText(8192),insertMarkers=[];
 for(let i=0;i<=maxInserts;i++){const marker=r.readRawChar();if(marker===0)break;insertMarkers.push(marker);if(i===maxInserts)throw new RangeError("Invalid R2004 BLOCK_HEADER insert count");}
 const description=r.readText(16384),previewSize=r.readBitLong();
 if(previewSize<0||previewSize>maxPreviewBytes)throw new RangeError("Invalid R2004 BLOCK_HEADER preview size");
 const previewData=r.readBytes(previewSize),handleBitOffset=offset*8+objectDataBits;
 if(r.bitOffset>handleBitOffset||handleBitOffset>env.recordEnd*8-16)throw new Error("Invalid R2004 BLOCK_HEADER handle-stream offset");
 r.bitOffset=handleBitOffset;
 const blockControl=r.readHandle(selfHandle.value),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(r.readHandle(selfHandle.value));
 const xdictionary=xdictionaryMissing?null:r.readHandle(selfHandle.value);
 const nullHandle=r.readHandle(selfHandle.value),blockEntity=r.readHandle(selfHandle.value),ownedHandles=[];
 for(let i=0;i<ownedObjectCount;i++)ownedHandles.push(r.readHandle(selfHandle.value));
 const endBlock=r.readHandle(selfHandle.value),insertHandles=[];
 for(let i=0;i<insertMarkers.length;i++)insertHandles.push(r.readHandle(selfHandle.value));
 const layout=r.readHandle(selfHandle.value);
 return {...env,handle:selfHandle.value,handleHex:selfHandle.hex,name,eed,reactorCount,xdictionaryMissing,is64Flag,xrefIndex,xrefDependent,
  flags:{anonymous,hasAttributes,isXref,xrefOverlaid,loadedBit},ownedObjectCount,basePoint,xrefPath,insertMarkers,insertCount:insertMarkers.length,
  description,previewData,blockControl,reactors,xdictionary,nullHandle,blockEntity,ownedHandles,endBlock,insertHandles,layout,handleBitOffset,
  diagnostics:{...env.diagnostics,blockHeaderDecoded:true,ownedHandleCount:ownedHandles.length,insertHandleCount:insertHandles.length}};
}
export function readR2004BlockHeaders(sectionBytes,objectMap,options){
 const blocks=[];
 for(const item of objectMap.entries){
  const offset=Number(item.offset),env=parseR2004ObjectRecordEnvelope(sectionBytes,offset);
  if(env.objectType!==49)continue;
  const block=parseR2004BlockHeaderRecord(sectionBytes,offset,options);
  if(block.handle!==BigInt(item.handle))throw new Error("R2004 BLOCK_HEADER object-map handle mismatch");
  blocks.push(block);
 }
 return {blocks,byHandle:new Map(blocks.map(block=>[block.handle.toString(),block])),byName:new Map(blocks.map(block=>[block.name,block])),
  diagnostics:{blockCount:blocks.length,modelSpaceCount:blocks.filter(x=>x.name.toLowerCase()==="*model_space").length,paperSpaceCount:blocks.filter(x=>x.name.toLowerCase().startsWith("*paper_space")).length}};
}
