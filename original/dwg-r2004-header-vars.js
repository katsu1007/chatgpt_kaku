// KAKU-owned R2004 AcDb:Header variable reader.
// The ordered field list follows the published R2004 header-variable table.
import { DwgBitReader } from "./dwg-bitstream.js";
const START=Uint8Array.from([0xcf,0x7b,0x1f,0x23,0xfd,0xde,0x38,0xa9,0x5f,0x7c,0x68,0xb8,0x4e,0x6d,0x33,0x5f]);
const END=Uint8Array.from([0x30,0x84,0xe0,0xdc,0x02,0x21,0xc7,0x56,0xa0,0x83,0x97,0x47,0xb1,0x92,0xcc,0xa0]);
const fields=[];
const add=(type,...names)=>names.forEach(name=>fields.push({type,name}));
add("BD","UNKNOWN_BD_1","UNKNOWN_BD_2","UNKNOWN_BD_3","UNKNOWN_BD_4");
add("TV","UNKNOWN_TV_1","UNKNOWN_TV_2","UNKNOWN_TV_3","UNKNOWN_TV_4");
add("BL","UNKNOWN_BL_1","UNKNOWN_BL_2");
add("B","DIMASO","DIMSHO");
add("B","PLINEGEN","ORTHOMODE","REGENMODE","FILLMODE","QTEXTMODE","PSLTSCALE","LIMCHECK");
add("B","R2004_UNKNOWN_BOOL");
add("B","USRTIMER","SKPOLY","ANGDIR","SPLFRAME","MIRRTEXT","WORLDVIEW","TILEMODE","PLIMCHECK","VISRETAIN");
add("B","DISPSILH","PELLIPSE");
add("BS","PROXYGRAPHICS");
add("BS","TREEDEPTH","LUNITS","LUPREC","AUNITS","AUPREC","ATTMODE","PDMODE");
add("BL","R2004_UNKNOWN_LONG_1","R2004_UNKNOWN_LONG_2","R2004_UNKNOWN_LONG_3");
add("BS","USER1","USER2","USER3","USER4","USER5","SPLINESEGS","SURFU","SURFV","SURFTYPE","SURFTAB1","SURFTAB2","SPLINETYPE","SHADEDGE","SHADEDIF","UNITMODE","MAXACTVP","ISOLINES","CMLJUST","TEXTQLTY");
add("BD","LTSCALE","TEXTSIZE","TRACEWID","SKETCHINC","FILLETRAD","THICKNESS","ANGBASE","PDSIZE","PLINEWID","USERR1","USERR2","USERR3","USERR4","USERR5","CHAMFERA","CHAMFERB","CHAMFERC","CHAMFERD","FACETRES","CMLSCALE","CELTSCALE");
add("TV","MENUNAME");
add("BL","TDCREATE_DAYS","TDCREATE_MSEC","TDUPDATE_DAYS","TDUPDATE_MSEC");
add("BL","R2004_UNKNOWN_LONG_4","R2004_UNKNOWN_LONG_5","R2004_UNKNOWN_LONG_6");
add("BL","TDINDWG_DAYS","TDINDWG_MSEC","TDUSRTIMER_DAYS","TDUSRTIMER_MSEC");
add("CMC","CECOLOR");
add("HANDLEED","HANDLEED");
add("H","CLAYER","TEXTSTYLE","CELTYPE","DIMSTYLE","CMLSTYLE");
add("BD","PSVPSCALE");
add("3BD","INSBASE_PSPACE","EXTMIN_PSPACE","EXTMAX_PSPACE");
add("2RD","LIMMIN_PSPACE","LIMMAX_PSPACE");
add("BD","ELEVATION_PSPACE");
add("3BD","UCSORG_PSPACE","UCSXDIR_PSPACE","UCSYDIR_PSPACE");
add("H","UCSNAME_PSPACE","PUCSORTHOREF");
add("BS","PUCSORTHOVIEW");
add("H","PUCSBASE");
add("3BD","PUCSORGTOP","PUCSORGBOTTOM","PUCSORGLEFT","PUCSORGRIGHT","PUCSORGFRONT","PUCSORGBACK");
add("3BD","INSBASE_MSPACE","EXTMIN_MSPACE","EXTMAX_MSPACE");
add("2RD","LIMMIN_MSPACE","LIMMAX_MSPACE");
add("BD","ELEVATION_MSPACE");
add("3BD","UCSORG_MSPACE","UCSXDIR_MSPACE","UCSYDIR_MSPACE");
add("H","UCSNAME_MSPACE","UCSORTHOREF");
add("BS","UCSORTHOVIEW");
add("H","UCSBASE");
add("3BD","UCSORGTOP_MSPACE","UCSORGBOTTOM_MSPACE","UCSORGLEFT_MSPACE","UCSORGRIGHT_MSPACE","UCSORGFRONT_MSPACE","UCSORGBACK_MSPACE");
add("TV","DIMPOST","DIMAPOST");
add("BD","DIMSCALE","DIMASZ","DIMEXO","DIMDLI","DIMEXE","DIMRND","DIMDLE","DIMTP","DIMTM");
add("B","DIMTOL","DIMLIM","DIMTIH","DIMTOH","DIMSE1","DIMSE2");
add("BS","DIMTAD","DIMZIN","DIMAzin");
add("BD","DIMTXT","DIMCEN","DIMTSZ","DIMALTF","DIMLFAC","DIMTVP","DIMTFAC","DIMGAP");
add("BD","DIMALTRND");
add("B","DIMALT");
add("BS","DIMALTD");
add("B","DIMTOFL","DIMSAH","DIMTIX","DIMSOXD");
add("CMC","DIMCLRD","DIMCLRE","DIMCLRT");
add("BS","DIMADEC","DIMDEC","DIMTDEC","DIMALTU","DIMALTTD","DIMAUNIT","DIMFRAC","DIMLUNIT","DIMDSEP","DIMTMOVE","DIMJUST");
add("B","DIMSD1","DIMSD2");
add("BS","DIMTOLJ","DIMTZIN","DIMALTZ","DIMALTTZ");
add("B","DIMUPT");
add("BS","DIMATFIT");
add("H","DIMTXSTY","DIMLDRBLK","DIMBLK","DIMBLK1","DIMBLK2");
add("BS","DIMLWD","DIMLWE");
add("H","BLOCK_CONTROL","LAYER_CONTROL","STYLE_CONTROL","LTYPE_CONTROL","VIEW_CONTROL","UCS_CONTROL","VPORT_CONTROL","APPID_CONTROL","DIMSTYLE_CONTROL");
add("H","DICT_ACAD_GROUP","DICT_ACAD_MLINESTYLE","DICT_NAMED_OBJECTS");
add("BS","TSTACKALIGN","TSTACKSIZE");
add("TV","HYPERLINKBASE","STYLESHEET");
add("H","DICT_LAYOUTS","DICT_PLOTSETTINGS","DICT_PLOTSTYLES","DICT_MATERIALS","DICT_COLORS");
add("BL","HEADER_FLAGS");
add("BS","INSUNITS","CEPSNTYPE");
add("TV","FINGERPRINTGUID","VERSIONGUID");
add("RC","SORTENTS","INDEXCTL","HIDETEXT","XCLIPFRAME","DIMASSOC","HALOGAP");
add("BS","OBSCUREDCOLOR","INTERSECTIONCOLOR");
add("RC","OBSCUREDLTYPE","INTERSECTIONDISPLAY");
add("TV","PROJECTNAME");
add("H","BLOCK_RECORD_PAPER_SPACE","BLOCK_RECORD_MODEL_SPACE","LTYPE_BYLAYER","LTYPE_BYBLOCK","LTYPE_CONTINUOUS");
export const R2004_HEADER_FIELDS=fields;
export const R2004_INSUNITS_MM=Object.freeze({
 1:25.4,2:304.8,3:1609344,4:1,5:10,6:1000,7:1000000,
 8:0.0000254,9:0.0254,10:914.4,11:1e-7,12:1e-6,13:0.001,
 14:100,15:10000,16:100000,17:1e12,18:149597870700000,
 19:9.4607304725808e18,20:3.0856775814913673e19,
 21:304.8006096012192,22:25.4000508001016,23:914.4018288036576,24:1609347.218694437
});
export function resolveDwgInsunits(code){
 const factor=R2004_INSUNITS_MM[code];
 if(!factor)return {code,name:code===0?"unitless/unspecified":"unknown",scaleToMm:null,known:false};
 const names={1:"inches",2:"feet",3:"miles",4:"millimeters",5:"centimeters",6:"meters",7:"kilometers",8:"microinches",9:"mils",10:"yards",11:"angstroms",12:"nanometers",13:"microns",14:"decimeters",15:"decameters",16:"hectometers",17:"gigameters",18:"astronomical units",19:"light years",20:"parsecs",21:"US survey feet",22:"US survey inches",23:"US survey yards",24:"US survey miles"};
 return {code,name:names[code]||"unknown",scaleToMm:factor,known:true};
}
function skipCmc(r){r.readBitShort();r.readBitLong();const flags=r.readRawChar();if(flags&1)r.readText();if(flags&2)r.readText();}
function skipField(r,type){
 switch(type){
  case "B":r.readBit();break;
  case "BS":r.readBitShort();break;
  case "BL":r.readBitLong();break;
  case "BD":r.readBitDouble();break;
  case "TV":r.readText();break;
  case "CMC":skipCmc(r);break;
  case "H":r.readHandle();break;
  case "HANDLEED":{const n=r.readRawChar();r.readBytes(n);break;}
  case "3BD":r.read3BD();break;
  case "2RD":r.read2RD();break;
  case "RC":r.readRawChar();break;
  case "RS":r.readRawShort();break;
  default:throw new Error("Unsupported R2004 header field type "+type);
 }
}
export function parseR2004HeaderVariables(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||0);
 if(bytes.length<38)throw new RangeError("R2004 header-variable section is truncated");
 for(let i=0;i<16;i++)if(bytes[i]!==START[i])throw new Error("R2004 header-variable sentinel mismatch");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sectionSize=view.getUint32(16,true),dataEnd=20+sectionSize;
 if(dataEnd+18>bytes.length)throw new RangeError("R2004 header-variable section size exceeds buffer");
 const r=new DwgBitReader(bytes,{bitOffset:20*8});let insunits=null,cepsntype=null,flags=null;
 for(const field of fields){
  if(field.name==="INSUNITS"){insunits=r.readBitShort();continue;}
  if(field.name==="CEPSNTYPE"){cepsntype=r.readBitShort();if(cepsntype===3)r.readHandle();continue;}
  if(field.name==="HEADER_FLAGS"){flags=r.readBitLong();continue;}
  skipField(r,field.type);
 }
 const consumedBits=r.bitOffset-20*8;
 if(r.bitOffset>dataEnd*8)throw new Error("R2004 INSUNITS field lies beyond declared header section");
 const endingSentinel=bytes.slice(dataEnd+2,dataEnd+18);
 const endingValid=endingSentinel.length===16&&endingSentinel.every((b,i)=>b===END[i]);
 return {insunits,units:resolveDwgInsunits(insunits),cepsntype,flags,consumedBits,sectionSize,endingSentinelValid:endingValid,
  diagnostics:{fieldCount:fields.length,bitOffset:r.bitOffset,dataEndBit:dataEnd*8,crcChecked:false}};
}
