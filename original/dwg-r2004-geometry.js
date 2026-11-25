// KAKU-owned R2004 geometry payload decoders.
// Call with the bit cursor positioned at the entity-specific data fields.
import { DwgBitReader } from "./dwg-bitstream.js";
export function decodeR2004LineGeometry(reader){
 const zIsZero=reader.readBit()===1;
 const sx=reader.readRawDouble(),ex=reader.readBitDoubleWithDefault(sx);
 const sy=reader.readRawDouble(),ey=reader.readBitDoubleWithDefault(sy);
 let sz=0,ez=0;if(!zIsZero){sz=reader.readRawDouble();ez=reader.readBitDoubleWithDefault(sz);}
 const thickness=reader.readBitThickness(),extrusion=reader.readBitExtrusion();
 return {kind:"line",pts:[{x:sx,y:sy,z:sz},{x:ex,y:ey,z:ez}],thickness,extrusion,zIsZero};
}
export function decodeR2004ArcGeometry(reader){
 const [x,y,z]=reader.read3BD(),radius=reader.readBitDouble(),thickness=reader.readBitThickness(),extrusion=reader.readBitExtrusion();
 const startAngle=reader.readBitDouble(),endAngle=reader.readBitDouble();
 return {kind:"arc",center:{x,y,z},radius,thickness,extrusion,startAngle,endAngle};
}
export function decodeR2004CircleGeometry(reader){
 const [x,y,z]=reader.read3BD(),radius=reader.readBitDouble(),thickness=reader.readBitThickness(),extrusion=reader.readBitExtrusion();
 return {kind:"circle",center:{x,y,z},radius,thickness,extrusion};
}
export function decodeR2004PointGeometry(reader){
 const [x,y,z]=reader.read3BD(),thickness=reader.readBitThickness(),extrusion=reader.readBitExtrusion(),xAxisAngle=reader.readBitDouble();
 return {kind:"point",point:{x,y,z},thickness,extrusion,xAxisAngle};
}
export function decodeR2004SolidGeometry(reader){
 const thickness=reader.readBitThickness(),elevation=reader.readBitDouble();
 const points=[reader.read2RD(),reader.read2RD(),reader.read2RD(),reader.read2RD()].map(([x,y])=>({x,y,z:elevation}));
 const extrusion=reader.readBitExtrusion();
 return {kind:"solid",points,thickness,elevation,extrusion};
}
export function decodeR2004Geometry(typeCode,input,bitOffset=0){
 const reader=input instanceof DwgBitReader?input:new DwgBitReader(input,{bitOffset});
 switch(typeCode){
  case 17:return decodeR2004ArcGeometry(reader);
  case 18:return decodeR2004CircleGeometry(reader);
  case 19:return decodeR2004LineGeometry(reader);
  case 27:return decodeR2004PointGeometry(reader);
  case 31:return decodeR2004SolidGeometry(reader);
  default:return {kind:"unsupported",typeCode,bitOffset:reader.bitOffset};
 }
}
