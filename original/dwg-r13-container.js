// KAKU-owned R13/R14/R2000 DWG container locator reader.
// This module only locates legacy sections; it does not claim entity decoding.
const VERSIONS={AC1012:"R13",AC1014:"R14",AC1015:"R2000"};
const HEADER_END=Uint8Array.from([0x95,0xa0,0x4e,0x28,0x99,0x82,0x1a,0xe5,0x5e,0x41,0xe0,0x5f,0x9d,0x3a,0x4d,0x00]);
const CRC_XOR={3:0xa598,4:0x8101,5:0x3cc4,6:0x8461};
const NAMES={0:"header-variables",1:"classes",2:"object-map",3:"special-table",4:"template",5:"unknown-5"};
const bytesOf=input=>input instanceof Uint8Array?input:new Uint8Array(input||0);
const u32=(view,offset)=>view.getUint32(offset,true);
export function dwgR13Crc16(input,seed=0){
 const bytes=bytesOf(input);let crc=seed&0xffff;
 for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc&1)?((crc>>>1)^0xa001):(crc>>>1);}
 return crc&0xffff;
}
export function parseR13R15DwgHeader(input,{maxSections=6}={}){
 const bytes=bytesOf(input);
 if(bytes.length<0x15+4+2+HEADER_END.length)throw new RangeError("R13/R15 DWG header is truncated");
 const versionCode=String.fromCharCode(...bytes.slice(0,6)),version=VERSIONS[versionCode];
 if(!version)throw new Error("R13/R15 header parser requires AC1012, AC1014 or AC1015; received "+versionCode);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=u32(view,0x15);
 if(count<3||count>maxSections||count>6)throw new RangeError("Invalid R13/R15 section locator count "+count);
 const recordsStart=0x19,crcOffset=recordsStart+count*9,endOffset=crcOffset+2;
 if(endOffset+HEADER_END.length>bytes.length)throw new RangeError("R13/R15 section locator table exceeds file bounds");
 const locators=[],seen=new Set();
 for(let i=0;i<count;i++){
  const offset=recordsStart+i*9,id=bytes[offset],address=u32(view,offset+1),size=u32(view,offset+5);
  if(seen.has(id))throw new Error("Duplicate R13/R15 section locator "+id);
  seen.add(id);
  if(address>bytes.length||size>bytes.length-address)throw new RangeError("R13/R15 section "+id+" exceeds file bounds");
  locators.push({id,name:NAMES[id]||"unknown-"+id,offset:address,size});
 }
 const expectedCrc=view.getUint16(crcOffset,true),baseCrc=dwgR13Crc16(bytes.subarray(0,crcOffset));
 const actualCrc=(baseCrc^CRC_XOR[count])&0xffff;
 for(let i=0;i<HEADER_END.length;i++)if(bytes[endOffset+i]!==HEADER_END[i])throw new Error("R13/R15 header end sentinel mismatch");
 const byId=Object.fromEntries(locators.map(x=>[x.id,x]));
 if(!byId[0]||!byId[1]||!byId[2])throw new Error("R13/R15 DWG is missing a required header, class or object-map locator");
 return {format:"dwg",version,versionCode,fileHeader:{imageSeeker:u32(view,0x0d),codePage:view.getUint16(0x13,true)},
  locators,sections:byId,headerCrc:{expected:expectedCrc,actual:actualCrc,valid:expectedCrc===actualCrc},
  diagnostics:{locatorCount:count,headerEndOffset:endOffset+HEADER_END.length,objectMapUsesAbsoluteFileOffsets:true,entityRecordsDecoded:false}};
}
export function readR13R15ObjectMap(input,header,options){
 const bytes=bytesOf(input),section=header?.sections?.[2];
 if(!section)throw new Error("R13/R15 object-map locator is required");
 const end=section.offset+section.size;
 if(section.offset<0||end>bytes.length)throw new RangeError("R13/R15 object-map section is outside the file");
 // R13-R15 object-map entries are handle/file-offset deltas. The resulting
 // locations remain absolute addresses in the original DWG byte stream.
 return { ...parseLegacyMap(bytes.subarray(section.offset,end),options),section };
}
function parseLegacyMap(input,options){
 // The legacy and R2004 map block encoding is shared; offsets have different bases.
 // Import lazily at module scope through the shared KAKU parser below.
 return parseMap(input,options);
}
import { parseR2004ObjectMap as parseMap } from "./dwg-r2004-object-map.js";
