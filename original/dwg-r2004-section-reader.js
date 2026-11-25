// KAKU-owned R2004 DWG logical-section assembler.
import { parseR2004DataPageHeader, decodeR2004DataPage } from "./dwg-r2004-sections.js";
export function readR2004SectionContent(input,section,{maxSectionBytes=256*1024*1024}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 if(!section||!Array.isArray(section.pages))throw new TypeError("Resolved R2004 section descriptor is required");
 if(section.encrypted===1)throw new Error("Encrypted R2004 data sections are not supported yet");
 if(section.compressed!==1&&section.compressed!==2)throw new Error("Unknown R2004 section compression flag "+section.compressed);
 const sizeBig=BigInt(section.size);
 if(sizeBig>BigInt(maxSectionBytes)||sizeBig<0n)throw new RangeError("R2004 section exceeds configured size limit");
 const output=new Uint8Array(Number(sizeBig)),seen=[],covered=[];
 for(const localPage of section.pages){
  if(localPage.isGap)throw new Error("R2004 section page points to an unused gap");
  const offset=Number(localPage.fileOffset);
  if(!Number.isSafeInteger(offset))throw new RangeError("R2004 data page file offset is unsafe");
  const header=parseR2004DataPageHeader(bytes,offset);
  if(header.pageType!==0x4163043b)throw new Error("Unexpected R2004 data page type");
  if(header.sectionId!==section.sectionId)throw new Error("R2004 page belongs to a different section");
  if(header.compressedSize!==localPage.compressedSize)throw new Error("R2004 page compressed size differs from section map");
  if(BigInt(header.startOffset)!==BigInt(localPage.startOffset))throw new Error("R2004 page start offset differs from section map");
  if(!header.checksums.dataValid||!header.checksums.headerValid)throw new Error("R2004 data page checksum validation failed");
  const decoded=decodeR2004DataPage(bytes,offset,{compressed:section.compressed===2});
  const start=Number(localPage.startOffset),end=start+decoded.decompressedPayload.length;
  if(!Number.isSafeInteger(start)||start<0||end>output.length)throw new RangeError("R2004 decoded page falls outside its logical section");
  for(const range of covered)if(start<range.end&&end>range.start)throw new Error("Overlapping R2004 section page ranges");
  output.set(decoded.decompressedPayload,start);covered.push({start,end});
  seen.push({pageId:localPage.pageId,fileOffset:offset,compressedSize:header.compressedSize,decompressedSize:decoded.decompressedPayload.length,startOffset:start});
 }
 return {data:output,diagnostics:{sectionName:section.name,sectionBytes:output.length,pageCount:seen.length,coveredBytes:covered.reduce((n,r)=>n+r.end-r.start,0),pages:seen}};
}
export function readR2004SectionByName(input,resolvedSections,name,options){
 const section=(resolvedSections||[]).find(item=>item.name===name);
 if(!section)throw new Error("R2004 section not found: "+name);
 return readR2004SectionContent(input,section,options);
}
