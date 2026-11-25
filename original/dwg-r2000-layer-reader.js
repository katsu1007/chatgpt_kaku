// KAKU-owned R2000 LAYER table-record reader.
import { DwgBitReader, dwgTextEncoding } from "./dwg-bitstream.js?v=20261125-codepage1";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
export function parseR2000LayerRecord(input,offset=0,{maxEedBytes=1024*1024,textEncoding="windows-1252"}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),env=parseR2004ObjectRecordEnvelope(bytes,offset);
 if(env.objectType!==51)throw new Error("R2000 layer parser requires object type 51");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8,textEncoding});
 r.readModularShort();r.readBitShort();const objectDataBits=r.readRawLong(),selfHandle=r.readHandle();
 const eedSize=r.readBitShort();
 if(!Number.isSafeInteger(eedSize)||eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2000 layer EED size");
 const eed=r.readBytes(eedSize),reactorCount=r.readBitLong();
 if(!Number.isSafeInteger(reactorCount)||reactorCount<0||reactorCount>100000)throw new RangeError("Invalid R2000 layer reactor count");
 const name=r.readText(4096),is64Flag=r.readBit()===1,xrefIndex=r.readBitShort()-1,xrefDependent=r.readBit()===1;
 const values=r.readBitShort(),colorNumber=r.readBitShort(),color={colorNumber,aci:colorNumber&0x01ff};
 const handleBitOffset=offset*8+objectDataBits;
 if(!Number.isSafeInteger(handleBitOffset)||r.bitOffset>handleBitOffset||handleBitOffset>env.recordEnd*8-16)throw new Error("Invalid R2000 layer handle-stream offset");
 r.bitOffset=handleBitOffset;
 const layerControl=r.readHandle(selfHandle.value),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(r.readHandle(selfHandle.value));
 const xdictionary=r.readHandle(selfHandle.value),xrefBlock=r.readHandle(selfHandle.value);
 const plotstyle=r.readHandle(selfHandle.value),linetype=r.readHandle(selfHandle.value),unknown=r.readHandle(selfHandle.value);
 return {...env,handle:selfHandle.value,handleHex:selfHandle.hex,name,eed,reactorCount,is64Flag,xrefIndex,xrefDependent,values,color,
  flags:{frozen:!!(values&1),on:!!(values&2),frozenInNewViewports:!!(values&4),locked:!!(values&8),plottable:!!(values&16),lineweight:(values&0x03e0)>>5},
  handles:{layerControl,reactors,xdictionary,xrefBlock,plotstyle,linetype,unknown},handleBitOffset,
  diagnostics:{...env.diagnostics,layerObjectDecoded:true,handleReferencesDecoded:true,formatFamily:"R2000"}};
}
export function readR2000LayerRecords(input,objectMap,{textEncoding,maxLayers=1000000}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),layers=[];
 if(!objectMap||!Array.isArray(objectMap.entries))throw new TypeError("R2000 object map is required");
 for(const item of objectMap.entries){
  const offset=Number(item.offset),env=parseR2004ObjectRecordEnvelope(bytes,offset);
  if(env.objectType!==51)continue;
  if(layers.length>=maxLayers)throw new RangeError("R2000 layer count exceeds safety limit");
  const layer=parseR2000LayerRecord(bytes,offset,{textEncoding});
  if(layer.handle!==BigInt(item.handle))throw new Error("R2000 layer object-map handle mismatch");
  layers.push(layer);
 }
 return {layers,byHandle:new Map(layers.map(layer=>[layer.handle.toString(),layer])),
  diagnostics:{layerCount:layers.length,visibleCount:layers.filter(layer=>layer.flags.on&&!layer.flags.frozen).length}};
}
export function resolveR2000EntityLayers(entities,layerResult){
 let unresolved=0;
 const resolved=(entities||[]).map(entity=>{
  const layer=layerResult.byHandle.get(BigInt(entity.layerHandle).toString());
  if(!layer){unresolved++;return {...entity,layerName:"DWG:UNRESOLVED:"+BigInt(entity.layerHandle).toString(16).toUpperCase(),layerResolved:false};}
  return {...entity,layerName:layer.name,layerResolved:true,layerFlags:layer.flags,layerColor:layer.color};
 });
 return {entities:resolved,diagnostics:{resolvedLayerCount:resolved.length-unresolved,unresolvedLayerCount:unresolved}};
}
