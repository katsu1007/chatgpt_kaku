// KAKU-owned semantic prefilter + planar graph candidate analysis.
// Shadow mode only: never mutates or replaces production room extraction.
import { buildPlanarGraph } from "./planar-geometry.js";

const NON_WALL_LAYER=/(寸法|寸法線|寸法補助|寸法記入|引出線|補助線|中心線|通り芯|グリッド|文字|注記|家具|什器|設備|器具|照明|電気|コンセント|記号|ハッチ|dimension|\bdim\b|annotation|leader|extension|center.?line|grid|axis|furniture|fixture|text|symbol|hatch)/i;
const DIMENSION_LABEL=/^\s*[+-]?\d[\d,]*(?:\.\d+)?\s*(?:mm|ｍｍ|m|ｍ|cm|㎜|㎝|φ|ø)?\s*$/i;
const finite=Number.isFinite;
const pointsOf=item=>{
 const p=item?.pts||item?.points||item?.vertices;
 if(!Array.isArray(p))return [];
 if(p.length&&typeof p[0]==="object")return p.filter(v=>finite(v?.x)&&finite(v?.y)).map(v=>({x:v.x,y:v.y}));
 const out=[];for(let i=0;i+1<p.length;i+=2)if(finite(p[i])&&finite(p[i+1]))out.push({x:p[i],y:p[i+1]});
 return out;
};
function dimensionAnchors(items){
 return (items||[]).filter(it=>String(it?.kind||it?.type||"").toLowerCase()==="text"&&DIMENSION_LABEL.test(String(it.text||""))&&finite(it.x)&&finite(it.y)&&finite(it.size)&&it.size>0).map(it=>{
  const w=Math.max(1,String(it.text).length)*it.size*.6,rot=it.rot||it.rotation||0;
  return {x:it.x+w*.5*Math.cos(rot)+it.size*.5*Math.sin(rot),y:it.y+w*.5*Math.sin(rot)-it.size*.5*Math.cos(rot),rot,radius:w*.55+it.size*.75,size:it.size};
 });
}
function isDimensionStroke(a,b,anchors){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)return false;
 const angle=Math.atan2(dy,dx),ux=dx/len,uy=dy/len;
 return anchors.some(anchor=>{
  if(len<anchor.size*2||Math.abs(Math.sin(angle-anchor.rot))>=.22)return false;
  const t=Math.max(0,Math.min(1,((anchor.x-a.x)*ux+(anchor.y-a.y)*uy)/len));
  return Math.hypot(anchor.x-(a.x+t*dx),anchor.y-(a.y+t*dy))<=anchor.radius;
 });
}
function wallLikeFill(points){
 if(points.length<4)return false;
 const mx=points.reduce((s,p)=>s+p.x,0)/points.length,my=points.reduce((s,p)=>s+p.y,0)/points.length;
 let xx=0,xy=0,yy=0;
 for(const p of points){const x=p.x-mx,y=p.y-my;xx+=x*x;xy+=x*y;yy+=y*y;}
 xx/=points.length;xy/=points.length;yy/=points.length;
 const tr=xx+yy,disc=Math.sqrt(Math.max(0,(xx-yy)**2+4*xy*xy));
 const major=Math.sqrt(Math.max(0,(tr+disc)/2)),minor=Math.sqrt(Math.max(0,(tr-disc)/2));
 return major>=75&&major/Math.max(minor,1e-6)>=3.5;
}
function entitySegments(item,index,stats,anchors){
 const kind=String(item?.kind||item?.type||"").toLowerCase(),layer=String(item?.layer??"");
 if(NON_WALL_LAYER.test(layer)){stats.skippedSemanticLayer++;return [];}
 // HATCH loops are fill boundaries, not automatically walls.
 if(item?.hatchBoundary&&!item?.hatchFillCandidate){stats.skippedHatchBoundary++;return [];}
 if(["dimension","text","point","block","insert","hatch"].includes(kind)){stats.skippedNonBoundaryKind++;return [];}
 let points=pointsOf(item);
 if(kind==="arc"||kind==="circle"){
  const cx=Number(item.cx??item.x),cy=Number(item.cy??item.y),r=Number(item.r??item.radius);
  if(![cx,cy,r].every(finite)||r<=0){stats.skippedInvalidArc++;return [];}
  const start=kind==="circle"?0:Number(item.a0??item.startAngle??0);
  let end=kind==="circle"?Math.PI*2:Number(item.a1??item.endAngle??Math.PI*2);
  let sweep=end-start;if(kind==="arc"&&Math.abs(sweep)>Math.PI*2)sweep%=Math.PI*2;
  if(!sweep){stats.skippedInvalidArc++;return [];}
  const n=Math.max(8,Math.ceil(Math.abs(sweep)/(Math.PI/18)));
  points=Array.from({length:n+1},(_,i)=>{const a=start+sweep*i/n;return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};});
  stats.approximatedArcs++;
 }else if(kind==="fill"||kind==="solid"){
  if(!wallLikeFill(points)){stats.skippedNonWallFill++;return [];}
  stats.acceptedWallFills++;
 }else if(!["line","polyline"].includes(kind)){
  stats.skippedNonBoundaryKind++;return [];
 }
 if(points.length<2){stats.skippedInvalidGeometry++;return [];}
 const closed=kind==="circle"||item.closed===true||item.isClosed===true||item.closedFlag===true||item.flags?.closed===true;
 if(closed&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)>1e-8)points=[...points,points[0]];
 const out=[];
 for(let i=0;i+1<points.length;i++){
  const a=points[i],b=points[i+1];if(Math.hypot(b.x-a.x,b.y-a.y)<=1e-8)continue;
  if(isDimensionStroke(a,b,anchors)){stats.skippedDimensionSegments++;continue;}
  out.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,sourceId:String(item.handle??item.id??"entity:"+index)});
 }
 if(out.length)stats.acceptedItems++;
 return out;
}
function doorwayBridges(items,allowed,hidden,anchors,stats){
 const endpoints=[],degree=new Map(),coordinateKey=(x,y)=>Math.round(x*10)+":"+Math.round(y*10);
 (items||[]).forEach(item=>{
  const layer=String(item?.layer??""),kind=String(item?.kind||item?.type||"").toLowerCase();
  if(!allowed.has(layer)||hidden.has(layer)||NON_WALL_LAYER.test(layer)||!["line","polyline"].includes(kind))return;
  const p=pointsOf(item);if(p.length<2)return;
  for(const e of [p[0],p.at(-1)]){const k=coordinateKey(e.x,e.y);degree.set(k,(degree.get(k)||0)+1);}
 });
 (items||[]).forEach((item,index)=>{
  const layer=String(item?.layer??""),kind=String(item?.kind||item?.type||"").toLowerCase();
  if(!allowed.has(layer)||hidden.has(layer)||NON_WALL_LAYER.test(layer)||!["line","polyline"].includes(kind))return;
  const p=pointsOf(item);if(p.length<2)return;
  const ends=[{p:p[0],toward:p[1]},{p:p.at(-1),toward:p.at(-2)}];
  for(const e of ends){
   if((degree.get(coordinateKey(e.p.x,e.p.y))||0)!==1)continue;
   if(isDimensionStroke(e.p,e.toward,anchors))continue;
   const dx=e.toward.x-e.p.x,dy=e.toward.y-e.p.y,len=Math.hypot(dx,dy);if(len>1e-8)endpoints.push({x:e.p.x,y:e.p.y,ux:dx/len,uy:dy/len,source:index});
  }
 });
 const min=350,max=1200,bucket=max,bins=new Map(),key=(x,y)=>Math.floor(x/bucket)+":"+Math.floor(y/bucket);
 endpoints.forEach((e,i)=>{const k=key(e.x,e.y);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);});
 const best=new Map();
 for(let i=0;i<endpoints.length;i++){
  const a=endpoints[i],bx=Math.floor(a.x/bucket),by=Math.floor(a.y/bucket);let pick=-1,score=Infinity;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)for(const j of bins.get((bx+ox)+":"+(by+oy))||[]){
   if(i===j||endpoints[j].source===a.source)continue;
   const b=endpoints[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<min||d>max)continue;
   const ux=dx/d,uy=dy/d;
   if(a.ux*ux+a.uy*uy>-.96||b.ux*ux+b.uy*uy<.96)continue;
   if(Math.abs(a.ux*uy-a.uy*ux)*d>35||Math.abs(b.ux*uy-b.uy*ux)*d>35)continue;
   if(d<score){score=d;pick=j;}
  }
  if(pick>=0)best.set(i,pick);
 }
 const bridges=[];
 for(const [i,j] of best){
  if(i>=j||best.get(j)!==i)continue;
  const a=endpoints[i],b=endpoints[j];
  bridges.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,sourceId:"virtual-door-bridge:"+bridges.length});
 }
 stats.bridgedDoorGaps=bridges.length;
 return bridges;
}
export function analyzePlanarRoomCandidates({items=[],wallLayerNames=[],hiddenLayers=[]}={}){
 const allowed=new Set((wallLayerNames||[]).map(String)),hidden=new Set((hiddenLayers||[]).map(String));
 const stats={inputItems:0,acceptedItems:0,acceptedWallFills:0,approximatedArcs:0,skippedSemanticLayer:0,skippedNonBoundaryKind:0,skippedInvalidArc:0,skippedInvalidGeometry:0,skippedNonWallFill:0,skippedDimensionSegments:0,bridgedDoorGaps:0};
 const anchors=dimensionAnchors(items),segments=[];
 (items||[]).forEach((item,index)=>{
  if(!item||!allowed.has(String(item.layer??""))||hidden.has(String(item.layer??"")))return;
  stats.inputItems++;segments.push(...entitySegments(item,index,stats,anchors));
 });
 const bridges=doorwayBridges(items,allowed,hidden,anchors,stats);segments.push(...bridges);
 const graph=buildPlanarGraph(segments);
 const areas=graph.faces.map(face=>face.area).filter(Number.isFinite).sort((a,b)=>a-b);
 return {faces:graph.faces,bridges,diagnostics:{...stats,inputSegments:segments.length-bridges.length,virtualBridgeSegments:bridges.length,intersectionCount:graph.diagnostics.intersectionCount,graphNodes:graph.diagnostics.graphNodes,graphEdges:graph.diagnostics.graphEdges,boundedFaces:graph.diagnostics.boundedFaces,minFaceArea:areas.length?areas[0]:0,maxFaceArea:areas.length?areas.at(-1):0,totalFaceArea:areas.reduce((sum,value)=>sum+value,0)}};
}
