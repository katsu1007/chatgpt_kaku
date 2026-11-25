import { polylineToSheetItems } from "./dwg-polyline.js";
// Convert decoded R2004 DWG primitives into KAKU's SheetItem shape.
// Coordinates remain in native DWG units until INSUNITS is decoded.
function rgbHex(value){
 const n=Number(value??0x808080)>>>0;return "#"+(n&0xffffff).toString(16).padStart(6,"0");
}
export function createR2004DwgDrawing(result,{fileName="drawing.dwg"}={}){
 const units=result?.units||{known:false,name:"unknown",scaleToMm:null},scale=units.known?units.scaleToMm:1;
 const entities=result?.entities||[],layers=(result?.layers||[]).map(layer=>({name:layer.name,color:rgbHex(layer.color?.rgb),visible:!!layer.flags?.on&&!layer.flags?.frozen,items:0,actualItems:0,dwgHandle:layer.handle}));
 const layerMap=new Map(layers.map(layer=>[layer.name,layer]));
 const mapped=[];let convertedEntities=0,polylineEntities=0,hatchEntities=0,hatchSegments=0,unsupportedHatchEdges=0,textEntities=0,dimensionEntities=0,attributeEntities=0;
 const add=(entity,geometry,item)=>{
  const layerName=entity.layerName||"DWG:UNRESOLVED:"+String(entity.layerHandle??"0");
  if(!layerMap.has(layerName)){const layer={name:layerName,color:"#808080",visible:true,items:0,actualItems:0,unresolved:true};layers.push(layer);layerMap.set(layerName,layer);}
  item.layer=layerName;item.handle=entity.handleHex||String(entity.selfHandle??"");item.layerHandle=String(entity.layerHandle??"");
  item.sourceFormat="DWG-R2004";item.sourceGeometry=entity.sourceGeometry||geometry;if(entity.blockPath)item.blockPath=entity.blockPath;if(entity.blockTransform)item.blockTransform=entity.blockTransform;if(entity.sourceInsertHandle!==undefined)item.sourceInsertHandle=String(entity.sourceInsertHandle);if(entity.sourceBlockHandle!==undefined)item.sourceBlockHandle=String(entity.sourceBlockHandle);if(entity.sourceEntityHandle!==undefined)item.sourceEntityHandle=String(entity.sourceEntityHandle);if(entity.blockInstanceIndex!==undefined)item.blockInstanceIndex=entity.blockInstanceIndex;
  layerMap.get(layerName).items++;layerMap.get(layerName).actualItems++;mapped.push(item);
 };
 for(const entity of entities){
  const g=entity.geometry;if(!g||g.kind==="unsupported")continue;
  const before=mapped.length;
  if(g.kind==="attrib"){
   add(entity,g,{kind:"text",x:g.insertion.x*scale,y:g.insertion.y*scale,z:g.insertion.z*scale,text:g.text,rotation:g.rotation,height:g.height*scale,widthFactor:g.widthFactor,
    attribute:true,attributeTag:g.tag,attributeFlags:g.attributeFlags,attributeInvisible:g.invisible,attributeConstant:g.constant,styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   attributeEntities++;
  }
  if(g.kind==="dimension"){
   const x=g.textMidpoint[0]*scale,y=g.textMidpoint[1]*scale,measurement=Number.isFinite(g.actualMeasurement)?Number(g.actualMeasurement.toFixed(3)).toString():"";
   const rawText=String(g.userText||"").trim(),label=rawText&&rawText!=="<>"?rawText.replace(/<>/g,measurement):measurement;
   add(entity,g,{kind:"dimension",x,y,dimensionType:g.dimensionName,actualMeasurement:g.actualMeasurement*scale,userText:g.userText,textRotation:g.textRotation,flags1:g.flags1,flags2:g.flags2,
    points:{point10:g.point10,point13:g.point13,point14:g.point14,point15:g.point15,point16:g.point16},dimensionHandles:entity.dimensionHandles?{dimStyle:String(entity.dimensionHandles.dimStyle.value),anonymousBlock:String(entity.dimensionHandles.anonymousBlock.value)}:null});
   if(label)add(entity,g,{kind:"text",x,y,text:label,rotation:g.textRotation,height:null,dimensionText:true,dimensionType:g.dimensionName,actualMeasurement:g.actualMeasurement*scale});
   dimensionEntities++;
  }
  if(g.kind==="text"){
   add(entity,g,{kind:"text",x:g.insertion.x*scale,y:g.insertion.y*scale,z:g.insertion.z*scale,text:g.text,rotation:g.rotation,height:g.height*scale,widthFactor:g.widthFactor,
    alignment:g.alignment,horizontalAlignment:g.horizontalAlignment,verticalAlignment:g.verticalAlignment,styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   textEntities++;
  }else if(g.kind==="mtext"){
   add(entity,g,{kind:"text",x:g.insertion[0]*scale,y:g.insertion[1]*scale,z:g.insertion[2]*scale,text:g.text,rotation:Math.atan2(g.xAxis[1],g.xAxis[0]),height:g.height*scale,width:g.rectWidth*scale,
    attachment:g.attachment,drawingDirection:g.drawingDirection,mtext:true,styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   textEntities++;
  }
  if(g.kind==="hatch"){
   for(let pathIndex=0;pathIndex<(g.paths||[]).length;pathIndex++){
    const path=g.paths[pathIndex],meta={hatchBoundary:true,hatchName:g.name,hatchSolidFill:g.solidFill,hatchPatternType:g.patternType,hatchPathIndex:pathIndex,hatchPathFlags:path.flags,boundaryHandles:(entity.boundaryHandles||[]).map(h=>String(h.value))};
    if(path.kind==="polyline"){
     const segments=polylineToSheetItems({kind:"polyline",vertices:path.vertices,bulges:path.bulges||[],closed:path.closed},{layer:entity.layerName,handle:entity.handleHex,sourceFormat:"DWG-R2004"});
     for(const segment of segments){
      if(segment.kind==="line")add(entity,g,{...segment,...meta,pts:segment.pts.map(v=>v*scale),z0:(g.elevation||0)*scale,z1:(g.elevation||0)*scale});
      else add(entity,g,{...segment,...meta,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale});
      hatchSegments++;
     }
    }else{
     for(const edge of path.edges||[]){
      if(edge.kind==="line"){
       add(entity,g,{kind:"line",...meta,pts:[edge.start.x*scale,edge.start.y*scale,edge.end.x*scale,edge.end.y*scale],z0:(g.elevation||0)*scale,z1:(g.elevation||0)*scale});hatchSegments++;
      }else if(edge.kind==="arc"){
       let a0=edge.startAngle,a1=edge.endAngle;
       if(edge.counterClockwise&&a1<a0)a1+=Math.PI*2;
       if(!edge.counterClockwise&&a1>a0)a1-=Math.PI*2;
       add(entity,g,{kind:"arc",...meta,cx:edge.center.x*scale,cy:edge.center.y*scale,r:edge.radius*scale,a0,a1});hatchSegments++;
      }else unsupportedHatchEdges++;
     }
    }
   }
   if(mapped.length>before)hatchEntities++;
  }
  if(g.kind==="polyline"){
   const normal=g.extrusion||[0,0,1];
   if(Math.abs(normal[0])>1e-6||Math.abs(normal[1])>1e-6||Math.abs(Math.abs(normal[2])-1)>1e-6)continue;
   const segments=polylineToSheetItems(g,{layer:entity.layerName,handle:entity.handleHex,sourceFormat:"DWG-R2004"});
   for(const segment of segments){
    if(segment.kind==="line")add(entity,g,{...segment,pts:segment.pts.map(v=>v*scale),z0:(segment.z0||0)*scale,z1:(segment.z1||0)*scale,segmentIndex:segment.sourceGeometry.index});
    else add(entity,g,{...segment,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale,segmentIndex:segment.sourceGeometry.index});
   }
   if(mapped.length>before)polylineEntities++;
  }
  if(g.kind==="line"){
   const pts=Array.isArray(g.pts)&&typeof g.pts[0]==="number"?g.pts:Array.isArray(g.pts)?g.pts.flatMap(p=>[p.x,p.y]):[];
   if(pts.length>=4)add(entity,g,{kind:"line",pts:pts.slice(0,4).map(v=>v*scale),z0:(g.pts[0]?.z??0)*scale,z1:(g.pts[1]?.z??0)*scale});
  }else if(g.kind==="arc"){
   add(entity,g,{kind:"arc",cx:(g.center?.x??g.cx)*scale,cy:(g.center?.y??g.cy)*scale,r:(g.radius??g.r)*scale,a0:g.startAngle??g.a0,a1:g.endAngle??g.a1});
  }else if(g.kind==="circle"){
   add(entity,g,{kind:"arc",cx:g.center.x*scale,cy:g.center.y*scale,r:g.radius*scale,a0:0,a1:Math.PI*2,isCircle:true});
  }else if(g.kind==="solid"){
   add(entity,g,{kind:"fill",pts:g.points.flatMap(p=>[p.x*scale,p.y*scale]),elevation:g.elevation*scale});
  }else if(g.kind==="point"){
   add(entity,g,{kind:"point",x:(g.point?.x??g.x)*scale,y:(g.point?.y??g.y)*scale,z:(g.point?.z??g.z??0)*scale});
  }
  if(mapped.length>before)convertedEntities++;
 }
 if(!mapped.length)throw new Error("DWG R2004から表示可能なLINE/ARC/CIRCLE/LWPOLYLINE/POINT/SOLIDを取得できませんでした");
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const include=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill"){for(let i=0;i+1<item.pts.length;i+=2)include(item.pts[i],item.pts[i+1]);}
  else if(item.kind==="arc"){include(item.cx-item.r,item.cy-item.r);include(item.cx+item.r,item.cy+item.r);}
  else if(item.kind==="point"||item.kind==="text"||item.kind==="dimension")include(item.x,item.y);
 }
 if(!Number.isFinite(minX)||!Number.isFinite(minY))throw new Error("DWG図形の座標範囲を計算できません");
 const origin={x:minX,y:minY};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill")for(let i=0;i<item.pts.length;i+=2){item.pts[i]-=minX;item.pts[i+1]-=minY;}
  else if(item.kind==="arc"){item.cx-=minX;item.cy-=minY;}
  else if(item.kind==="point"||item.kind==="text"){item.x-=minX;item.y-=minY;}
 }
 const unsupported=entities.length-convertedEntities;
 const warnings=["DWG R2004の試験読込です。",units.known?"INSUNITS："+units.name+"。座標をmmへ換算しました。":"INSUNITS（図面単位）を確定できないため、座標はDWG元単位のままです。mm換算・面積・概算数量の計算は行いません。","現時点で変換できる図形はLINE・ARC・CIRCLE・LWPOLYLINE・POINT・SOLIDと、対応図形を含むINSERT/MINSERTブロックです。寸法・文字・HATCH等は未対応。"];
 if(unsupported)warnings.push("未変換オブジェクト："+unsupported+"件");
 if(result?.diagnostics?.unresolvedLayerCount)warnings.push("レイヤー名未解決："+result.diagnostics.unresolvedLayerCount+"件");
 if(result?.headerWarning)warnings.push(result.headerWarning);
 if(result?.blockExpansion?.reason)warnings.push("DWGブロック展開保留："+result.blockExpansion.reason);
 if(result?.blockExpansion?.skippedGeometry)warnings.push("ブロック変換できない図形："+result.blockExpansion.skippedGeometry+"件");
 if(result?.blockExpansion?.unresolvedBlockReferences)warnings.push("参照先ブロック未解決："+result.blockExpansion.unresolvedBlockReferences+"件");
 if(result?.blockExpansion?.limitReached)warnings.push("安全上限に達したためブロック展開を途中で停止しました。");
 if(hatchEntities)warnings.push("HATCHは境界線のみ表示します。塗りつぶし・パターン・グラデーションは未描画です。");
 if(textEntities)warnings.push("TEXT/MTEXTの文字情報は読み込みました。文字の描画・フォント置換は表示側の対応に依存します。");
 if(dimensionEntities)warnings.push("DIMENSIONの計測値・文字位置を読み込みました。寸法線・矢印の描画は未対応です。");
 if(attributeEntities)warnings.push("INSERTの属性値（ATTRIB）を読み込みました。");
 if(unsupportedHatchEdges)warnings.push("未描画のHATCH楕円・スプライン境界："+unsupportedHatchEdges+"件");
 const sheet={name:fileName,items:mapped,size:{w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY)},origin,nativeOrigin:{x:minX/scale,y:minY/scale},warnings,coordinateSpace:units.known?"sheet-mm":"dwg-native"};
 return {kind:"2d",sheets:[sheet],layers,meta:{format:"DWG",label:"DWG R2004（試験読込）",units:units.known?"mm":"unknown",coordinateSpace:units.known?"sheet-mm":"dwg-native",unitInfo:units,info:{items:mapped.length,figures:convertedEntities,polylines:polylineEntities,hatches:hatchEntities,hatchBoundarySegments:hatchSegments,textEntities,dimensionEntities,attributeEntities,codePage:result?.codePage??null,textEncoding:result?.textEncoding??"windows-1252",version:"R2004",layers:layers.length,units:units.name,scaleToMm:scale,headerWarning:result?.headerWarning||null,unsupported,skippedObjects:result?.diagnostics?.skippedObjectCount??0},warnings}};
}
