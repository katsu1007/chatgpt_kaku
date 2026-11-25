// KAKU-owned R2000 BLOCK_HEADER reader and definition assembler.
import { DwgBitReader } from "./dwg-bitstream.js?v=20261125-codepage1";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
export function parseR2000BlockHeaderRecord(input,offset=0,{maxEedBytes=1024*1024,maxPreviewBytes=16*1024*1024,maxReactors=100000,maxInserts=100000,textEncoding="windows-1252"}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),env=parseR2004ObjectRecordEnvelope(bytes,offset);
 if(env.objectType!==49)throw new Error("R2000 BLOCK_HEADER parser requires object type 49");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8,textEncoding});
 r.readModularShort();r.readBitShort();const objectDataBits=r.readRawLong(),selfHandle=r.readHandle();
 const eedSize=r.readBitShort();if(!Number.isSafeInteger(eedSize)||eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2000 BLOCK_HEADER EED size");
 const eed=r.readBytes(eedSize),reactorCount=r.readBitLong();
 if(!Number.isSafeInteger(reactorCount)||reactorCount<0||reactorCount>maxReactors)throw new RangeError("Invalid R2000 BLOCK_HEADER reactor count");
 const name=r.readText(4096),is64Flag=r.readBit()===1,xrefIndex=r.readBitShort()-1,xrefDependent=r.readBit()===1;
 const anonymous=r.readBit()===1,hasAttributes=r.readBit()===1,isXref=r.readBit()===1,xrefOverlaid=r.readBit()===1,loadedBit=r.readBit()===1;
 const basePoint=r.read3BD(),xrefPath=r.readText(8192),insertMarkers=[];
 for(let i=0;i<=maxInserts;i++){const marker=r.readRawChar();if(marker===0)break;insertMarkers.push(marker);if(i===maxInserts)throw new RangeError("Invalid R2000 BLOCK_HEADER insert count");}
 const description=r.readText(16384),previewSize=r.readBitLong();
 if(!Number.isSafeInteger(previewSize)||previewSize<0||previewSize>maxPreviewBytes)throw new RangeError("Invalid R2000 BLOCK_HEADER preview size");
 const previewData=r.readBytes(previewSize),handleBitOffset=offset*8+objectDataBits;
 if(!Number.isSafeInteger(handleBitOffset)||r.bitOffset>handleBitOffset||handleBitOffset>env.recordEnd*8-16)throw new Error("Invalid R2000 BLOCK_HEADER handle-stream offset");
 r.bitOffset=handleBitOffset;
 const blockControl=r.readHandle(selfHandle.value),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(r.readHandle(selfHandle.value));
 const xdictionary=r.readHandle(selfHandle.value),nullHandle=r.readHandle(selfHandle.value),blockEntity=r.readHandle(selfHandle.value);
 const hasDefinitionEntities=!isXref&&!xrefOverlaid,firstEntity=hasDefinitionEntities?r.readHandle(selfHandle.value):null,lastEntity=hasDefinitionEntities?r.readHandle(selfHandle.value):null;
 const endBlock=r.readHandle(selfHandle.value),insertHandles=[];
 for(let i=0;i<insertMarkers.length;i++)insertHandles.push(r.readHandle(selfHandle.value));
 const layout=r.readHandle(selfHandle.value);
 return {...env,handle:selfHandle.value,handleHex:selfHandle.hex,name,eed,reactorCount,is64Flag,xrefIndex,xrefDependent,
  flags:{anonymous,hasAttributes,isXref,xrefOverlaid,loadedBit,loaded:!loadedBit},basePoint,xrefPath,insertMarkers,insertCount:insertMarkers.length,
  description,previewData,blockControl,reactors,xdictionary,nullHandle,blockEntity,firstEntity,lastEntity,endBlock,insertHandles,layout,
  ownedHandles:[],handleBitOffset,diagnostics:{...env.diagnostics,blockHeaderDecoded:true,ownedHandleCount:0,insertHandleCount:insertHandles.length,formatFamily:"R2000"}};
}
export function readR2000BlockHeaders(input,objectMap,options={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),blocks=[];
 if(!objectMap||!Array.isArray(objectMap.entries))throw new TypeError("R2000 object map is required");
 for(const item of objectMap.entries){
  const offset=Number(item.offset),env=parseR2004ObjectRecordEnvelope(bytes,offset);
  if(env.objectType!==49)continue;
  const block=parseR2000BlockHeaderRecord(bytes,offset,options);
  if(block.handle!==BigInt(item.handle))throw new Error("R2000 BLOCK_HEADER object-map handle mismatch");
  blocks.push(block);
 }
 return {blocks,byHandle:new Map(blocks.map(block=>[block.handle.toString(),block])),byName:new Map(blocks.map(block=>[block.name,block])),
  diagnostics:{blockCount:blocks.length,modelSpaceCount:blocks.filter(x=>x.name.toLowerCase()==="*model_space").length,paperSpaceCount:blocks.filter(x=>x.name.toLowerCase().startsWith("*paper_space")).length}};
}
export function assembleR2000BlockDefinitions(blockResult,entities){
 const source=Array.isArray(entities)?entities:(entities?.records||[]),blocks=(blockResult?.blocks||[]).map(block=>{
  if(block.flags.isXref||block.flags.xrefOverlaid)return {...block,ownedHandles:[]};
  const first=block.firstEntity?.value??null,last=block.lastEntity?.value??null;
  const owners=new Set([block.handle.toString(),block.blockEntity?.value?.toString()].filter(Boolean));
  const owned=source.filter(entity=>{
   if(!owners.has(BigInt(entity.ownerHandle??0).toString()))return false;
   if(first!==null&&last!==null){const h=BigInt(entity.selfHandle);return h>=BigInt(first)&&h<=BigInt(last);}
   return true;
  }).sort((a,b)=>BigInt(a.selfHandle)<BigInt(b.selfHandle)?-1:BigInt(a.selfHandle)>BigInt(b.selfHandle)?1:0);
  return {...block,ownedHandles:owned.map(entity=>({value:BigInt(entity.selfHandle),code:0,hex:BigInt(entity.selfHandle).toString(16).toUpperCase()})),
   diagnostics:{...block.diagnostics,ownedHandleCount:owned.length}};
 });
 return {blocks,byHandle:new Map(blocks.map(block=>[block.handle.toString(),block])),byName:new Map(blocks.map(block=>[block.name,block.name?block:null]).filter(x=>x[1])) ,
  diagnostics:{...(blockResult?.diagnostics||{}),assembledBlockCount:blocks.length,assembledEntityCount:blocks.reduce((n,b)=>n+b.ownedHandles.length,0)}};
}
