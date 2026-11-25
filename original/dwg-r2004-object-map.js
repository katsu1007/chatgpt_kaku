// KAKU-owned parser for the R2004+ AcDb:Handles object map.
import { DwgBitReader } from "./dwg-bitstream.js";
import { readR2004SectionByName } from "./dwg-r2004-section-reader.js";
export function parseR2004ObjectMap(input,{maxEntries=2000000,maxBlockBytes=2032}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 let offset=0,lastHandle=0n,lastLocation=0n,ended=false;
 const entries=[],blocks=[];
 while(offset<bytes.length){
  if(bytes.length-offset<2)throw new RangeError("Truncated R2004 object-map block size");
  const blockSize=(bytes[offset]<<8)|bytes[offset+1];offset+=2;
  if(blockSize<2||blockSize>maxBlockBytes)throw new Error("Invalid R2004 object-map block size "+blockSize);
  if(offset+blockSize>bytes.length)throw new RangeError("Truncated R2004 object-map block");
  const dataStart=offset,dataEnd=offset+blockSize-2;
  const crc=(bytes[dataEnd]<<8)|bytes[dataEnd+1];
  if(blockSize===2){blocks.push({size:blockSize,entryCount:0,crc,terminal:true});offset+=2;ended=true;break;}
  const reader=new DwgBitReader(bytes.slice(dataStart,dataEnd));let blockEntries=0;
  while(reader.remainingBits>0){
   const handleDelta=BigInt(reader.readModularChar()),locationDelta=BigInt(reader.readModularChar());
   if(handleDelta<0n)throw new Error("R2004 object-map handle delta cannot be negative");
   lastHandle+=handleDelta;lastLocation+=locationDelta;
   if(lastHandle<0n||lastLocation<0n)throw new Error("R2004 object-map delta produced a negative reference");
   if(entries.length>=maxEntries)throw new RangeError("R2004 object-map entry limit exceeded");
   entries.push({handle:lastHandle,handleHex:lastHandle.toString(16).toUpperCase(),offset:lastLocation});
   blockEntries++;
  }
  blocks.push({size:blockSize,entryCount:blockEntries,crc,terminal:false});
  offset+=blockSize;
 }
 if(!ended)throw new Error("R2004 object map has no terminal empty block");
 if(offset!==bytes.length)throw new Error("Unexpected trailing bytes after R2004 object-map terminator");
 for(let i=1;i<entries.length;i++)if(entries[i].handle<=entries[i-1].handle)throw new Error("R2004 object-map handles are not strictly increasing");
 return {entries,blocks,diagnostics:{entryCount:entries.length,blockCount:blocks.length,terminalBlockFound:ended,crcValidated:false}};
}
export function readR2004ObjectMap(input,resolvedSections,options){
 const section=readR2004SectionByName(input,resolvedSections,"AcDb:Handles");
 const map=parseR2004ObjectMap(section.data,options);
 return {...map,sectionDiagnostics:section.diagnostics};
}
