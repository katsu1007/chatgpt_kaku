// KAKU-owned R2004 DWG page and section map readers.
import { parseR2004SystemPageHeader } from "./dwg-r2004-container.js";
import { decompressR2004SystemPage, decompressR2004Lz77 } from "./dwg-r2004-decompress.js";
const u32=(v,o)=>v.getUint32(o,true),i32=(v,o)=>v.getInt32(o,true),u64=(v,o)=>v.getBigUint64(o,true);
const asText=b=>new TextDecoder("windows-1252").decode(b).replace(new RegExp(String.fromCharCode(0)+"+$"),"").trim();
function data(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);return{bytes,view:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)};}
export function parseR2004SectionPageMap(input,{firstPageOffset=0x100,maxEntries=1000000}={}){
 const {bytes,view}=data(input),entries=[],byPageId=new Map();let p=0,fileOffset=firstPageOffset;
 while(p<bytes.length){
  if(bytes.length-p<8)throw new RangeError("Truncated R2004 section page map entry");
  const signedId=i32(view,p),size=u32(view,p+4);p+=8;
  if(!signedId)throw new Error("Invalid zero page ID");
  const pageId=Math.abs(signedId),isGap=signedId<0;let tree=null;
  if(isGap){if(bytes.length-p<16)throw new RangeError("Truncated R2004 gap tree record");tree={parent:u32(view,p),left:u32(view,p+4),right:u32(view,p+8),reserved:u32(view,p+12)};p+=16;}
  if(byPageId.has(pageId))throw new Error("Duplicate R2004 page ID "+pageId);
  const entry={pageId,signedPageId:signedId,isGap,size,fileOffset,tree};entries.push(entry);byPageId.set(pageId,entry);fileOffset+=size;
  if(entries.length>maxEntries)throw new RangeError("R2004 page map entry limit exceeded");
 }
 return {entries,byPageId,nextFileOffset:fileOffset,diagnostics:{entryCount:entries.length,gapCount:entries.filter(x=>x.isGap).length}};
}
export function parseR2004SectionMap(input,{maxSections=10000,maxPagesPerSection=100000}={}){
 const {bytes,view}=data(input);if(bytes.length<20)throw new RangeError("Truncated R2004 section map header");
 const count=u32(view,0),format=u32(view,4),maxPageSize=u32(view,8),reserved=u32(view,12),unknown=u32(view,16);
 if(count>maxSections)throw new RangeError("R2004 section count exceeds safety limit");
 const sections=[];let p=20;
 for(let i=0;i<count;i++){
  if(bytes.length-p<96)throw new RangeError("Truncated R2004 section descriptor");
  const size=u64(view,p),pageCount=u32(view,p+8),maxDecompressedSize=u32(view,p+12),unknownValue=u32(view,p+16);
  const compressed=u32(view,p+20),sectionId=u32(view,p+24),encrypted=u32(view,p+28),name=asText(bytes.slice(p+32,p+96));p+=96;
  if(pageCount>maxPagesPerSection)throw new RangeError("R2004 section page count exceeds safety limit");
  if(bytes.length-p<pageCount*16)throw new RangeError("Truncated R2004 local page map");
  const pages=[];for(let j=0;j<pageCount;j++){pages.push({pageId:u32(view,p),compressedSize:u32(view,p+4),startOffset:u64(view,p+8)});p+=16;}
  sections.push({name,size,pageCount,maxDecompressedSize,unknown:unknownValue,compressed,sectionId,encrypted,pages});
 }
 return {count,format,maxPageSize,reserved,unknown,sections,bytesRead:p,diagnostics:{sectionCount:sections.length,totalPages:sections.reduce((n,s)=>n+s.pages.length,0),trailingBytes:bytes.length-p}};
}
export function resolveR2004SectionPages(sectionMap,pageMap){
 return sectionMap.sections.map(section=>({...section,pages:section.pages.map(page=>{
  const global=pageMap.byPageId.get(page.pageId);if(!global)throw new Error("Missing global page "+page.pageId);
  return {...page,fileOffset:global.fileOffset,storedPageSize:global.size,isGap:global.isGap};
 })}));
}
export function parseR2004DataPageHeader(input,offset){
 const {bytes}=data(input);if(!Number.isInteger(offset)||offset<0||offset+32>bytes.length)throw new RangeError("R2004 data page header outside file");
 const raw=bytes.slice(offset,offset+32),mask=(0x4164536b^offset)>>>0,d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 for(let p=0;p<32;p+=4)d.setUint32(p,(d.getUint32(p,true)^mask)>>>0,true);
 const pageType=u32(d,0),sectionId=u32(d,4),compressedSize=u32(d,8),decompressedSize=u32(d,12),startOffset=u32(d,16),headerChecksum=u32(d,20),dataChecksum=u32(d,24),unknownValue=u32(d,28);
 if(offset+32+compressedSize>bytes.length)throw new RangeError("R2004 data page payload truncated");
 const payload=bytes.slice(offset+32,offset+32+compressedSize);
 const checksum=(seed,buf)=>{let a=seed&65535,b=seed>>>16;for(let st=0;st<buf.length;st+=0x1560){for(let i=st;i<Math.min(buf.length,st+0x1560);i++){a+=buf[i];b+=a;}a%=0xfff1;b%=0xfff1;}return((b<<16)|(a&65535))>>>0;};
 const actualDataChecksum=checksum(0,payload),headerForChecksum=raw.slice();headerForChecksum.fill(0,20,24);
 const actualHeaderChecksum=checksum(actualDataChecksum,headerForChecksum);
 return {pageType,sectionId,compressedSize,decompressedSize,startOffset,headerChecksum,dataChecksum,unknown:unknownValue,payload,checksums:{dataValid:actualDataChecksum===dataChecksum,headerValid:actualHeaderChecksum===headerChecksum,actualDataChecksum,actualHeaderChecksum}};
}
export function decodeR2004DataPage(input,offset,{compressed=true}={}){
 const page=parseR2004DataPageHeader(input,offset);
 if(page.pageType!==0x4163043b)throw new Error("Unexpected R2004 data page type");
 const decoded=compressed?decompressR2004Lz77(page.payload,page.decompressedSize):page.payload;
 if(!compressed&&decoded.length!==page.decompressedSize)throw new Error("R2004 uncompressed page size mismatch");
 return {...page,decompressedPayload:decoded};
}
export function readR2004SectionMaps(input,fileHeader){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0),pageOffset=Number(fileHeader.container.sectionPageMapAddress);
 if(!Number.isSafeInteger(pageOffset))throw new RangeError("R2004 page map address is not safe");
 const pageHeader=parseR2004SystemPageHeader(bytes,pageOffset);
 if(pageHeader.knownType!=="section-page-map")throw new Error("Expected section page map page");
 const pageData=decompressR2004SystemPage(bytes,pageOffset).decompressedPayload,pageMap=parseR2004SectionPageMap(pageData);
 const sectionPage=pageMap.byPageId.get(fileHeader.container.sectionMapId);
 if(!sectionPage||sectionPage.isGap)throw new Error("R2004 section map page not found");
 const sectionHeader=parseR2004SystemPageHeader(bytes,sectionPage.fileOffset);
 if(sectionHeader.knownType!=="section-map")throw new Error("Expected section map page");
 const sectionData=decompressR2004SystemPage(bytes,sectionPage.fileOffset).decompressedPayload,sectionMap=parseR2004SectionMap(sectionData);
 return {pageMap,sectionMap,resolvedSections:resolveR2004SectionPages(sectionMap,pageMap),diagnostics:{pageMapOffset:pageOffset,sectionMapOffset:sectionPage.fileOffset}};
}
