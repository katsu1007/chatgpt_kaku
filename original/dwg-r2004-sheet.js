// Convert decoded R2004 DWG primitives into KAKU's SheetItem shape.
// Coordinates remain in native DWG units until INSUNITS is decoded.
function rgbHex(value){
 const n=Number(value??0x808080)>>>0;return "#"+(n&0xffffff).toString(16).padStart(6,"0");
}
export function createR2004DwgDrawing(result,{fileName="drawing.dwg"}={}){
 const units=result?.units||{known:false,name:"unknown",scaleToMm:null},scale=units.known?units.scaleToMm:1;
 const entities=result?.entities||[],layers=(result?.layers||[]).map(layer=>({name:layer.name,color:rgbHex(layer.color?.rgb),visible:!!layer.flags?.on&&!layer.flags?.frozen,items:0,actualItems:0,dwgHandle:layer.handle}));
 const layerMap=new Map(layers.map(layer=>[layer.name,layer]));
 const mapped=[];
 const add=(entity,geometry,item)=>{
  const layerName=entity.layerName||"DWG:UNRESOLVED:"+String(entity.layerHandle??"0");
  if(!layerMap.has(layerName)){const layer={name:layerName,color:"#808080",visible:true,items:0,actualItems:0,unresolved:true};layers.push(layer);layerMap.set(layerName,layer);}
  item.layer=layerName;item.handle=entity.handleHex||String(entity.selfHandle??"");item.layerHandle=String(entity.layerHandle??"");
  item.sourceFormat="DWG-R2004";item.sourceGeometry=geometry;
  layerMap.get(layerName).items++;layerMap.get(layerName).actualItems++;mapped.push(item);
 };
 for(const entity of entities){
  const g=entity.geometry;if(!g||g.kind==="unsupported")continue;
  if(g.kind==="line"){
   add(entity,g,{kind:"line",pts:[g.pts[0].x*scale,g.pts[0].y*scale,g.pts[1].x*scale,g.pts[1].y*scale],z0:g.pts[0].z*scale,z1:g.pts[1].z*scale});
  }else if(g.kind==="arc"){
   add(entity,g,{kind:"arc",cx:g.center.x*scale,cy:g.center.y*scale,r:g.radius*scale,a0:g.startAngle,a1:g.endAngle});
  }else if(g.kind==="circle"){
   add(entity,g,{kind:"arc",cx:g.center.x*scale,cy:g.center.y*scale,r:g.radius*scale,a0:0,a1:Math.PI*2,isCircle:true});
  }else if(g.kind==="solid"){
   add(entity,g,{kind:"fill",pts:g.points.flatMap(p=>[p.x*scale,p.y*scale]),elevation:g.elevation*scale});
  }else if(g.kind==="point"){
   add(entity,g,{kind:"point",x:g.point.x*scale,y:g.point.y*scale,z:g.point.z*scale});
  }
 }
 if(!mapped.length)throw new Error("DWG R2004から表示可能なLINE/ARC/CIRCLE/POINT/SOLIDを取得できませんでした");
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const include=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill"){for(let i=0;i+1<item.pts.length;i+=2)include(item.pts[i],item.pts[i+1]);}
  else if(item.kind==="arc"){include(item.cx-item.r,item.cy-item.r);include(item.cx+item.r,item.cy+item.r);}
  else if(item.kind==="point")include(item.x,item.y);
 }
 if(!Number.isFinite(minX)||!Number.isFinite(minY))throw new Error("DWG図形の座標範囲を計算できません");
 const origin={x:minX,y:minY};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill")for(let i=0;i<item.pts.length;i+=2){item.pts[i]-=minX;item.pts[i+1]-=minY;}
  else if(item.kind==="arc"){item.cx-=minX;item.cy-=minY;}
  else if(item.kind==="point"){item.x-=minX;item.y-=minY;}
 }
 const unsupported=entities.length-mapped.length;
 const warnings=["DWG R2004の試験読込です。",units.known?"INSUNITS："+units.name+"。座標をmmへ換算しました。":"INSUNITS（図面単位）を確定できないため、座標はDWG元単位のままです。mm換算・面積・概算数量の計算は行いません。","現時点で変換できる図形はLINE・ARC・CIRCLE・POINT・SOLIDです。INSERT/ブロック変換、寸法、文字、HATCH等は未対応です。"];
 if(unsupported)warnings.push("未変換オブジェクト："+unsupported+"件");
 if(result?.diagnostics?.unresolvedLayerCount)warnings.push("レイヤー名未解決："+result.diagnostics.unresolvedLayerCount+"件");\n if(result?.headerWarning)warnings.push(result.headerWarning);
 const sheet={name:fileName,items:mapped,size:{w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY)},origin,nativeOrigin:{x:minX/scale,y:minY/scale},warnings,coordinateSpace:units.known?"sheet-mm":"dwg-native"};
 return {kind:"2d",sheets:[sheet],layers,meta:{format:"DWG",label:"DWG R2004（試験読込）",units:units.known?"mm":"unknown",coordinateSpace:units.known?"sheet-mm":"dwg-native",unitInfo:units,info:{items:mapped.length,figures:mapped.length,version:"R2004",layers:layers.length,units:units.name,scaleToMm:scale,headerWarning:result?.headerWarning||null,unsupported,skippedObjects:result?.diagnostics?.skippedObjectCount??0},warnings}};
}
