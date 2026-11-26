// KAKU-owned 2D CAD curve tessellation.
// Coordinates are projected to XY. This module keeps curve approximation explicit
// and bounded so hostile CAD inputs cannot allocate unbounded geometry.
import { expandBulgedPolyline } from "./dwg-polyline.js";

const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function point2(p){
 if(Array.isArray(p))return finite(p[0])&&finite(p[1])?[p[0],p[1]]:null;
 return p&&finite(p.x)&&finite(p.y)?[p.x,p.y]:null;
}
function appendArc(points,arc,step,maxSegments){
 const n=clamp(Math.ceil(Math.abs(arc.sweep)/step),1,maxSegments);
 for(let i=0;i<=n;i++){
  const a=arc.a0+arc.sweep*i/n;
  const p=[arc.cx+arc.r*Math.cos(a),arc.cy+arc.r*Math.sin(a)];
  if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>1e-10)points.push(p);
 }
}
export function tessellateBulgedPolyline(entity,{arcStepRadians=Math.PI/36,maxSegments=20000}={}){
 const vertices=entity?.vertices??entity?.pts??entity?.points;
 if(!Array.isArray(vertices)||vertices.length<2)return {points:[],closed:false,diagnostics:{reason:"insufficient-vertices"}};
 const pts=vertices.length&&typeof vertices[0]!=="object"
  ?Array.from({length:Math.floor(vertices.length/2)},(_,i)=>[vertices[2*i],vertices[2*i+1]])
  :vertices.map(point2);
 if(pts.some(p=>!p))return {points:[],closed:false,diagnostics:{reason:"invalid-vertex"}};
 const bulges=entity.bulges??vertices.map(v=>v?.bulge??0);
 const expanded=expandBulgedPolyline({vertices:pts.map((p,i)=>({x:p[0],y:p[1],bulge:Number(bulges[i]??0)})),closed:entity.closed===true||entity.isClosed===true||entity.closedFlag===true,bulges});
 const points=[];
 for(const seg of expanded.segments){
  if(seg.kind==="line"){
   if(!points.length)points.push([seg.a.x,seg.a.y]);
   points.push([seg.b.x,seg.b.y]);
  }else appendArc(points,seg,arcStepRadians,Math.max(1,maxSegments-points.length));
  if(points.length>maxSegments+1)throw new RangeError("Bulged polyline tessellation exceeds segment limit");
 }
 return {points,closed:expanded.closed,diagnostics:{...expanded.diagnostics,tessellatedPointCount:points.length}};
}
export function tessellateEllipse(entity,{arcStepRadians=Math.PI/36,maxSegments=20000}={}){
 const c=point2(entity?.center??entity?.centre)??[entity?.cx??entity?.x,entity?.cy??entity?.y];
 const major=point2(entity?.majorAxis??entity?.major_axis);
 const ratio=Number(entity?.axisRatio??entity?.minorMajorRatio??entity?.ratio);
 const a0=Number(entity?.startParameter??entity?.startAngle??0),a1=Number(entity?.endParameter??entity?.endAngle??Math.PI*2);
 if(!c.every(finite)||!major||!finite(ratio)||ratio<=0||!finite(a0)||!finite(a1))return {points:[],closed:false,diagnostics:{reason:"invalid-ellipse"}};
 const rx=Math.hypot(major[0],major[1]);if(rx<=1e-12)return {points:[],closed:false,diagnostics:{reason:"zero-major-axis"}};
 const ux=major[0]/rx,uy=major[1]/rx,vx=-uy*ratio,vy=ux*ratio;
 let sweep=a1-a0;if(Math.abs(sweep)<=1e-12)return {points:[],closed:false,diagnostics:{reason:"zero-sweep"}};
 const n=clamp(Math.ceil(Math.abs(sweep)/arcStepRadians),8,maxSegments);
 const points=Array.from({length:n+1},(_,i)=>{const t=a0+sweep*i/n,co=Math.cos(t),si=Math.sin(t);return[c[0]+rx*(ux*co+vx*si),c[1]+rx*(uy*co+vy*si)];});
 const closed=Math.abs(Math.abs(sweep)-Math.PI*2)<=1e-6;
 return {points,closed,diagnostics:{segmentCount:n,closed}};
}
function deBoor(degree,knots,controls,weights,u){
 const n=controls.length-1;
 let span=degree;
 if(u>=knots[n+1])span=n;
 else if(u>knots[degree]){
  let lo=degree,hi=n+1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(u<knots[mid])hi=mid;else lo=mid;}
  span=lo;
 }
 const d=[];
 for(let j=0;j<=degree;j++){
  const i=span-degree+j,w=weights?.[i]??1,p=controls[i];
  d[j]=[p.x*w,p.y*w,w];
 }
 for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){
  const i=span-degree+j,den=knots[i+degree-r+1]-knots[i];
  const alpha=Math.abs(den)<=1e-14?0:(u-knots[i])/den;
  for(let k=0;k<3;k++)d[j][k]=(1-alpha)*d[j-1][k]+alpha*d[j][k];
 }
 const q=d[degree];if(!finite(q[2])||Math.abs(q[2])<1e-14)return null;
 return [q[0]/q[2],q[1]/q[2]];
}
export function tessellateSpline(entity,{maxSegments=20000,samplesPerControlPoint=12}={}){
 const degree=Math.trunc(Number(entity?.degree)),controls=entity?.controlPoints;
 const knots=entity?.knots,weights=entity?.weightsPresent?entity.weights:null;
 if(!Array.isArray(controls)||controls.length<2||!Array.isArray(knots)||degree<1||degree>=controls.length||knots.length!==controls.length+degree+1)
  return {points:[],closed:!!entity?.closed,diagnostics:{reason:"invalid-spline-definition"}};
 if(controls.some(p=>!finite(p?.x)||!finite(p?.y))||knots.some(v=>!finite(v))||
    (weights&& (weights.length!==controls.length||weights.some(v=>!finite(v)||v<=0)))||
    knots.some((v,i)=>i&&v<knots[i-1]))
  return {points:[],closed:!!entity?.closed,diagnostics:{reason:"invalid-spline-data"}};
 const start=knots[degree],end=knots[controls.length];if(!(end>start))return {points:[],closed:!!entity?.closed,diagnostics:{reason:"empty-spline-domain"}};
 const count=clamp(Math.max(24,controls.length*samplesPerControlPoint),24,maxSegments),points=[];
 for(let i=0;i<=count;i++){const u=start+(end-start)*i/count,p=deBoor(degree,knots,controls,weights,u);if(!p)return {points:[],closed:!!entity?.closed,diagnostics:{reason:"invalid-rational-evaluation"}};points.push(p);}
 const closed=!!entity.closed;
 if(closed&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])>1e-8)points.push(points[0]);
 return {points,closed,diagnostics:{segmentCount:count,closed,rational:!!weights}};
}
export function tessellateCadCurve(entity,options={}){
 const kind=String(entity?.kind??entity?.type??"").toLowerCase();
 if(kind==="polyline"&&(entity?.bulges||entity?.vertices?.some(v=>v?.bulge)))return tessellateBulgedPolyline(entity,options);
 if(kind==="ellipse")return tessellateEllipse(entity,options);
 if(kind==="spline")return tessellateSpline(entity,options);
 return {points:[],closed:false,diagnostics:{reason:"unsupported-curve-kind",kind}};
}
