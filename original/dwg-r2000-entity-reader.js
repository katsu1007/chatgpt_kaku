// KAKU-owned R2000 entity common-data reader.
// The R2000 container is flat (absolute object-map offsets); geometry payload
// decoders are shared only where the published entity layouts match R2004.
import { DwgBitReader, dwgTextEncoding } from "./dwg-bitstream.js?v=20261125-codepage1";
import { parseR2004ObjectRecordEnvelope } from "./dwg-r2004-object-record.js";
import { decodeR2004Geometry } from "./dwg-r2004-geometry.js";
import { readR13R15ObjectMap } from "./dwg-r13-container.js";
import { readR2000LayerRecords, resolveR2000EntityLayers } from "./dwg-r2000-layer-reader.js?v=20261125-codepage1";
import { readR2000BlockHeaders, assembleR2000BlockDefinitions } from "./dwg-r2000-block-reader.js?v=20261125-r2000-block1";
import { parseR2000HeaderVariables } from "./dwg-r2000-header-vars.js?v=20261125-header-vars1";
import { expandR2004BlockReferences } from "./dwg-r2004-block-expand.js?v=20261125-blockexpand1";
const SUPPORTED=new Set([1,7,8,17,18,19,20,21,22,23,24,25,26,27,31,35,36,44,77]);
function bitDoubleDefault(reader,defaultValue){return reader.readBitDoubleWithDefault(defaultValue);}
function decodeR2000InsertGeometry(reader,multiple=false){
 const insertionPoint=reader.read3BD(),scaleFlags=reader.readBits(2);let x=1,y=1,z=1;
 if(scaleFlags===1){y=bitDoubleDefault(reader,1);z=bitDoubleDefault(reader,1);}
 else if(scaleFlags===2){x=reader.readRawDouble();y=x;z=x;}
 else if(scaleFlags===0){x=reader.readRawDouble();y=bitDoubleDefault(reader,x);z=bitDoubleDefault(reader,x);}
 const rotation=reader.readBitDouble(),extrusion=reader.readBitExtrusion(),hasAttributes=reader.readBit()===1;
 const geometry={kind:multiple?"minsert":"insert",insertionPoint,scale:{x,y,z,flag:scaleFlags},rotation,extrusion,hasAttributes};
 if(multiple){geometry.columns=reader.readBitShort();geometry.rows=reader.readBitShort();geometry.columnSpacing=reader.readBitDouble();geometry.rowSpacing=reader.readBitDouble();}
 return geometry;
}
function readR2000EntityHandles(reader,selfHandle,reactorCount,noLinks,linetypeFlags,plotstyleFlags,maxReactors=100000){
 if(!Number.isSafeInteger(reactorCount)||reactorCount<0||reactorCount>maxReactors)throw new RangeError("Invalid R2000 reactor count");
 const owner=reader.readHandle(selfHandle),reactors=[];
 for(let i=0;i<reactorCount;i++)reactors.push(reader.readHandle(selfHandle));
 const xdictionary=reader.readHandle(selfHandle);
 const previous=noLinks?null:reader.readHandle(selfHandle),next=noLinks?null:reader.readHandle(selfHandle);
 const layer=reader.readHandle(selfHandle);
 const linetype=linetypeFlags===3?reader.readHandle(selfHandle):null;
 const plotstyle=plotstyleFlags===3?reader.readHandle(selfHandle):null;
 return {owner,reactors,xdictionary,previous,next,layer,linetype,plotstyle};
}
export function parseR2000EntityRecord(input,offset=0,{maxEedBytes=1024*1024,maxGraphicBytes=16*1024*1024,maxReactors=100000,textEncoding="windows-1252"}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),envelope=parseR2004ObjectRecordEnvelope(bytes,offset);
 const reader=new DwgBitReader(bytes,{bitOffset:offset*8,textEncoding});
 reader.readModularShort();reader.readBitShort();const objectDataBits=reader.readRawLong(),selfHandle=reader.readHandle();
 const eedSize=reader.readBitShort();
 if(!Number.isSafeInteger(eedSize)||eedSize<0||eedSize>maxEedBytes)throw new RangeError("Invalid R2000 EED byte count");
 const eed=reader.readBytes(eedSize),graphicPresent=reader.readBit()===1;let graphic=null;
 if(graphicPresent){const size=reader.readRawLong();if(!Number.isSafeInteger(size)||size<0||size>maxGraphicBytes)throw new RangeError("Invalid R2000 graphic byte count");graphic=reader.readBytes(size);}
 const entityMode=reader.readBits(2),reactorCount=reader.readBitLong(),noLinks=reader.readBit()===1;
 const colorNumber=reader.readBitShort(),color={colorNumber,aci:colorNumber&0x01ff};
 const linetypeScale=reader.readBitDouble(),linetypeFlags=reader.readBits(2),plotstyleFlags=reader.readBits(2);
 const invisibility=reader.readBitShort(),lineweight=reader.readRawChar();
 const geometryBitOffset=reader.bitOffset,geometryAvailableBits=reader.remainingBits;
 let geometry;
 try{geometry=envelope.objectType===7?decodeR2000InsertGeometry(reader,false):envelope.objectType===8?decodeR2000InsertGeometry(reader,true):SUPPORTED.has(envelope.objectType)?decodeR2004Geometry(envelope.objectType,reader):{kind:"unsupported",typeCode:envelope.objectType,reason:"R2000 entity family not yet implemented"};}
 catch(error){throw new Error("R2000 "+envelope.typeName+" geometry decode failed at bit "+geometryBitOffset+" with "+geometryAvailableBits+" bits remaining: "+error.message);}
 const geometryEndBit=reader.bitOffset,handleBitOffset=offset*8+objectDataBits;
 if(geometryEndBit>envelope.recordEnd*8-16)throw new Error("R2000 geometry payload crosses record CRC boundary");
 if(!Number.isSafeInteger(handleBitOffset)||handleBitOffset<geometryEndBit||handleBitOffset>envelope.recordEnd*8-16)throw new Error("Invalid R2000 declared handle-stream offset");
 reader.bitOffset=handleBitOffset;
 const handles=readR2000EntityHandles(reader,selfHandle.value,reactorCount,noLinks,linetypeFlags,plotstyleFlags,maxReactors);
 const styleHandle=["text","mtext"].includes(geometry.kind)?reader.readHandle(selfHandle.value):null;
 const dimensionHandles=geometry.kind==="dimension"?{dimStyle:reader.readHandle(selfHandle.value),anonymousBlock:reader.readHandle(selfHandle.value)}:null;
 let insertHandles=null;
 if(geometry.kind==="insert"||geometry.kind==="minsert"){
  const blockHeader=reader.readHandle(selfHandle.value);
  const firstAttribute=geometry.hasAttributes?reader.readHandle(selfHandle.value):null;
  const lastAttribute=geometry.hasAttributes?reader.readHandle(selfHandle.value):null;
  const seqend=geometry.hasAttributes?reader.readHandle(selfHandle.value):null;
  insertHandles={blockHeader,firstAttribute,lastAttribute,seqend};
 }
 return {...envelope,objectDataBits,selfHandle:selfHandle.value,entityMode,reactorCount,noLinks,color,linetypeScale,linetypeFlags,plotstyleFlags,invisibility,lineweight,
  eed,graphic,geometry,geometryBitOffset,geometryAvailableBits,geometryEndBit,declaredHandleBitOffset:handleBitOffset,handles,styleHandle,dimensionHandles,insertHandles,
  ownerHandle:handles.owner.value,layerHandle:handles.layer.value,
  diagnostics:{...envelope.diagnostics,commonEntityDecoded:true,geometryDecoded:geometry.kind!=="unsupported",handleReferencesDecoded:true,formatFamily:"R2000"}};
}
export function readR2000EntityRecords(input,objectMap,{maxObjects=2000000,...options}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 if(!objectMap||!Array.isArray(objectMap.entries))throw new TypeError("R2000 object map is required");
 if(objectMap.entries.length>maxObjects)throw new RangeError("R2000 object count exceeds safety limit");
 const records=[],skippedObjects=[];
 for(const item of objectMap.entries){
  const offset=Number(item.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset>=bytes.length)throw new RangeError("R2000 object-map offset is outside the file");
  const envelope=parseR2004ObjectRecordEnvelope(bytes,offset);
  if(envelope.handle!==BigInt(item.handle))throw new Error("R2000 object-map handle mismatch at offset "+offset);
  if(!SUPPORTED.has(envelope.objectType)){skippedObjects.push({handle:item.handle,offset:item.offset,objectType:envelope.objectType,typeName:envelope.typeName});continue;}
  records.push({...parseR2000EntityRecord(bytes,offset,options),objectMapOffset:item.offset});
 }
 return {records,skippedObjects,diagnostics:{recordCount:records.length,skippedObjectCount:skippedObjects.length,
  geometryCount:records.filter(record=>record.diagnostics.geometryDecoded).length,
  typeCounts:records.reduce((out,record)=>(out[record.typeName]=(out[record.typeName]||0)+1,out),{})}};
}
export function readR2000DrawingEntities(input,header,options={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),objectMap=readR13R15ObjectMap(bytes,header,options.objectMap);
 const encoding=options.textEncoding||dwgTextEncoding(header.fileHeader?.codePage),headerSection=header.sections?.[0];
 let headerVariables=null,units={code:null,name:"unknown",scaleToMm:null,known:false},headerWarning=null;
 if(headerSection){try{headerVariables=parseR2000HeaderVariables(bytes.subarray(headerSection.offset,headerSection.offset+headerSection.size));units=headerVariables.units;if(!units.known)headerWarning="DWGのINSUNITSを確定できません。図面単位を確認するまで数量換算は行いません。";}
  catch(error){headerWarning="DWGヘッダー変数を解析できません："+error.message;}}
 const entities=readR2000EntityRecords(bytes,objectMap,{...options,textEncoding:encoding});
 const layers=readR2000LayerRecords(bytes,objectMap,{textEncoding:encoding}),blocks=readR2000BlockHeaders(bytes,objectMap,{textEncoding:encoding});
 const blockDefinitions=assembleR2000BlockDefinitions(blocks,entities.records),expanded=expandR2004BlockReferences(entities.records,blockDefinitions.blocks,options.blockExpansion);
 const resolved=resolveR2000EntityLayers(expanded.entities,layers);
 return {...entities,entities:resolved.entities,layers:layers.layers,blocks:blockDefinitions.blocks,blockExpansion:expanded.diagnostics,objectMap,headerVariables,units,headerWarning,version:header.version,versionCode:header.versionCode,codePage:header.fileHeader?.codePage,textEncoding:encoding,
  layerDiagnostics:layers.diagnostics,blockDiagnostics:blockDefinitions.diagnostics,diagnostics:{...entities.diagnostics,...layers.diagnostics,...resolved.diagnostics,...blockDefinitions.diagnostics,...expanded.diagnostics,headerVariablesParsed:!!headerVariables,unitsKnown:units.known,objectMapEntries:objectMap.entries.length,formatFamily:"R2000-flat"}};
}
