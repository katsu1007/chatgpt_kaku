// KAKU-owned R2000 AcDb:Header variable reader.
import { DwgBitReader } from "./dwg-bitstream.js";
import { R2004_HEADER_FIELDS, resolveDwgInsunits } from "./dwg-r2004-header-vars.js";
const START=Uint8Array.from([0xcf,0x7b,0x1f,0x23,0xfd,0xde,0x38,0xa9,0x5f,0x7c,0x68,0xb8,0x4e,0x6d,0x33,0x5f]);
const END=Uint8Array.from([0x30,0x84,0xe0,0xdc,0x02,0x21,0xc7,0x56,0xa0,0x83,0x97,0x47,0xb1,0x92,0xcc,0xa0]);
const R2004_ONLY=new Set(["R2004_UNKNOWN_BOOL","R2004_UNKNOWN_LONG_1","R2004_UNKNOWN_LONG_2","R2004_UNKNOWN_LONG_3","R2004_UNKNOWN_LONG_4","R2004_UNKNOWN_LONG_5","R2004_UNKNOWN_LONG_6","HANDLEED","DICT_MATERIALS","DICT_COLORS","SORTENTS","INDEXCTL","HIDETEXT","XCLIPFRAME","DIMASSOC","HALOGAP","OBSCUREDCOLOR","INTERSECTIONCOLOR","OBSCUREDLTYPE","INTERSECTIONDISPLAY","PROJECTNAME"]);
export const R2000_HEADER_FIELDS=R2004_HEADER_FIELDS.filter(field=>!R2004_ONLY.has(field.name));
function skipCmcR2000(r){r.readBitShort();}
function skipField(r,type){
 switch(type){
  case "B":r.readBit();break;
  case "BS":r.readBitShort();break;
  case "BL":r.readBitLong();break;
  case "BD":r.readBitDouble();break;
  case "TV":r.readText();break;
  case "CMC":skipCmcR2000(r);break;
  case "H":r.readHandle();break;
  case "3BD":r.read3BD();break;
  case "2RD":r.read2RD();break;
  case "RC":r.readRawChar();break;
  case "RS":r.readRawShort();break;
  default:throw new Error("Unsupported R2000 header field type "+type);
 }
}
export function parseR2000HeaderVariables(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 if(bytes.length<38)throw new RangeError("R2000 header-variable section is truncated");
 for(let i=0;i<16;i++)if(bytes[i]!==START[i])throw new Error("R2000 header-variable sentinel mismatch");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sectionSize=view.getUint32(16,true),dataEnd=20+sectionSize;
 if(dataEnd+18>bytes.length)throw new RangeError("R2000 header-variable section size exceeds buffer");
 const r=new DwgBitReader(bytes,{bitOffset:20*8});let insunits=null,cepsntype=null,flags=null;
 for(const field of R2000_HEADER_FIELDS){
  if(field.name==="INSUNITS"){insunits=r.readBitShort();continue;}
  if(field.name==="CEPSNTYPE"){cepsntype=r.readBitShort();if(cepsntype===3)r.readHandle();continue;}
  if(field.name==="HEADER_FLAGS"){flags=r.readBitLong();continue;}
  skipField(r,field.type);
 }
 const consumedBits=r.bitOffset-20*8;
 let endingValid=false,crc=null,endingOffset=null;
 try{
  const candidate=new DwgBitReader(bytes,{bitOffset:r.bitOffset});
  candidate.bitOffset=Math.ceil(candidate.bitOffset/8)*8;
  crc=candidate.readRawShort();endingOffset=candidate.byteOffset;
  const ending=bytes.slice(endingOffset,endingOffset+16);
  if(endingOffset===dataEnd&&ending.length===16&&ending.every((b,i)=>b===END[i]))endingValid=true;
 }catch{}
 const rawUnits=resolveDwgInsunits(insunits),units=endingValid?rawUnits:{code:insunits,name:"unvalidated-header",scaleToMm:null,known:false};
 return {insunits,units,cepsntype,flags,crc,consumedBits,sectionSize,endingSentinelValid:endingValid,
  diagnostics:{fieldCount:R2000_HEADER_FIELDS.length,bitOffset:r.bitOffset,dataEndBit:dataEnd*8,endingOffset,crcChecked:false,formatFamily:"R2000"}};
}
