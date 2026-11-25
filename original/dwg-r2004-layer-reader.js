// KAKU-owned R2004 LAYER object reader and entity layer-handle resolver.
import { DwgBitReader } from "./dwg-bitstream.js?v=20261125-codepage1";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
export function parseR2004LayerRecord(input,offset=0,{maxEedBytes=1024*1024,textEncoding="windows-1252"}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),env=parseR2004ObjectRecordEnvelope(bytes,offset);
 if(env.objectType!==51)throw new Error("R2004 layer parser requires object type 51");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8,textEncoding});
 r.readModularShort();r.readBitShort();const objectDataBits=r.readRawLong(),selfHandle=r.readHandle();
 const eedSize=r.readBitShort();if(eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2004 layer EED size");
 const eed=r.readBytes(eedSize),reactorCount=r.readBitLong(),xdictionaryMissing=r.readBit()===1;
 if(reactorCount<0||reactorCount>100000)throw new RangeError("Invalid R2004 layer reactor count");
 const name=r.readText(4096),is64Flag=r.readBit()===1,xrefIndex=r.readBitShort()-1,xrefDependent=r.readBit()===1;
 const values=r.readBitShort(),colorIndex=r.readBitShort(),rgb=r.readBitLong(),colorFlags=r.readRawChar();
 const colorName=colorFlags&1?r.readText(4096):null,bookName=colorFlags&2?r.readText(4096):null;
 const handleBitOffset=offset*8+objectDataBits;
 if(r.bitOffset>handleBitOffset||handleBitOffset>env.recordEnd*8-16)throw new Error("Invalid R2004 layer handle-stream offset");
 return {...env,handle:selfHandle.value,handleHex:selfHandle.hex,name,eed,reactorCount,xdictionaryMissing,is64Flag,xrefIndex,xrefDependent,
  values,color:{colorIndex,rgb,colorFlags,colorName,bookName},
  flags:{frozen:!!(values&1),on:!!(values&2),frozenInNewViewports:!!(values&4),locked:!!(values&8),plottable:!!(values&16),lineweight:(values&0x03e0)>>5},
  handleBitOffset,diagnostics:{...env.diagnostics,layerObjectDecoded:true,handleReferencesDecoded:false}};
}
export function readR2004LayerRecords(sectionBytes,objectMap,options){
 const layers=[];
 for(const item of objectMap.entries){
  const offset=Number(item.offset),env=parseR2004ObjectRecordEnvelope(sectionBytes,offset);
  if(env.objectType!==51)continue;
  const layer=parseR2004LayerRecord(sectionBytes,offset,options);
  if(layer.handle!==BigInt(item.handle))throw new Error("R2004 layer object-map handle mismatch");
  layers.push(layer);
 }
 return {layers,byHandle:new Map(layers.map(layer=>[layer.handle.toString(),layer])),diagnostics:{layerCount:layers.length,visibleCount:layers.filter(x=>x.flags.on&&!x.flags.frozen).length}};
}
export function resolveR2004EntityLayers(entities,layerResult){
 let unresolved=0;
 const resolved=(entities||[]).map(entity=>{
  const layer=layerResult.byHandle.get(BigInt(entity.layerHandle).toString());
  if(!layer){unresolved++;return {...entity,layerName:"DWG:UNRESOLVED:"+BigInt(entity.layerHandle).toString(16).toUpperCase(),layerResolved:false};}
  return {...entity,layerName:layer.name,layerResolved:true,layerFlags:layer.flags,layerColor:layer.color};
 });
 return {entities:resolved,diagnostics:{resolvedLayerCount:resolved.length-unresolved,unresolvedLayerCount:unresolved}};
}
