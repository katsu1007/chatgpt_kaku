// KAKU-owned R2004 object-record envelope parser.
import { DwgBitReader } from "./dwg-bitstream.js";
const TYPES={1:"TEXT",2:"ATTRIB",3:"ATTDEF",4:"BLOCK",5:"ENDBLK",6:"SEQEND",7:"INSERT",8:"MINSERT",17:"ARC",18:"CIRCLE",19:"LINE",27:"POINT",46:"MTEXT",49:"MLINE",51:"LAYER",53:"SHAPEFILE",57:"LTYPE",77:"LWPOLYLINE",78:"HATCH",79:"XRECORD",82:"LAYOUT",498:"ACAD_PROXY_ENTITY",499:"ACAD_PROXY_OBJECT"};
function safeNumber(v,label){const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw new RangeError("Invalid "+label);return n;}
export function parseR2004ObjectRecordEnvelope(input,offset=0,{maxRecordBytes=67108864}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 if(!Number.isInteger(offset)||offset<0||offset>=bytes.length)throw new RangeError("R2004 object offset outside section");
 const r=new DwgBitReader(bytes,{bitOffset:offset*8}),size=safeNumber(r.readModularShort(),"object size");
 if(size>maxRecordBytes)throw new RangeError("R2004 object exceeds record limit");
 const bodyStart=r.byteOffset,end=bodyStart+size+2;
 if(end>bytes.length)throw new RangeError("R2004 object record exceeds section bounds");
 const objectType=r.readBitShort(),objectDataBits=r.readRawLong(),handle=r.readHandle();
 if(handle.code!==0)throw new Error("R2004 object self-handle must use absolute handle code 0");
 return {offset,bodyStart,objectSize:size,recordEnd:end,recordBytes:end-offset,objectType,typeName:TYPES[objectType]||"UNKNOWN_"+objectType,objectDataBits,handle:handle.value,handleHex:handle.hex,crc:(bytes[end-2]<<8)|bytes[end-1],diagnostics:{prefixBitsRead:r.bitOffset-offset*8,recordBoundaryKnown:true,entityPayloadDecoded:false}};
}
export function readR2004ObjectRecords(sectionBytes,objectMap,{maxObjects=2000000,maxRecordBytes=67108864}={}){
 if(!objectMap||!Array.isArray(objectMap.entries))throw new TypeError("R2004 object map is required");
 if(objectMap.entries.length>maxObjects)throw new RangeError("R2004 object count exceeds safety limit");
 const records=[];
 for(const item of objectMap.entries){const offset=safeNumber(item.offset,"object map offset"),record=parseR2004ObjectRecordEnvelope(sectionBytes,offset,{maxRecordBytes});if(record.handle!==BigInt(item.handle))throw new Error("Object-map handle mismatch at offset "+offset);records.push({...record,objectMapHandle:item.handle,objectMapOffset:item.offset});}
 return {records,diagnostics:{recordCount:records.length,typeCounts:records.reduce((out,r)=>(out[r.typeName]=(out[r.typeName]||0)+1,out),{})}};
}
