import { polylineToSheetItems } from "./dwg-polyline.js";
import { tessellateCadCurve } from "./cad-curve-tessellation.js";
import { isValidOcsNormal, isWorldZNormal, tessellateOcsArc, tessellateOcsPolyline, transformOcsPoint, transformOcsVector } from "./dwg-ocs.js";
// Convert decoded R2004 DWG primitives into KAKU's SheetItem shape.
// Coordinates remain in native DWG units until INSUNITS is decoded.
function rgbHex(value){
 const n=Number(value??0x808080)>>>0;return "#"+(n&0xffffff).toString(16).padStart(6,"0");
}
function point3(value){return Array.isArray(value)?{x:value[0],y:value[1],z:value[2]||0}:value;}
function sampleEllipse(g){
 const center=point3(g.center),major=point3(g.majorAxis),normal=g.extrusion||[0,0,1];
 if(!center||!major||Math.abs(major.z||0)>1e-7||!isValidOcsNormal(normal))return [];
 const curve=tessellateCadCurve({...g,kind:"ellipse"});
 if(curve.points.length<2)return [];
 return {vertices:curve.points.map(([x,y])=>{const p=transformOcsPoint([x,y,center.z||0],normal);return {x:p[0],y:p[1],z:p[2]};}),closed:curve.closed};
}
function sampleSpline(g){
 const source=g.scenario===2?(g.fitPoints||[]):(g.controlPoints||[]);
 const points=source.map(point3);if(points.length<2||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return [];
 const z=points[0].z||0;
 if(points.some(p=>Math.abs((p.z||0)-z)>1e-7))return [];
 const curve=tessellateCadCurve({...g,kind:"spline"});
 if(curve.points.length<2)return [];
 return {vertices:curve.points.map(([x,y])=>({x,y,z})),closed:curve.closed};
}
function sampleHatchEllipse(edge){
 const center=edge.center,axis=edge.majorAxis,ratio=Number(edge.minorMajorRatio);
 if(!center||!axis||!Number.isFinite(ratio)||ratio<=0)return null;
 let start=Number(edge.startAngle),end=Number(edge.endAngle);
 if(!Number.isFinite(start)||!Number.isFinite(end))return null;
 if(edge.counterClockwise&&end<start)end+=Math.PI*2;
 if(!edge.counterClockwise&&end>start)end-=Math.PI*2;
 const sweep=end-start;if(!Number.isFinite(sweep)||Math.abs(sweep)<1e-10||Math.abs(sweep)>Math.PI*2+1e-6)return null;
 const minor={x:-axis.y*ratio,y:axis.x*ratio};
 const steps=Math.max(8,Math.min(512,Math.ceil(Math.abs(sweep)/(Math.PI/48))));
 const points=[];
 for(let i=0;i<=steps;i++){
  const t=start+sweep*i/steps,c=Math.cos(t),v=Math.sin(t);
  points.push({x:center.x+axis.x*c+minor.x*v,y:center.y+axis.y*c+minor.y*v});
 }
 return points;
}
function sampleHatchSpline(edge){
 const cp=edge.controlPoints||[],knots=edge.knots||[],degree=Number(edge.degree),n=cp.length-1;
 if(!Number.isInteger(degree)||degree<1||cp.length<degree+1||knots.length<n+degree+2)return null;
 const start=knots[degree],end=knots[n+1];
 if(!Number.isFinite(start)||!Number.isFinite(end)||!(end>start))return null;
 const evaluate=t=>{
  let k=n;
  if(t<end){k=degree;while(k<n&&!(t>=knots[k]&&t<knots[k+1]))k++;}
  const d=[];
  for(let j=0;j<=degree;j++){
   const q=cp[k-degree+j],w=edge.rational?(Number(q.weight)||0):1;
   if(!q||![q.x,q.y,w].every(Number.isFinite))return null;
   d[j]=[q.x*w,q.y*w,w];
  }
  for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){
   const i=k-degree+j,den=knots[i+degree-r+1]-knots[i],alpha=den===0?0:(t-knots[i])/den;
   for(let z=0;z<3;z++)d[j][z]=(1-alpha)*d[j-1][z]+alpha*d[j][z];
  }
  const w=d[degree][2];return Math.abs(w)>1e-12?{x:d[degree][0]/w,y:d[degree][1]/w}:null;
 };
 const steps=Math.max(24,Math.min(512,cp.length*24)),points=[];
 for(let i=0;i<=steps;i++){
  const point=evaluate(start+(end-start)*i/steps);if(!point)return null;points.push(point);
 }
 return points;
}
export function createR2004DwgDrawing(result,{fileName="drawing.dwg"}={}){
 const units=result?.units||{known:false,name:"unknown",scaleToMm:null},scale=units.known?units.scaleToMm:1,version=result?.version||"R2004",sourceFormat="DWG-"+version;
 const entities=result?.entities||[],layers=(result?.layers||[]).map(layer=>({name:layer.name,color:rgbHex(layer.color?.rgb),visible:!!layer.flags?.on&&!layer.flags?.frozen,items:0,actualItems:0,dwgHandle:layer.handle}));
 const layerMap=new Map(layers.map(layer=>[layer.name,layer]));
 const mapped=[];let convertedEntities=0,polylineEntities=0,hatchEntities=0,hatchSegments=0,hatchFillCandidates=0,unsupportedHatchEdges=0,textEntities=0,dimensionEntities=0,attributeEntities=0,ellipseEntities=0,splineEntities=0,curveSegments=0,unsupportedCurves=0,mlineEntities=0,mlineBoundarySegments=0;
 const add=(entity,geometry,item)=>{
  const layerName=entity.layerName||"DWG:UNRESOLVED:"+String(entity.layerHandle??"0");
  if(!layerMap.has(layerName)){const layer={name:layerName,color:"#808080",visible:true,items:0,actualItems:0,unresolved:true};layers.push(layer);layerMap.set(layerName,layer);}
  item.layer=layerName;item.handle=entity.handleHex||String(entity.selfHandle??"");item.layerHandle=String(entity.layerHandle??"");
  item.sourceFormat=sourceFormat;item.sourceGeometry=entity.sourceGeometry||geometry;if(entity.blockPath)item.blockPath=entity.blockPath;if(entity.blockTransform)item.blockTransform=entity.blockTransform;if(entity.sourceInsertHandle!==undefined)item.sourceInsertHandle=String(entity.sourceInsertHandle);if(entity.sourceBlockHandle!==undefined)item.sourceBlockHandle=String(entity.sourceBlockHandle);if(entity.sourceEntityHandle!==undefined)item.sourceEntityHandle=String(entity.sourceEntityHandle);if(entity.blockInstanceIndex!==undefined)item.blockInstanceIndex=entity.blockInstanceIndex;
  layerMap.get(layerName).items++;layerMap.get(layerName).actualItems++;mapped.push(item);
 };
 const addPointChain=(entity,geometry,points,closed,metadata={})=>{
  if(!Array.isArray(points)||points.length<2)return 0;
  const vertices=points.map(p=>Array.isArray(p)?{x:p[0],y:p[1],z:p[2]||0}:p);
  const segments=polylineToSheetItems({kind:"polyline",vertices,bulges:vertices.map(()=>0),closed},{layer:entity.layerName,handle:entity.handleHex,sourceFormat});
  for(const segment of segments)if(segment.kind==="line")add(entity,geometry,{...segment,pts:segment.pts.map(v=>v*scale),z0:(segment.z0||0)*scale,z1:(segment.z1||0)*scale,...metadata});
  return segments.length;
 };
 for(const entity of entities){
  const g=entity.geometry;if(!g||g.kind==="unsupported")continue;
  const before=mapped.length;
  if(g.kind==="mline"){
   for(const boundary of g.boundaries||[]){
    const segments=polylineToSheetItems({kind:"polyline",vertices:boundary.vertices,bulges:boundary.vertices.map(()=>0),closed:g.closed},{layer:entity.layerName,handle:entity.handleHex,sourceFormat:sourceFormat});
    for(const segment of segments){
     if(segment.kind==="line")add(entity,g,{...segment,pts:segment.pts.map(v=>v*scale),z0:(segment.z0||0)*scale,z1:(segment.z1||0)*scale,
      mlineBoundary:true,mlineStyleName:g.mlineStyleName,mlineOffset:boundary.offset*scale,mlineElementIndex:boundary.elementIndex});
     else add(entity,g,{...segment,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale,mlineBoundary:true,mlineStyleName:g.mlineStyleName,mlineOffset:boundary.offset*scale,mlineElementIndex:boundary.elementIndex});
     mlineBoundarySegments++;
    }
   }
   if((g.boundaries||[]).length)mlineEntities++;
  }
  if(g.kind==="ellipse"||g.kind==="spline"){
   const sampled=g.kind==="ellipse"?sampleEllipse(g):sampleSpline(g);
   if(!sampled||!sampled.vertices||sampled.vertices.length<2)unsupportedCurves++;
   else{
    const segments=polylineToSheetItems({kind:"polyline",vertices:sampled.vertices,bulges:sampled.vertices.map(()=>0),closed:sampled.closed},{layer:entity.layerName,handle:entity.handleHex,sourceFormat:sourceFormat});
    for(const segment of segments){
     if(segment.kind==="line")add(entity,g,{...segment,pts:segment.pts.map(v=>v*scale),z0:(segment.z0||0)*scale,z1:(segment.z1||0)*scale,curveApproximation:g.kind,curveClosed:sampled.closed,ocsTransformed:g.kind==="ellipse"&&!isWorldZNormal(g.extrusion||[0,0,1])});
     else add(entity,g,{...segment,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale,curveApproximation:g.kind});
     curveSegments++;
    }
    if(g.kind==="ellipse")ellipseEntities++;else splineEntities++;
   }
  }
  if(g.kind==="attrib"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;
   const insertion=point3(g.insertion),wcs=transformOcsPoint([insertion.x,insertion.y,insertion.z||0],normal);
   const baseline=transformOcsVector([Math.cos(g.rotation||0),Math.sin(g.rotation||0),0],normal);
   const alignment=g.alignment?point3(g.alignment):null,aligned=alignment?transformOcsPoint([alignment.x,alignment.y,alignment.z||0],normal):null;
   add(entity,g,{kind:"text",x:wcs[0]*scale,y:wcs[1]*scale,z:wcs[2]*scale,text:g.text,rotation:Math.atan2(baseline[1],baseline[0]),height:g.height*scale,widthFactor:g.widthFactor,
    alignment:aligned?{x:aligned[0]*scale,y:aligned[1]*scale,z:aligned[2]*scale}:null,attribute:true,attributeTag:g.tag,attributeFlags:g.attributeFlags,attributeInvisible:g.invisible,attributeConstant:g.constant,
    ocsTransformed:!isWorldZNormal(normal),styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   attributeEntities++;
  }
  if(g.kind==="dimension"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;const textPoint=transformOcsPoint([g.textMidpoint[0],g.textMidpoint[1],g.elevation||0],normal),x=textPoint[0]*scale,y=textPoint[1]*scale;
   const angular=g.dimensionName==="angular-3pt"||g.dimensionName==="angular-2line";
   const measured=Number.isFinite(g.actualMeasurement)?(angular?g.actualMeasurement*180/Math.PI:g.actualMeasurement*scale):null;
   const measurement=measured==null?"":Number(measured.toFixed(3)).toString()+(angular?"°":"");
   const rawText=String(g.userText||"").trim(),label=rawText&&rawText!=="<>"?rawText.replace(/<>/g,measurement):measurement;
   const points=Object.fromEntries(["point10","point13","point14","point15","point16"].map(key=>{
    if(!Array.isArray(g[key]))return [key,g[key]];
    const value=key==="point16"?transformOcsPoint([g[key][0],g[key][1],g[key][2]??g.elevation??0],normal):g[key];
    return [key,value.map(v=>v*scale)];
   }));
   add(entity,g,{kind:"dimension",x,y,dimensionType:g.dimensionName,actualMeasurement:measured,measurementUnit:angular?"deg":(units.known?"mm":"dwg-native"),userText:g.userText,textRotation:g.textRotation,flags1:g.flags1,flags2:g.flags2,
    points,suppressMeasurementText:true,ocsTransformed:!isWorldZNormal(normal),dimensionHandles:entity.dimensionHandles?{dimStyle:String(entity.dimensionHandles.dimStyle.value),anonymousBlock:String(entity.dimensionHandles.anonymousBlock.value)}:null});
   if(label)add(entity,g,{kind:"text",x,y,text:label,rotation:g.textRotation,height:null,dimensionText:true,dimensionType:g.dimensionName,actualMeasurement:measured,measurementUnit:angular?"deg":(units.known?"mm":"dwg-native")});
   dimensionEntities++;
  }
  if(g.kind==="text"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;
   const insertion=point3(g.insertion),wcs=transformOcsPoint([insertion.x,insertion.y,insertion.z||0],normal);
   const baseline=transformOcsVector([Math.cos(g.rotation||0),Math.sin(g.rotation||0),0],normal);
   const alignment=g.alignment?point3(g.alignment):null,aligned=alignment?transformOcsPoint([alignment.x,alignment.y,alignment.z||0],normal):null;
   add(entity,g,{kind:"text",x:wcs[0]*scale,y:wcs[1]*scale,z:wcs[2]*scale,text:g.text,rotation:Math.atan2(baseline[1],baseline[0]),height:g.height*scale,widthFactor:g.widthFactor,
    alignment:aligned?{x:aligned[0]*scale,y:aligned[1]*scale,z:aligned[2]*scale}:null,horizontalAlignment:g.horizontalAlignment,verticalAlignment:g.verticalAlignment,
    ocsTransformed:!isWorldZNormal(normal),styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   textEntities++;
  }else if(g.kind==="mtext"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;
   const insertion=point3(g.insertion),wcs=transformOcsPoint([insertion.x,insertion.y,insertion.z||0],normal),axis=point3(g.xAxis);
   add(entity,g,{kind:"text",x:wcs[0]*scale,y:wcs[1]*scale,z:wcs[2]*scale,text:g.text,rotation:Math.atan2(axis.y,axis.x),height:g.height*scale,width:g.rectWidth*scale,
    attachment:g.attachment,drawingDirection:g.drawingDirection,mtext:true,ocsTransformed:!isWorldZNormal(normal),styleHandle:entity.styleHandle?String(entity.styleHandle.value):null});
   textEntities++;
  }
  if(g.kind==="hatch"){
   const normal=g.extrusion||[0,0,1],elevation=g.elevation||0,ocsValid=isValidOcsNormal(normal);
   for(let pathIndex=0;pathIndex<(g.paths||[]).length;pathIndex++){
    const path=g.paths[pathIndex],meta={hatchBoundary:true,hatchName:g.name,hatchSolidFill:g.solidFill,hatchPatternType:g.patternType,hatchPathIndex:pathIndex,hatchPathFlags:path.flags,boundaryHandles:(entity.boundaryHandles||[]).map(h=>String(h.value))};
    if(!ocsValid){unsupportedHatchEdges++;continue;}
    if(path.kind==="polyline"){
     const bulges=path.bulges||path.vertices?.map(()=>0)||[];
     if(g.solidFill&&path.closed&&(path.flags&1)&&path.vertices?.length>=3&&bulges.length===path.vertices.length){
      // Keep external solid-fill contours even when one or more edges are bulged.
      // The room engine later decides whether the contour is a plausible wall band.
      const fillCurve=tessellateOcsPolyline({vertices:path.vertices,bulges,closed:true,extrusion:normal,elevation},{maxSegments:20000});
      if(fillCurve.closed&&fillCurve.points.length>=3){
       add(entity,g,{kind:"fill",pts:fillCurve.points.flatMap(point=>[point[0]*scale,point[1]*scale]),elevation:elevation*scale,hatchFillCandidate:true,
        hatchName:g.name,hatchPathIndex:pathIndex,hatchPathFlags:path.flags,
        hatchCurveApproximation:bulges.some(value=>Math.abs(value)>1e-10)?"bulge":null,
        boundaryHandles:(entity.boundaryHandles||[]).map(handle=>String(handle.value)),ocsTransformed:!isWorldZNormal(normal)});
       hatchFillCandidates++;
      }
     }
     if(!isWorldZNormal(normal)){
      const curve=tessellateOcsPolyline({vertices:path.vertices,bulges,closed:path.closed,extrusion:normal,elevation});
      const count=addPointChain(entity,g,curve.points,curve.closed,{...meta,ocsTransformed:true,hatchBoundary:true});
      hatchSegments+=count;
     }else{
      const segments=polylineToSheetItems({kind:"polyline",vertices:path.vertices,bulges,closed:path.closed},{layer:entity.layerName,handle:entity.handleHex,sourceFormat:sourceFormat});
      for(const segment of segments){
       if(segment.kind==="line")add(entity,g,{...segment,...meta,pts:segment.pts.map(v=>v*scale),z0:elevation*scale,z1:elevation*scale});
       else add(entity,g,{...segment,...meta,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale});
       hatchSegments++;
      }
     }
    }else{
     for(const edge of path.edges||[]){
      if(edge.kind==="line"){
       const a=transformOcsPoint([edge.start.x,edge.start.y,elevation],normal),b=transformOcsPoint([edge.end.x,edge.end.y,elevation],normal);
       add(entity,g,{kind:"line",...meta,pts:[a[0]*scale,a[1]*scale,b[0]*scale,b[1]*scale],z0:a[2]*scale,z1:b[2]*scale,ocsTransformed:!isWorldZNormal(normal)});hatchSegments++;
      }else if(edge.kind==="arc"){
       let a0=edge.startAngle,a1=edge.endAngle;
       if(edge.counterClockwise&&a1<a0)a1+=Math.PI*2;
       if(!edge.counterClockwise&&a1>a0)a1-=Math.PI*2;
       if(!isWorldZNormal(normal)){
        const curve=tessellateOcsArc({center:edge.center,radius:edge.radius,startAngle:a0,endAngle:a1,normal});
        hatchSegments+=addPointChain(entity,g,curve.points,curve.closed,{...meta,ocsTransformed:true,hatchCurveApproximation:"arc"});
       }else{
        add(entity,g,{kind:"arc",...meta,cx:edge.center.x*scale,cy:edge.center.y*scale,r:edge.radius*scale,a0,a1});hatchSegments++;
       }
      }else if(edge.kind==="ellipse"||edge.kind==="spline"){
       const points=edge.kind==="ellipse"?sampleHatchEllipse(edge):sampleHatchSpline(edge);
       if(!points||points.length<2){unsupportedHatchEdges++;continue;}
       const wcsPoints=points.map(point=>transformOcsPoint([point.x,point.y,elevation],normal));
       for(let pointIndex=0;pointIndex+1<wcsPoints.length;pointIndex++){
        const a=wcsPoints[pointIndex],b=wcsPoints[pointIndex+1];
        add(entity,g,{kind:"line",...meta,pts:[a[0]*scale,a[1]*scale,b[0]*scale,b[1]*scale],
         z0:a[2]*scale,z1:b[2]*scale,ocsTransformed:!isWorldZNormal(normal),
         hatchCurveApproximation:edge.kind,hatchEdgeIndex:pointIndex});
        hatchSegments++;
       }
      }else unsupportedHatchEdges++;
     }
    }
   }
   if(mapped.length>before)hatchEntities++;
  }
  if(g.kind==="polyline"){
   const normal=g.extrusion||[0,0,1];
   if(!isWorldZNormal(normal)){
    const curve=tessellateOcsPolyline(g);
    addPointChain(entity,g,curve.points,curve.closed,{ocsTransformed:true,curveApproximation:"ocs-polyline"});
   }else{
    const segments=polylineToSheetItems(g,{layer:entity.layerName,handle:entity.handleHex,sourceFormat:sourceFormat});
    for(const segment of segments){
     if(segment.kind==="line")add(entity,g,{...segment,pts:segment.pts.map(v=>v*scale),z0:(segment.z0||0)*scale,z1:(segment.z1||0)*scale,segmentIndex:segment.sourceGeometry.index});
     else add(entity,g,{...segment,cx:segment.cx*scale,cy:segment.cy*scale,r:segment.r*scale,segmentIndex:segment.sourceGeometry.index});
    }
   }
   if(mapped.length>before)polylineEntities++;
  }
  if(g.kind==="line"){
   const pts=Array.isArray(g.pts)&&typeof g.pts[0]==="number"?g.pts:Array.isArray(g.pts)?g.pts.flatMap(p=>[p.x,p.y]):[];
   if(pts.length>=4)add(entity,g,{kind:"line",pts:pts.slice(0,4).map(v=>v*scale),z0:(g.pts[0]?.z??0)*scale,z1:(g.pts[1]?.z??0)*scale});
  }else if(g.kind==="arc"||g.kind==="circle"){
   const normal=g.extrusion||[0,0,1],center=g.center??[g.cx,g.cy,0],radius=g.radius??g.r,circle=g.kind==="circle";
   if(!isWorldZNormal(normal)){
    const curve=tessellateOcsArc({center,radius,startAngle:g.startAngle??g.a0??0,endAngle:g.endAngle??g.a1??Math.PI*2,normal,circle});
    addPointChain(entity,g,curve.points,curve.closed,{ocsTransformed:true,curveApproximation:circle?"ocs-circle":"ocs-arc"});
   }else if(circle){
    const c=point3(center);add(entity,g,{kind:"arc",cx:c.x*scale,cy:c.y*scale,r:radius*scale,a0:0,a1:Math.PI*2,isCircle:true});
   }else{
    const c=point3(center);add(entity,g,{kind:"arc",cx:c.x*scale,cy:c.y*scale,r:radius*scale,a0:g.startAngle??g.a0,a1:g.endAngle??g.a1});
   }
  }else if(g.kind==="solid"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;const points=g.points.map(p=>transformOcsPoint([p.x,p.y,p.z??g.elevation??0],normal));
   add(entity,g,{kind:"fill",pts:points.flatMap(p=>[p[0]*scale,p[1]*scale]),elevation:(g.elevation||0)*scale,ocsTransformed:!isWorldZNormal(normal)});
  }else if(g.kind==="point"){
   const normal=g.extrusion||[0,0,1];if(!isValidOcsNormal(normal))continue;const p=g.point??[g.x,g.y,g.z??0],wcs=transformOcsPoint(Array.isArray(p)?p:[p.x,p.y,p.z??0],normal);
   add(entity,g,{kind:"point",x:wcs[0]*scale,y:wcs[1]*scale,z:wcs[2]*scale,ocsTransformed:!isWorldZNormal(normal)});
  }
  if(mapped.length>before)convertedEntities++;
 }
 if(!mapped.length)throw new Error("DWG "+version+"から表示可能な図形を取得できませんでした");
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const include=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill"){for(let i=0;i+1<item.pts.length;i+=2)include(item.pts[i],item.pts[i+1]);}
  else if(item.kind==="arc"){include(item.cx-item.r,item.cy-item.r);include(item.cx+item.r,item.cy+item.r);}
  else if(item.kind==="point"||item.kind==="text"||item.kind==="dimension")include(item.x,item.y);
  if(item.kind==="dimension")for(const point of Object.values(item.points||{}))if(Array.isArray(point)&&point.length>=2)include(point[0],point[1]);
 }
 if(!Number.isFinite(minX)||!Number.isFinite(minY))throw new Error("DWG図形の座標範囲を計算できません");
 const origin={x:minX,y:minY};
 for(const item of mapped){
  if(item.kind==="line"||item.kind==="fill")for(let i=0;i<item.pts.length;i+=2){item.pts[i]-=minX;item.pts[i+1]-=minY;}
  else if(item.kind==="arc"){item.cx-=minX;item.cy-=minY;}
  else if(item.kind==="point"||item.kind==="text"||item.kind==="dimension"){item.x-=minX;item.y-=minY;}
  if(item.kind==="dimension")for(const point of Object.values(item.points||{}))if(Array.isArray(point)&&point.length>=2){point[0]-=minX;point[1]-=minY;}
 }
 const unsupported=entities.length-convertedEntities;
 const warnings=["DWG "+version+"の独自読込です。",units.known?"INSUNITS："+units.name+"。座標をmmへ換算しました。":"INSUNITS（図面単位）を確定できないため、座標はDWG元単位のままです。mm換算・面積・概算数量の計算は行いません。",(version==="R2000"?"読み取り対象：LINE・ARC・CIRCLE・LWPOLYLINE・旧式POLYLINE/VERTEX・POINT・SOLID・INSERT/MINSERT・TEXT/MTEXT・DIMENSION計測情報・ELLIPSE/SPLINE近似。HATCH・MLINE・ATTRIB・寸法線/矢印の描画は未対応。":"読み取り対象：LINE・ARC・CIRCLE・LWPOLYLINE・旧式POLYLINE/VERTEX・POINT・SOLID・INSERT/MINSERT・TEXT/MTEXT/ATTRIB・DIMENSION計測情報・HATCH境界・ELLIPSE/SPLINE近似・MLINE。寸法線/矢印、HATCHパターン模様/グラデーション塗り表示は未対応。")];
 if(unsupported)warnings.push("未変換オブジェクト："+unsupported+"件");
 if(result?.diagnostics?.unresolvedLayerCount)warnings.push("レイヤー名未解決："+result.diagnostics.unresolvedLayerCount+"件");
 if(result?.headerWarning)warnings.push(result.headerWarning);
 if(result?.blockExpansion?.reason)warnings.push("DWGブロック展開保留："+result.blockExpansion.reason);
 if(result?.blockExpansion?.skippedGeometry)warnings.push("ブロック変換できない図形："+result.blockExpansion.skippedGeometry+"件");
 if(result?.blockExpansion?.unresolvedBlockReferences)warnings.push("参照先ブロック未解決："+result.blockExpansion.unresolvedBlockReferences+"件");
 if(result?.blockExpansion?.limitReached)warnings.push("安全上限に達したためブロック展開を途中で停止しました。");
 if(hatchEntities)warnings.push("HATCH境界線を表示します。ソリッド塗りつぶしの閉じた直線外周は壁候補として登録し、部屋抽出側で細長さを判定します。ハッチ模様・グラデーションの塗り表示は未対応です。");
 if(textEntities)warnings.push("TEXT/MTEXTの文字情報は読み込みました。文字の描画・フォント置換は表示側の対応に依存します。");
 if(dimensionEntities)warnings.push("DIMENSIONの計測値・文字位置を読み込みました。寸法線・矢印の描画は未対応です。");
 if(attributeEntities)warnings.push("INSERTの属性値（ATTRIB）を読み込みました。");
 if(ellipseEntities||splineEntities)warnings.push("ELLIPSE/SPLINEは線分近似で取り込みました。曲線の近似誤差に注意してください。");
 if(unsupportedCurves)warnings.push("平面外・不正データ等で近似できない曲線："+unsupportedCurves+"件");
 if(result?.diagnostics?.missingMLineStyleCount)warnings.push("MLINESTYLE未解決："+result.diagnostics.missingMLineStyleCount+"件。二重線境界は生成していません。");
 if(mlineEntities)warnings.push("MLINEはMLINESTYLEのオフセットから境界線を生成しました。");
 if(unsupportedHatchEdges)warnings.push("近似描画できないHATCH曲線境界："+unsupportedHatchEdges+"件");
 const sheet={name:fileName,items:mapped,size:{w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY)},origin,nativeOrigin:{x:minX/scale,y:minY/scale},warnings,coordinateSpace:units.known?"sheet-mm":"dwg-native"};
 return {kind:"2d",sheets:[sheet],layers,meta:{format:"DWG",label:"DWG "+version+"（独自読込）",units:units.known?"mm":"unknown",coordinateSpace:units.known?"sheet-mm":"dwg-native",unitInfo:units,info:{items:mapped.length,figures:convertedEntities,polylines:polylineEntities,hatches:hatchEntities,hatchBoundarySegments:hatchSegments,hatchFillCandidates,textEntities,dimensionEntities,attributeEntities,ellipseEntities,splineEntities,curveSegments,unsupportedCurves,unsupportedHatchEdges,mlineEntities,mlineBoundarySegments,codePage:result?.codePage??null,textEncoding:result?.textEncoding??"windows-1252",version,layers:layers.length,units:units.name,scaleToMm:scale,headerWarning:result?.headerWarning||null,unsupported,skippedObjects:result?.diagnostics?.skippedObjectCount??0},warnings}};
}
