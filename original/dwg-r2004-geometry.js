// KAKU-owned R2004 geometry payload decoders.
// Call with the bit cursor positioned at the entity-specific data fields.
import { DwgBitReader } from "./dwg-bitstream.js?v=20261125-codepage1";
export function decodeR2004LegacyPolylineGeometry(typeCode,reader,{maxOwnedObjects=100000}={}){
 if(typeCode===15){
  const flags=reader.readBitShort(),curveType=reader.readBitShort(),startWidth=reader.readBitDouble(),endWidth=reader.readBitDouble();
  const thickness=reader.readBitThickness(),elevation=reader.readBitDouble(),extrusion=reader.readBitExtrusion(),ownedObjectCount=reader.readBitLong();
  if(ownedObjectCount<0||ownedObjectCount>maxOwnedObjects)throw new RangeError("Invalid R2004 2D POLYLINE owned-object count");
  return {kind:"polyline2d",flags,curveType,startWidth,endWidth,thickness,elevation,extrusion,ownedObjectCount,closed:!!(flags&1)};
 }
 if(typeCode===16){
  const flags=reader.readRawChar(),ownedObjectCount=reader.readBitLong();
  if(ownedObjectCount<0||ownedObjectCount>maxOwnedObjects)throw new RangeError("Invalid R2004 3D POLYLINE owned-object count");
  return {kind:"polyline3d",flags,ownedObjectCount,closed:!!(flags&1)};
 }
 if(typeCode===10){
  const flags=reader.readRawChar(),point=reader.read3BD(),rawStartWidth=reader.readBitDouble();
  let startWidth,endWidth;
  if(rawStartWidth<0)startWidth=endWidth=Math.abs(rawStartWidth);
  else{startWidth=rawStartWidth;endWidth=reader.readBitDouble();}
  const bulge=reader.readBitDouble(),tangentDirection=reader.readBitDouble();
  return {kind:"vertex2d",flags,point,startWidth,endWidth,bulge,tangentDirection};
 }
 if(typeCode===11||typeCode===12||typeCode===13){
  const flags=reader.readRawChar(),point=reader.read3BD();
  return {kind:typeCode===11?"vertex3d":typeCode===12?"vertexMesh":"vertexPface",flags,point};
 }
 throw new Error("Unsupported R2004 legacy polyline type "+typeCode);
}
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

function decodeR2004CommonDimensionData(reader){
 const extrusion=reader.read3BD(),textMidpoint=reader.read2RD(),elevation=reader.readBitDouble(),flags1=reader.readRawChar(),userText=reader.readText(65535);
 const textRotation=reader.readBitDouble(),horizontalDirection=reader.readBitDouble(),insertScaleX=reader.readBitDouble(),insertScaleY=reader.readBitDouble(),insertScaleZ=reader.readBitDouble(),insertRotation=reader.readBitDouble();
 const attachment=reader.readBitShort(),lineSpacingStyle=reader.readBitShort(),lineSpacingFactor=reader.readBitDouble(),actualMeasurement=reader.readBitDouble(),point12=reader.read2RD();
 return {extrusion,textMidpoint,elevation,flags1,userText,textRotation,horizontalDirection,insertScale:{x:insertScaleX,y:insertScaleY,z:insertScaleZ},insertRotation,attachment,lineSpacingStyle,lineSpacingFactor,actualMeasurement,point12};
}
export function decodeR2004DimensionGeometry(typeCode,reader){
 const common=decodeR2004CommonDimensionData(reader),geometry={kind:"dimension",dimensionType:typeCode,dimensionName:({20:"ordinate",21:"linear",22:"aligned",23:"angular-3pt",24:"angular-2line",25:"radius",26:"diameter"})[typeCode],...common};
 if(typeCode===20){geometry.point10=reader.read3BD();geometry.point13=reader.read3BD();geometry.point14=reader.read3BD();geometry.flags2=reader.readRawChar();}
 else if(typeCode===21){geometry.point13=reader.read3BD();geometry.point14=reader.read3BD();geometry.point10=reader.read3BD();geometry.extensionLineRotation=reader.readBitDouble();geometry.dimensionRotation=reader.readBitDouble();}
 else if(typeCode===22){geometry.point13=reader.read3BD();geometry.point14=reader.read3BD();geometry.point10=reader.read3BD();geometry.extensionLineRotation=reader.readBitDouble();}
 else if(typeCode===23){geometry.point10=reader.read3BD();geometry.point13=reader.read3BD();geometry.point14=reader.read3BD();geometry.point15=reader.read3BD();}
 else if(typeCode===24){geometry.point16=reader.read2RD();geometry.point13=reader.read3BD();geometry.point14=reader.read3BD();geometry.point15=reader.read3BD();geometry.point10=reader.read3BD();}
 else if(typeCode===25){geometry.point10=reader.read3BD();geometry.point15=reader.read3BD();geometry.leaderLength=reader.readBitDouble();}
 else if(typeCode===26){geometry.point15=reader.read3BD();geometry.point10=reader.read3BD();geometry.leaderLength=reader.readBitDouble();}
 return geometry;
}
export function decodeR2004TextGeometry(reader){
 const dataFlags=reader.readRawChar(),elevation=(dataFlags&0x01)?0:reader.readRawDouble();
 const [x,y]=reader.read2RD(),insertion={x,y,z:elevation};
 const alignment=(dataFlags&0x02)?{x,y,z:elevation}:(()=>{const [ax,ay]=[reader.readBitDoubleWithDefault(x),reader.readBitDoubleWithDefault(y)];return {x:ax,y:ay,z:elevation};})();
 const extrusion=reader.readBitExtrusion(),thickness=reader.readBitThickness();
 const obliqueAngle=(dataFlags&0x04)?0:reader.readRawDouble(),rotation=(dataFlags&0x08)?0:reader.readRawDouble();
 const height=reader.readRawDouble(),widthFactor=(dataFlags&0x10)?1:reader.readRawDouble(),text=reader.readText(65535);
 const generation=(dataFlags&0x20)?0:reader.readBitShort(),horizontalAlignment=(dataFlags&0x40)?0:reader.readBitShort(),verticalAlignment=(dataFlags&0x80)?0:reader.readBitShort();
 return {kind:"text",dataFlags,elevation,insertion,alignment,extrusion,thickness,obliqueAngle,rotation,height,widthFactor,text,generation,horizontalAlignment,verticalAlignment};
}
export function decodeR2004MLineGeometry(reader,{maxVertices=100000,maxStyleElements=64,maxParameters=10000}={}){
 const scale=reader.readBitDouble(),justification=reader.readBitShort(),basePoint=reader.read3BD(),extrusion=reader.read3BD(),openClosed=reader.readBitShort(),linesInStyle=reader.readRawChar(),vertexCount=reader.readBitShort();
 if(linesInStyle<0||linesInStyle>maxStyleElements||vertexCount<0||vertexCount>maxVertices)throw new RangeError("Invalid R2004 MLINE style/vertex count");
 const vertices=[];
 for(let i=0;i<vertexCount;i++){
  const point=reader.read3BD(),direction=reader.read3BD(),miter=reader.read3BD(),elements=[];
  for(let j=0;j<linesInStyle;j++){
   const segmentCount=reader.readBitShort();if(segmentCount<0||segmentCount>maxParameters)throw new RangeError("Invalid R2004 MLINE segment parameter count");
   const segmentParams=Array.from({length:segmentCount},()=>reader.readBitDouble());
   const areaCount=reader.readBitShort();if(areaCount<0||areaCount>maxParameters)throw new RangeError("Invalid R2004 MLINE area fill parameter count");
   const areaFillParams=Array.from({length:areaCount},()=>reader.readBitDouble());
   elements.push({segmentParams,areaFillParams});
  }
  vertices.push({point,direction,miter,elements});
 }
 return {kind:"mline",scale,justification,basePoint,extrusion,openClosed,closed:openClosed===3,linesInStyle,vertexCount,vertices};
}
export function decodeR2004EllipseGeometry(reader){
 const center=reader.read3BD(),majorAxis=reader.read3BD(),extrusion=reader.read3BD(),axisRatio=reader.readBitDouble(),startParameter=reader.readBitDouble(),endParameter=reader.readBitDouble();
 return {kind:"ellipse",center,majorAxis,extrusion,axisRatio,startParameter,endParameter};
}
export function decodeR2004SplineGeometry(reader,{maxKnots=100000,maxControlPoints=100000,maxFitPoints=100000}={}){
 const scenario=reader.readBitLong();
 if(scenario!==1&&scenario!==2)throw new Error("Unsupported R2004 SPLINE scenario "+scenario);
 const degree=reader.readBitLong();
 let rational=false,closed=false,periodic=false,knotTolerance=0,controlTolerance=0,fitTolerance=0,beginTangent=null,endTangent=null,knots=[],controlPoints=[],fitPoints=[],weightsPresent=false,weights=[];
 if(scenario===2){
  fitTolerance=reader.readBitDouble();beginTangent=reader.read3BD();endTangent=reader.read3BD();
  const fitCount=reader.readBitLong();if(fitCount<0||fitCount>maxFitPoints)throw new RangeError("Invalid R2004 SPLINE fit point count");
  fitPoints=Array.from({length:fitCount},()=>reader.read3BD());
 }else{
  rational=reader.readBit()===1;closed=reader.readBit()===1;periodic=reader.readBit()===1;
  knotTolerance=reader.readBitDouble();controlTolerance=reader.readBitDouble();
  const knotCount=reader.readBitLong(),controlCount=reader.readBitLong();
  if(knotCount<0||knotCount>maxKnots||controlCount<0||controlCount>maxControlPoints)throw new RangeError("Invalid R2004 SPLINE knot/control point count");
  weightsPresent=reader.readBit()===1;
  knots=Array.from({length:knotCount},()=>reader.readBitDouble());
  controlPoints=Array.from({length:controlCount},()=>reader.read3BD());
  if(weightsPresent)weights=Array.from({length:controlCount},()=>reader.readRawDouble());
 }
 return {kind:"spline",scenario,degree,rational,closed,periodic,knotTolerance,controlTolerance,fitTolerance,beginTangent,endTangent,knots,controlPoints,weightsPresent,weights,fitPoints};
}
export function decodeR2004AttributeGeometry(typeCode,reader){
 const text=decodeR2004TextGeometry(reader),tag=reader.readText(4096),fieldLength=reader.readBitShort(),flags=reader.readRawChar();
 const prompt=typeCode===3?reader.readText(65535):null;
 return {...text,kind:typeCode===2?"attrib":"attdef",tag,fieldLength,attributeFlags:flags,prompt,invisible:!!(flags&1),constant:!!(flags&2),verificationRequired:!!(flags&4),preset:!!(flags&8)};
}
function readR2004MTextColor(reader){
 const index=reader.readBitShort(),rgb=reader.readBitLong(),flags=reader.readRawChar(),color={index,rgb,flags};
 if(flags&1)color.name=reader.readText(4096);
 if(flags&2)color.bookName=reader.readText(4096);
 return color;
}
export function decodeR2004MTextGeometry(reader){
 const insertion=reader.read3BD(),extrusion=reader.read3BD(),xAxis=reader.read3BD(),rectWidth=reader.readBitDouble(),height=reader.readBitDouble();
 const attachment=reader.readBitShort(),drawingDirection=reader.readBitShort(),extentsHeight=reader.readBitDouble(),extentsWidth=reader.readBitDouble(),text=reader.readText(65535);
 const lineSpacingStyle=reader.readBitShort(),lineSpacingFactor=reader.readBitDouble(),unknownFlag=reader.readBit()===1,backgroundFlags=reader.readBitLong();
 let backgroundScaleFactor=null,backgroundColor=null,backgroundTransparency=null;
 if(backgroundFlags&1){backgroundScaleFactor=reader.readBitLong();backgroundColor=readR2004MTextColor(reader);backgroundTransparency=reader.readBitLong();}
 return {kind:"mtext",insertion,extrusion,xAxis,rectWidth,height,attachment,drawingDirection,extentsHeight,extentsWidth,text,
  lineSpacingStyle,lineSpacingFactor,unknownFlag,backgroundFlags,backgroundScaleFactor,backgroundColor,backgroundTransparency};
}
function checkedCount(reader,label,max=100000){
 const count=reader.readBitLong();
 if(!Number.isSafeInteger(count)||count<0||count>max)throw new RangeError("Invalid R2004 HATCH "+label+" count");
 return count;
}
function decodeR2004HatchPath(reader,{maxEdges=100000,maxVertices=100000,maxKnots=100000,maxControlPoints=100000}={}){
 const flags=reader.readBitLong(),path={flags,kind:(flags&2)?"polyline":"edges",boundaryObjectCount:0};
 if(flags&2){
  path.bulgesPresent=reader.readBit()===1;path.closed=reader.readBit()===1;
  const count=checkedCount(reader,"polyline vertex",maxVertices);
  path.vertices=Array.from({length:count},()=>{const [x,y]=reader.read2RD();return {x,y};});
  if(path.bulgesPresent)path.bulges=Array.from({length:count},()=>reader.readBitDouble());
  else path.bulges=path.vertices.map(()=>0);
 }else{
  const count=checkedCount(reader,"edge",maxEdges);path.edges=[];
  for(let i=0;i<count;i++){
   const type=reader.readRawChar(),edge={type};
   if(type===1){const [x1,y1]=reader.read2RD(),[x2,y2]=reader.read2RD();edge.kind="line";edge.start={x:x1,y:y1};edge.end={x:x2,y:y2};}
   else if(type===2){const [x,y]=reader.read2RD();edge.kind="arc";edge.center={x,y};edge.radius=reader.readBitDouble();edge.startAngle=reader.readBitDouble();edge.endAngle=reader.readBitDouble();edge.counterClockwise=reader.readBit()===1;}
   else if(type===3){const [x,y]=reader.read2RD(),[mx,my]=reader.read2RD();edge.kind="ellipse";edge.center={x,y};edge.majorAxis={x:mx,y:my};edge.minorMajorRatio=reader.readBitDouble();edge.startAngle=reader.readBitDouble();edge.endAngle=reader.readBitDouble();edge.counterClockwise=reader.readBit()===1;}
   else if(type===4){
    edge.kind="spline";edge.degree=checkedCount(reader,"spline degree",32);edge.rational=reader.readBit()===1;edge.periodic=reader.readBit()===1;
    const knotCount=checkedCount(reader,"spline knot",maxKnots),controlCount=checkedCount(reader,"spline control point",maxControlPoints);
    edge.knots=Array.from({length:knotCount},()=>reader.readBitDouble());
    edge.controlPoints=Array.from({length:controlCount},()=>{const [x,y]=reader.read2RD();return {x,y,...(edge.rational?{weight:reader.readBitDouble()}: {})};});
   }else throw new Error("Unsupported R2004 HATCH edge type "+type);
   path.edges.push(edge);
  }
 }
 path.boundaryObjectCount=checkedCount(reader,"boundary object",maxEdges);
 return path;
}
export function decodeR2004HatchGeometry(reader,options={}){
 const isGradientFill=reader.readBitLong(),reserved=reader.readBitLong(),gradientAngle=reader.readBitDouble(),gradientShift=reader.readBitDouble();
 const singleColorGradient=reader.readBitLong(),gradientTint=reader.readBitDouble(),gradientColorCount=checkedCount(reader,"gradient color",4096),gradientColors=[];
 for(let i=0;i<gradientColorCount;i++)gradientColors.push({unknownDouble:reader.readBitDouble(),unknownShort:reader.readBitShort(),rgb:reader.readBitLong(),ignoredColorByte:reader.readRawChar()});
 const gradientName=reader.readText(4096),elevation=reader.readBitDouble(),extrusion=reader.read3BD(),name=reader.readText(4096);
 const solidFill=reader.readBit()===1,associative=reader.readBit()===1,pathCount=checkedCount(reader,"path",options.maxPaths??10000);
 const paths=Array.from({length:pathCount},()=>decodeR2004HatchPath(reader,options));
 const style=reader.readBitShort(),patternType=reader.readBitShort();let pattern=null;
 if(!solidFill){
  pattern={angle:reader.readBitDouble(),scale:reader.readBitDouble(),double:reader.readBit()===1,lines:[]};
  const lineCount=reader.readBitShort();if(lineCount<0||lineCount>(options.maxPatternLines??10000))throw new RangeError("Invalid R2004 HATCH pattern line count");
  for(let i=0;i<lineCount;i++){
   const angle=reader.readBitDouble(),base=reader.read2BD(),offset=reader.read2BD(),dashCount=reader.readBitShort();
   if(dashCount<0||dashCount>(options.maxPatternDashes??10000))throw new RangeError("Invalid R2004 HATCH pattern dash count");
   pattern.lines.push({angle,base,offset,dashes:Array.from({length:dashCount},()=>reader.readBitDouble())});
  }
 }
 if(paths.some(path=>path.flags&4))pattern={...(pattern||{}),pixelSize:reader.readBitDouble()};
 const seedCount=checkedCount(reader,"seed point",options.maxSeedPoints??100000),seedPoints=Array.from({length:seedCount},()=>reader.read2RD());
 return {kind:"hatch",isGradientFill,reserved,gradientAngle,gradientShift,singleColorGradient,gradientTint,gradientColors,gradientName,
  elevation,extrusion,name,solidFill,associative,pathCount,paths,style,patternType,pattern,seedPoints,
  boundaryObjectCount:paths.reduce((n,path)=>n+path.boundaryObjectCount,0)};
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
  case 10:case 11:case 12:case 13:case 15:case 16:return decodeR2004LegacyPolylineGeometry(typeCode,reader);
  case 19:return decodeR2004LineGeometry(reader);
  case 20:case 21:case 22:case 23:case 24:case 25:case 26:return decodeR2004DimensionGeometry(typeCode,reader);
  case 1:return decodeR2004TextGeometry(reader);
  case 2:case 3:return decodeR2004AttributeGeometry(typeCode,reader);
  case 44:return decodeR2004MTextGeometry(reader);
  case 7:return decodeR2004InsertGeometry(reader);
  case 8:return decodeR2004InsertGeometry(reader,{multiple:true});
  case 77:return decodeR2004LwPolylineGeometry(reader);
  case 78:return decodeR2004HatchGeometry(reader);
  case 27:return decodeR2004PointGeometry(reader);
  case 31:return decodeR2004SolidGeometry(reader);
  case 35:return decodeR2004EllipseGeometry(reader);
  case 47:return decodeR2004MLineGeometry(reader);
  case 36:return decodeR2004SplineGeometry(reader);
  default:return {kind:"unsupported",typeCode,bitOffset:reader.bitOffset};
 }
}
