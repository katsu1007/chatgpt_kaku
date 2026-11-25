// KAKU-owned R2004 DWG container header reader.
// It locates system pages but deliberately does not decompress section payloads yet.
const HEADER_OFFSET=0x80,HEADER_SIZE=0x6c;
const MAGIC_FILE_ID="AcFssFcAJMB";
const u32=(view,offset)=>view.getUint32(offset,true);
const u64=(view,offset)=>view.getBigUint64(offset,true);
function bytesOf(input){return input instanceof Uint8Array?input:new Uint8Array(input||0);}
function decryptHeaderBytes(encrypted){
 let seed=1;const out=new Uint8Array(encrypted.length);
 for(let i=0;i<encrypted.length;i++){seed=(Math.imul(seed,0x343fd)+0x269ec3)>>>0;out[i]=encrypted[i]^((seed>>>16)&255);}
 return out;
}
export function dwgCrc32(input,seed=0){
 const bytes=bytesOf(input);let crc=(~seed)>>>0;
 for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc&1)?((crc>>>1)^0xedb88320):(crc>>>1);}
 return (~crc)>>>0;
}
export function parseR2004DwgHeader(input){
 const bytes=bytesOf(input);
 if(bytes.length<HEADER_OFFSET+HEADER_SIZE)throw new RangeError("DWG R2004 header is truncated");
 const signature=String.fromCharCode(...bytes.slice(0,6));
 if(signature!=="AC1018")throw new Error("R2004 header parser requires AC1018; received "+signature);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const encrypted=bytes.slice(HEADER_OFFSET,HEADER_OFFSET+HEADER_SIZE);
 const data=decryptHeaderBytes(encrypted),d=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const fileId=String.fromCharCode(...data.slice(0,12)).replace(/\0+$/,"");
 const crcBytes=data.slice();crcBytes.fill(0,0x68,0x6c);
 const expectedCrc=u32(d,0x68),actualCrc=dwgCrc32(crcBytes,0);
 return {
  format:"dwg",version:"R2004",versionCode:"AC1018",
  fileHeader:{maintenanceRelease:bytes[0x0b],flags:bytes[0x0c],previewAddress:u32(view,0x0d),
   applicationVersion:bytes[0x11],applicationMaintenance:bytes[0x12],codePage:view.getUint16(0x13,true),
   securityFlags:u32(view,0x18),summaryInfoAddress:u32(view,0x20),vbaProjectAddress:u32(view,0x24)},
  container:{fileId,headerDataSize:u32(d,0x10),headerFormat:u32(d,0x14),lastSectionPageId:u32(d,0x28),
   lastSectionPageEndAddress:u64(d,0x2c),secondHeaderAddress:u64(d,0x34),sectionPageCount:u32(d,0x40),
   sectionPageMapId:u32(d,0x50),sectionPageMapAddress:u64(d,0x54)+0x100n,
   sectionMapId:u32(d,0x5c),sectionPageArraySize:u32(d,0x60),gapArraySize:u32(d,0x64),
   crc:{expected:expectedCrc,actual:actualCrc,valid:expectedCrc===actualCrc}},
  diagnostics:{headerBytes:HEADER_SIZE,encryptedHeaderOffset:HEADER_OFFSET,sectionPayloadDecoded:false}
 };
}
export function parseR2004SystemPageHeader(input,offset=0){
 const bytes=bytesOf(input);
 if(!Number.isInteger(offset)||offset<0||offset+20>bytes.length)throw new RangeError("DWG system page header is outside the file");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const pageType=u32(view,offset),decompressedSize=u32(view,offset+4),compressedSize=u32(view,offset+8);
 const compressionType=u32(view,offset+12),checksum=u32(view,offset+16);
 if(offset+20+compressedSize>bytes.length)throw new RangeError("DWG system page payload is truncated");
 const knownType=pageType===0x41630e3b?"section-page-map":pageType===0x4163003b?"section-map":"unknown";
 return {pageType,knownType,decompressedSize,compressedSize,compressionType,checksum,dataOffset:offset+20,payload:bytes.slice(offset+20,offset+20+compressedSize)};
}
