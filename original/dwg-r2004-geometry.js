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

function readR2004InsertScale(reader){
 const flag=reader.readBits(2);let x=1,y=1,z=1;
 if(flag===1){y=reader.readBitDoubleWithDefault(1);z=reader.readBitDoubleWithDefault(1);}
 else if(flag===2){x=reader.readRawDouble();y=x;z=x;}
 else if(flag===0){x=reader.readRawDouble();y=reader.readBitDoubleWithDefault(x);z=reader.readBitDoubleWithDefault(x);}
 return {x,y,z,flag};
}
export function decodeR2004InsertGeometry(reader,{multiple=false,maxOwnedObjects=100000}={}){
 const insertionPoint=reader.read3BD(),scale=readR2004InsertScale(reader),rotation=reader.readBitDouble(),extrusion=reader.readBitExtrusion();
 const hasAttributes=reader.readBit()===1,ownedObjectCount=reader.readBitLong();
 if(ownedObjectCount<0||ownedObjectCount>maxOwnedObjects)throw new RangeError("Invalid R2004 INSERT owned-object count");
 const geometry={kind:multiple?"minsert":"insert",insertionPoint,scale,rotation,extrusion,hasAttributes,ownedObjectCount};
 if(multiple){geometry.columns=reader.readBitShort();geometry.rows=reader.readBitShort();geometry.columnSpacing=reader.readBitDouble();geometry.rowSpacing=reader.readBitDouble();}
 return geometry;
}
export function decodeR2004LwPolylineGeometry(reader,{maxVertices=1000000}={}){
 const flags=reader.readBitShort(),constantWidth=reader.readBitDouble(),elevation=reader.readBitDouble(),thickness=reader.readBitDouble(),extrusion=reader.readBitExtrusion();
 const count=reader.readBitLong();if(count<2||count>maxVertices)throw new RangeError("Invalid R2004 LWPOLYLINE vertex count");
 const vertices=Array.from({length:count},()=>reader.read2RD()).map(([x,y])=>({x,y,z:elevation}));
 const bulgeCount=reader.readBitLong();if(bulgeCount!==0&&bulgeCount!==count)throw new RangeError("Invalid R2004 LWPOLYLINE bulge count");
 const bulges=Array.from({length:bulgeCount},()=>reader.readBitDouble());
 const vertexIdCount=reader.readBitLong();if(vertexIdCount!==0&&vertexIdCount!==count)throw new RangeError("Invalid R2004 LWPOLYLINE vertex-id count");
 const vertexIds=Array.from({length:vertexIdCount},()=>reader.readBitLong());
 const widthCount=reader.readBitLong();if(widthCount!==0&&widthCount!==count)throw new RangeError("Invalid R2004 LWPOLYLINE width count");
 const widths=Array.from({length:widthCount},()=>({start:reader.readBitDouble(),end:reader.readBitDouble()}));
 return {kind:"polyline",vertices,bulges:bulges.length?bulges:vertices.map(()=>0),vertexIds,widths,closed:!!(flags&1),flags,constantWidth,elevation,thickness,extrusion};
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
  case 7:return decodeR2004InsertGeometry(reader);
  case 8:return decodeR2004InsertGeometry(reader,{multiple:true});
  case 77:return decodeR2004LwPolylineGeometry(reader);
  case 27:return decodeR2004PointGeometry(reader);
  case 31:return decodeR2004SolidGeometry(reader);
  default:return {kind:"unsupported",typeCode,bitOffset:reader.bitOffset};
 }
}
