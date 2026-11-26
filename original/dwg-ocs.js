// KAKU-owned AutoCAD OCS (Object Coordinate System) transforms.
// Converts entity-local OCS coordinates into WCS before the 2D sheet projection.
import { tessellateBulgedPolyline } from "./cad-curve-tessellation.js";
const finite=Number.isFinite;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v);if(!finite(n)||n<1e-12)throw new RangeError("OCS normal must be a non-zero finite vector");return v.map(x=>x/n);};
export function ocsBasis(normal=[0,0,1]){
 const n=unit([Number(normal?.[0]??0),Number(normal?.[1]??0),Number(normal?.[2]??1)]);
 const seed=Math.abs(n[0])<1/64&&Math.abs(n[1])<1/64?[0,1,0]:[0,0,1];
 const ax=unit(cross(seed,n)),ay=unit(cross(n,ax));
 return {x:ax,y:ay,z:n};
}
export function transformOcsVector(vector,normal=[0,0,1]){
 if(!Array.isArray(vector)||vector.length<3||!vector.slice(0,3).every(v=>finite(Number(v))))throw new TypeError("OCS vector requires three finite coordinates");
 const b=ocsBasis(normal),v=vector.map(Number);
 return [b.x[0]*v[0]+b.y[0]*v[1]+b.z[0]*v[2],b.x[1]*v[0]+b.y[1]*v[1]+b.z[1]*v[2],b.x[2]*v[0]+b.y[2]*v[1]+b.z[2]*v[2]];
}
export function transformOcsPoint(point,normal=[0,0,1]){
 return transformOcsVector(point,normal);
}
export function isValidOcsNormal(normal=[0,0,1]){
 if(!Array.isArray(normal)||normal.length<3||!normal.slice(0,3).every(v=>finite(Number(v))))return false;
 return Math.hypot(Number(normal[0]),Number(normal[1]),Number(normal[2]))>1e-12;
}
export function isWorldZNormal(normal=[0,0,1],tolerance=1e-7){
 if(!isValidOcsNormal(normal))return false;
 const n=unit([Number(normal[0]),Number(normal[1]),Number(normal[2])]);
 return Math.abs(n[0])<=tolerance&&Math.abs(n[1])<=tolerance&&Math.abs(n[2]-1)<=tolerance;
}
export function tessellateOcsArc({center,radius,startAngle=0,endAngle=Math.PI*2,normal=[0,0,1],circle=false},{maxSegments=4096,maxStepRadians=Math.PI/36}={}){
 const c=Array.isArray(center)?center:[center?.x,center?.y,center?.z??0],r=Number(radius),a0=Number(startAngle),a1=Number(endAngle);
 if(c.length<2||!c.slice(0,3).every(v=>finite(Number(v??0)))||!finite(r)||r<=0||!finite(a0)||!finite(a1)||!isValidOcsNormal(normal))return {points:[],closed:false,diagnostics:{reason:"invalid-ocs-arc"}};
 let sweep=circle?Math.PI*2:a1-a0;if(Math.abs(sweep)<=1e-12||Math.abs(sweep)>Math.PI*2+1e-6)return {points:[],closed:false,diagnostics:{reason:"invalid-ocs-arc-sweep"}};
 const n=Math.max(8,Math.min(maxSegments,Math.ceil(Math.abs(sweep)/maxStepRadians))),points=[];
 for(let i=0;i<=n;i++){const a=a0+sweep*i/n,p=transformOcsPoint([Number(c[0])+r*Math.cos(a),Number(c[1])+r*Math.sin(a),Number(c[2]??0)],normal);points.push(p);}
 return {points,closed:circle||Math.abs(Math.abs(sweep)-Math.PI*2)<1e-6,diagnostics:{segmentCount:n,closed:circle||Math.abs(Math.abs(sweep)-Math.PI*2)<1e-6}};
}
export function tessellateOcsPolyline(entity,options={}){
 const source=entity?.vertices??entity?.pts??entity?.points,normal=entity?.extrusion??entity?.normal??[0,0,1];
 if(!Array.isArray(source)||source.length<2||!isValidOcsNormal(normal))return {points:[],closed:false,diagnostics:{reason:"invalid-ocs-polyline"}};
 const curve=tessellateBulgedPolyline({vertices:source,bulges:entity?.bulges,closed:entity?.closed===true||entity?.isClosed===true},{maxSegments:options.maxSegments??20000,arcStepRadians:options.arcStepRadians??Math.PI/36});
 if(curve.points.length<2)return {...curve,points:[]};
 const elevation=Number(source[0]?.z??entity?.elevation??0);
 const points=curve.points.map(([x,y])=>transformOcsPoint([x,y,elevation],normal));
 return {...curve,points,diagnostics:{...curve.diagnostics,ocsTransformed:!isWorldZNormal(normal)}};
}
