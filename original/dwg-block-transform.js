// KAKU-owned 2D INSERT/MINSERT transform primitives.
// Matrix layout: [a,b,c,d,e,f] => x'=a*x+c*y+e, y'=b*x+d*y+f.
const num=(v,label)=>{const n=Number(v);if(!Number.isFinite(n))throw new TypeError("Invalid block "+label);return n;};
const point=(p,label)=>({x:num(p?.x,label+" x"),y:num(p?.y,label+" y")});
export function multiplyAffine2D(parent,child){
 const [a,b,c,d,e,f]=parent,[g,h,i,j,k,l]=child;
 if(![...parent,...child].every(Number.isFinite))throw new TypeError("Invalid affine matrix");
 return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}
export function applyAffine2D(matrix,p){
 const [a,b,c,d,e,f]=matrix,x=num(p?.x,"point x"),y=num(p?.y,"point y");
 return {x:a*x+c*y+e,y:b*x+d*y+f,...(p.z===undefined?{}:{z:num(p.z,"point z")})};
}
export function createInsertTransform(insert,{basePoint={x:0,y:0},parentMatrix=[1,0,0,1,0,0]}={}){
 const at=point(insert?.insertionPoint,"insertion point"),base=point(basePoint,"base point");
 const sx=num(insert?.scale?.x??1,"x scale"),sy=num(insert?.scale?.y??1,"y scale"),rotation=num(insert?.rotation??0,"rotation");
 if(Math.abs(sx)<1e-14||Math.abs(sy)<1e-14)throw new RangeError("Block scale cannot be zero");
 const extrusion=insert?.extrusion||[0,0,1];
 if(!Array.isArray(extrusion)||extrusion.length<3||Math.abs(num(extrusion[0],"extrusion x"))>1e-8||Math.abs(num(extrusion[1],"extrusion y"))>1e-8||Math.abs(num(extrusion[2],"extrusion z")-1)>1e-8)
  throw new Error("Non-planar INSERT extrusion is not supported by the 2D floor-plan transform");
 const cos=Math.cos(rotation),sin=Math.sin(rotation),a=cos*sx,b=sin*sx,c=-sin*sy,d=cos*sy;
 const local=[a,b,c,d,at.x-a*base.x-c*base.y,at.y-b*base.x-d*base.y];
 return multiplyAffine2D(parentMatrix,local);
}
export function createMInsertTransforms(insert,{basePoint={x:0,y:0},parentMatrix=[1,0,0,1,0,0],maxInstances=100000}={}){
 const columns=Math.trunc(num(insert?.columns??1,"column count")),rows=Math.trunc(num(insert?.rows??1,"row count"));
 const columnSpacing=num(insert?.columnSpacing??0,"column spacing"),rowSpacing=num(insert?.rowSpacing??0,"row spacing");
 if(columns<1||rows<1||columns*rows>maxInstances)throw new RangeError("Invalid or excessive MINSERT array size");
 const base=createInsertTransform(insert,{basePoint,parentMatrix}),[a,b,c,d,e,f]=base,out=[];
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const dx=column*columnSpacing,dy=row*rowSpacing;
  out.push([a,b,c,d,e+a*dx+c*dy,f+b*dx+d*dy]);
 }
 return out;
}
export function transformBlockGeometry(geometry,matrix){
 if(!geometry||typeof geometry!=="object")throw new TypeError("Block geometry is required");
 if(geometry.kind==="line"&&Array.isArray(geometry.pts)&&geometry.pts.length>=4){
  const pts=[];for(let i=0;i+1<geometry.pts.length;i+=2){const p=applyAffine2D(matrix,{x:geometry.pts[i],y:geometry.pts[i+1]});pts.push(p.x,p.y);}
  return {...geometry,pts};
 }
 if(geometry.kind==="polyline"&&Array.isArray(geometry.vertices)){
  const [a,b,c,d]=matrix,det=a*d-b*c,scaleX=Math.hypot(a,b),scaleY=Math.hypot(c,d),orthogonality=a*c+b*d;
  if((geometry.bulges||[]).some(v=>Math.abs(v)>1e-10)&&(Math.abs(scaleX-scaleY)>1e-8*Math.max(1,scaleX,scaleY)||Math.abs(orthogonality)>1e-8*Math.max(1,scaleX*scaleY)))return {kind:"unsupported",sourceGeometry:geometry,reason:"Bulged polyline under non-uniform scale requires ellipse tessellation"};
  return {...geometry,bulges:det<0?(geometry.bulges||[]).map(v=>-v):geometry.bulges,vertices:geometry.vertices.map(p=>({...p,...applyAffine2D(matrix,p)}))};
 }
 if(geometry.kind==="point")return {...geometry,...applyAffine2D(matrix,geometry)};
 if(geometry.kind==="arc"||geometry.kind==="circle"){
  const [a,b,c,d]=matrix,scaleX=Math.hypot(a,b),scaleY=Math.hypot(c,d),orthogonality=a*c+b*d;
  if(Math.abs(scaleX-scaleY)>1e-8*Math.max(1,scaleX,scaleY)||Math.abs(orthogonality)>1e-8*Math.max(1,scaleX*scaleY))
   return {kind:"ellipse",sourceGeometry:geometry,transform:matrix,requiresTessellation:true};
  const center=applyAffine2D(matrix,{x:geometry.center?.x??geometry.cx,y:geometry.center?.y??geometry.cy});
  const reflected=a*d-b*c<0,angle=Math.atan2(b,a),start=geometry.startAngle??geometry.a0??0,end=geometry.endAngle??geometry.a1??Math.PI*2;
  return {kind:"arc",cx:center.x,cy:center.y,r:(geometry.radius??geometry.r)*scaleX,a0:angle+(reflected?-start:start),a1:angle+(reflected?-end:end),sourceGeometry:geometry};
 }
 return {kind:"unsupported",sourceGeometry:geometry,reason:"Geometry type requires a dedicated block transform"};
}
