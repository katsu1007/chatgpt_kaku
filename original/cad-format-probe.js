// KAKU native CAD container signature probe.
// This identifies file families and DWG release codes; it does not decode DWG sections/entities.
const DWG_VERSIONS={
 AC1002:"R2.6",AC1003:"R2.6",AC1004:"R9",AC1006:"R10",AC1009:"R11/R12",
 AC1012:"R13",AC1014:"R14",AC1015:"R2000",AC1018:"R2004",AC1021:"R2007",
 AC1024:"R2010",AC1027:"R2013",AC1032:"R2018",AC1035:"R2021",AC1038:"R2024"
};
const ascii=(bytes,start=0,length=6)=>Array.from(bytes.slice(start,start+length),v=>String.fromCharCode(v)).join("");
const starts=(bytes,signature)=>signature.every((v,i)=>bytes[i]===v);
export function inspectCadFileHeader(input,filename=""){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 const name=String(filename).toLowerCase(),prefix=ascii(bytes,0,Math.min(8,bytes.length));
 if(bytes.length>=6&&Object.hasOwn(DWG_VERSIONS,prefix.slice(0,6))){
  const versionCode=prefix.slice(0,6);
  return {format:"dwg",isDwg:true,versionCode,version:DWG_VERSIONS[versionCode],byteLength:bytes.length,
   headerFamily:["AC1012","AC1014","AC1015"].includes(versionCode)?"r13-r2000":"r2004-plus",
   nativeDecodeReady:false,diagnostic:"DWGの版識別に成功。セクション・オブジェクトの復号は未実装"};
 }
 const binaryDxf=[65,117,116,111,67,65,68,32,66,105,110,97,114,121,32,68,88,70,13,10,26,0];
 if(starts(bytes,binaryDxf))return {format:"dxf-binary",isDwg:false,byteLength:bytes.length,nativeDecodeReady:false};
 if(prefix==="JwwData.")return {format:"jww",isDwg:false,byteLength:bytes.length,nativeDecodeReady:false};
 const text=ascii(bytes,0,Math.min(32,bytes.length)).replace(/^\\uFEFF/,"").trimStart();
 if(text.startsWith("0")||text.startsWith("SECTION")||name.endsWith(".dxf")){
  return {format:"dxf-ascii",isDwg:false,byteLength:bytes.length,nativeDecodeReady:false};
 }
 return {format:"unknown",isDwg:false,byteLength:bytes.length,nativeDecodeReady:false,signature:prefix};
}
export function getDwgVersionTable(){return Object.entries(DWG_VERSIONS).map(([versionCode,version])=>({versionCode,version}));}
