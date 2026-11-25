// KAKU-owned R2004 common entity data reader and geometry dispatcher.
import { DwgBitReader } from "./dwg-bitstream.js";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
import { decodeR2004Geometry } from "./dwg-r2004-geometry.js";
import { readR2004SectionByName } from "./dwg-r2004-section-reader.js";
import { readR2004ObjectMap } from "./dwg-r2004-object-map.js";
import { readR2004SectionMaps } from "./dwg-r2004-sections.js";
import { readR2004LayerRecords, resolveR2004EntityLayers } from "./dwg-r2004-layer-reader.js";
import { parseR2004HeaderVariables } from "./dwg-r2004-header-vars.js";
import { readR2004BlockHeaders } from "./dwg-r2004-block-reader.js";
import { expandR2004BlockReferences } from "./dwg-r2004-block-expand.js";
function readEntityColor(reader){
 const colorNumber=reader.readBitShort(),flags=colorNumber&0xe000;
 const color={colorNumber,aci:colorNumber&0x01ff,complex:!!(flags&0x8000),hasColorHandle:!!(flags&0x4000),hasTransparency:!!(flags&0x2000)};
 if(color.complex)color.rgb=reader.readBitShort();
 if(color.hasTransparency)color.transparency=reader.readBitLong();
 return color;
}
function readEntityHandles(reader,selfHandle,reactorCount,xdictionaryMissing,color,linetypeFlags,plotstyleFlags,maxReactors=100000){
 if(reactorCount<0||reactorCount>maxReactors)throw new RangeError("Invalid R2004 reactor count");
 const owner=reader.readHandle(selfHandle),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(reader.readHandle(selfHandle));
 const xdictionary=xdictionaryMissing?null:reader.readHandle(selfHandle);
 const colorBook=color.hasColorHandle?reader.readHandle(selfHandle):null;
 const layer=reader.readHandle(selfHandle);
 const linetype=linetypeFlags===3?reader.readHandle(selfHandle):null;
 const plotstyle=plotstyleFlags===3?reader.readHandle(selfHandle):null;
 return {owner,reactors,xdictionary,colorBook,layer,linetype,plotstyle};
}
export function parseR2004EntityRecord(input,offset=0,{maxEedBytes=1024*1024,maxGraphicBytes=16*1024*1024}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 const envelope=parseR2004ObjectRecordEnvelope(bytes,offset);
 const reader=new DwgBitReader(bytes,{bitOffset:offset*8});
 reader.readModularShort();reader.readBitShort();const objectDataBits=reader.readRawLong();const selfHandle=reader.readHandle();
 const eedSize=reader.readBitShort();
 if(eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2004 EED byte count");
 const eed=reader.readBytes(eedSize);
 const graphicPresent=reader.readBit()===1;let graphic=null;
 if(graphicPresent){const size=reader.readRawLong();if(size<0||size>maxGraphicBytes)throw new RangeError("Invalid R2004 graphic byte count");graphic=reader.readBytes(size);}
 const entityMode=reader.readBits(2),reactorCount=reader.readBitLong(),xdictionaryMissing=reader.readBit()===1,noLinks=reader.readBit()===1;
 const color=readEntityColor(reader),linetypeScale=reader.readBitDouble(),linetypeFlags=reader.readBits(2),plotstyleFlags=reader.readBits(2);
 const invisibility=reader.readBitShort(),lineweight=reader.readRawChar();
 const geometryBitOffset=reader.bitOffset,geometryReader=reader;
 const geometry=decodeR2004Geometry(envelope.objectType,geometryReader);
 const geometryEndBit=reader.bitOffset,handleBitOffset=offset*8+objectDataBits;
 if(geometryEndBit>envelope.recordEnd*8-16)throw new Error("R2004 geometry payload crosses record CRC boundary");
 if(!Number.isSafeInteger(handleBitOffset)||handleBitOffset<geometryEndBit||handleBitOffset>envelope.recordEnd*8-16)throw new Error("Invalid R2004 declared handle-stream offset");
 reader.bitOffset=handleBitOffset;
 const handles=readEntityHandles(reader,selfHandle.value,reactorCount,xdictionaryMissing,color,linetypeFlags,plotstyleFlags);
 let insertHandles=null;
 if(geometry.kind==="insert"||geometry.kind==="minsert"){
  const blockHeader=reader.readHandle(selfHandle.value),attributes=[];
  for(let i=0;i<geometry.ownedObjectCount;i++)attributes.push(reader.readHandle(selfHandle.value));
  const seqend=geometry.hasAttributes?reader.readHandle(selfHandle.value):null;
  insertHandles={blockHeader,attributes,seqend};
 }
 return {...envelope,objectDataBits,selfHandle:selfHandle.value,entityMode,reactorCount,xdictionaryMissing,noLinks,color,linetypeScale,linetypeFlags,plotstyleFlags,invisibility,lineweight,
  eed,graphic,geometry,geometryBitOffset,geometryEndBit,declaredHandleBitOffset:handleBitOffset,handles,insertHandles,ownerHandle:handles.owner.value,layerHandle:handles.layer.value,
  diagnostics:{...envelope.diagnostics,commonEntityDecoded:true,geometryDecoded:geometry.kind!=="unsupported",handleReferencesDecoded:true}};
}
export function readR2004EntityRecords(sectionBytes,objectMap,options){
 const records=[],skippedObjects=[],supported=new Set([7,8,17,18,19,27,31,77]);
 for(const item of objectMap.entries){
  const offset=Number(item.offset),envelope=parseR2004ObjectRecordEnvelope(sectionBytes,offset);
  if(envelope.handle!==BigInt(item.handle))throw new Error("Object-map handle mismatch at entity offset "+item.offset);
  if(!supported.has(envelope.objectType)){skippedObjects.push({handle:item.handle,offset:item.offset,objectType:envelope.objectType,typeName:envelope.typeName});continue;}
  const record=parseR2004EntityRecord(sectionBytes,offset,options);
  records.push({...record,objectMapOffset:item.offset});
 }
 return {records,skippedObjects,diagnostics:{recordCount:records.length,skippedObjectCount:skippedObjects.length,geometryCount:records.filter(x=>x.diagnostics.geometryDecoded).length,typeCounts:records.reduce((out,r)=>(out[r.typeName]=(out[r.typeName]||0)+1,out),{})}};
}
export function readR2004DrawingEntities(input,fileHeader,options){
 const sections=readR2004SectionMaps(input,fileHeader),objectMap=readR2004ObjectMap(input,sections.resolvedSections);
 const objects=readR2004SectionByName(input,sections.resolvedSections,"AcDb:AcDbObjects");
 const entities=readR2004EntityRecords(objects.data,objectMap,options),layers=readR2004LayerRecords(objects.data,objectMap),blocks=readR2004BlockHeaders(objects.data,objectMap);
 const resolved=resolveR2004EntityLayers(entities.records,layers),expanded=expandR2004BlockReferences(resolved.entities,blocks.blocks,options?.blockExpansion);
 let units={code:null,name:"unknown",scaleToMm:null,known:false},headerWarning=null,headerVariables=null;
 try{const headerSection=readR2004SectionByName(input,sections.resolvedSections,"AcDb:Header");headerVariables=parseR2004HeaderVariables(headerSection.data);units=headerVariables.units;if(!headerVariables.endingSentinelValid)headerWarning="DWGヘッダー終端を検証できないため、INSUNITSは採用しません。";else if(!units.known)headerWarning="INSUNITSが未指定または未対応のため、mm換算は保留します。";}
 catch(error){headerWarning="DWG INSUNITSを取得できません："+(error?.message||error);}
 return {entities:expanded.entities,rawEntities:resolved.entities,objectMap,layers:layers.layers,blocks:blocks.blocks,blockExpansion:expanded.diagnostics,units,headerVariables,headerWarning,sections:sections.diagnostics,diagnostics:{...entities.diagnostics,...layers.diagnostics,...blocks.diagnostics,...resolved.diagnostics,...expanded.diagnostics,sectionCount:sections.resolvedSections.length,objectMapEntries:objectMap.entries.length}};
}
