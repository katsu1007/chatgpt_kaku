// KAKU-owned R2004 common entity data reader and geometry dispatcher.
import { DwgBitReader } from "./dwg-bitstream.js";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
import { decodeR2004Geometry } from "./dwg-r2004-geometry.js";
import { readR2004SectionByName } from "./dwg-r2004-section-reader.js";
import { readR2004ObjectMap } from "./dwg-r2004-object-map.js";
import { readR2004SectionMaps } from "./dwg-r2004-sections.js";
function readEntityColor(reader){
 const colorNumber=reader.readBitShort(),flags=colorNumber&0xe000;
 const color={colorNumber,aci:colorNumber&0x01ff,complex:!!(flags&0x8000),hasColorHandle:!!(flags&0x4000),hasTransparency:!!(flags&0x2000)};
 if(color.complex)color.rgb=reader.readBitShort();
 if(color.hasTransparency)color.transparency=reader.readBitLong();
 return color;
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
 const geometryEndBit=reader.bitOffset;
 if(geometryEndBit>envelope.recordEnd*8-16)throw new Error("R2004 geometry payload crosses record CRC boundary");
 return {...envelope,objectDataBits,selfHandle:selfHandle.value,entityMode,reactorCount,xdictionaryMissing,noLinks,color,linetypeScale,linetypeFlags,plotstyleFlags,invisibility,lineweight,
  eed,graphic,geometry,geometryBitOffset,geometryEndBit,declaredHandleBitOffset:offset*8+objectDataBits,
  diagnostics:{...envelope.diagnostics,commonEntityDecoded:true,geometryDecoded:geometry.kind!=="unsupported",handleReferencesDecoded:false}};
}
export function readR2004EntityRecords(sectionBytes,objectMap,options){
 const records=[];
 for(const item of objectMap.entries){
  const record=parseR2004EntityRecord(sectionBytes,Number(item.offset),options);
  if(record.selfHandle!==BigInt(item.handle))throw new Error("Object-map handle mismatch at entity offset "+item.offset);
  records.push({...record,objectMapOffset:item.offset});
 }
 return {records,diagnostics:{recordCount:records.length,geometryCount:records.filter(x=>x.diagnostics.geometryDecoded).length,typeCounts:records.reduce((out,r)=>(out[r.typeName]=(out[r.typeName]||0)+1,out),{})}};
}
export function readR2004DrawingEntities(input,fileHeader,options){
 const sections=readR2004SectionMaps(input,fileHeader),objectMap=readR2004ObjectMap(input,sections.resolvedSections);
 const objects=readR2004SectionByName(input,sections.resolvedSections,"AcDb:AcDbObjects");
 const entities=readR2004EntityRecords(objects.data,objectMap,options);
 return {entities:entities.records,objectMap,sections:sections.diagnostics,diagnostics:{...entities.diagnostics,sectionCount:sections.resolvedSections.length,objectMapEntries:objectMap.entries.length}};
}
