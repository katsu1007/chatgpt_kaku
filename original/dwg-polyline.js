// KAKU-owned planar polyline expansion.
// Bulge values are tangent of one quarter of the signed included angle.
const finite=(v,label)=>{const n=Number(v);if(!Number.isFinite(n))throw new TypeError("Invalid polyline "+label);return n;};
const TAU=Math.PI*2;
function normalizePoint(p,index){
 if(Array.isArray(p))return {x:finite(p[0],"x at "+index),y:finite(p[1],"y at "+index),z:finite(p[2]??0,"z at "+index)};
 if(!p||typeof p!=="object")throw new TypeError("Invalid polyline vertex "+index);
 return {x:finite(p.x,"x at "+index),y:finite(p.y,"y at "+index),z:finite(p.z??0,"z at "+index)};
}
export function expandBulgedPolyline(input,{closed=null,bulges=null,tolerance=1e-10,maxSegments=100000}={}){
 const source=Array.isArray(input)?input:input?.vertices;
 if(!Array.isArray(source)||source.length<2)throw new RangeError("Polyline requires at least two vertices");
 if(source.length>maxSegments)throw new RangeError("Polyline vertex count exceeds limit");
 const valuesFromVertices=source.map(v=>Array.isArray(v)?0:(v?.bulge??0));
 const vertices=source.map(normalizePoint),isClosed=closed??!!input?.closed;
 const values=bulges??(Array.isArray(input)?null:input?.bulges)??valuesFromVertices;
 if(!Array.isArray(values)||values.length!==vertices.length)throw new RangeError("Polyline bulge count must match vertex count");
 const segments=[],count=isClosed?vertices.length:vertices.length-1;
 for(let i=0;i<count;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],bulge=finite(values[i]??0,"bulge at "+i);
  const dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);
  if(chord<=tolerance)continue;
  if(Math.abs(bulge)<=tolerance){segments.push({kind:"line",a,b,index:i,bulge:0});continue;}
  const sweep=4*Math.atan(bulge),radius=chord*(1+bulge*bulge)/(4*Math.abs(bulge));
  const offset=chord*(1-bulge*bulge)/(4*bulge),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  const cx=mx-dy/chord*offset,cy=my+dx/chord*offset;
  const startAngle=Math.atan2(a.y-cy,a.x-cx),endAngle=startAngle+sweep;
  if(![radius,cx,cy,startAngle,endAngle].every(Number.isFinite)||radius<=0)throw new RangeError("Invalid bulge arc at segment "+i);
  segments.push({kind:"arc",a,b,cx,cy,r:radius,a0:startAngle,a1:endAngle,sweep,bulge,index:i});
 }
 return {kind:"polyline",closed:!!isClosed,vertices,segments,diagnostics:{vertexCount:vertices.length,segmentCount:segments.length,lineCount:segments.filter(s=>s.kind==="line").length,arcCount:segments.filter(s=>s.kind==="arc").length,skippedZeroLength:count-segments.length}};
}
export function polylineToSheetItems(input,options={}){
 const expanded=expandBulgedPolyline(input,options);
 const layer=options.layer,handle=options.handle;
 return expanded.segments.map(segment=>segment.kind==="line"
  ?{kind:"line",pts:[segment.a.x,segment.a.y,segment.b.x,segment.b.y],z0:segment.a.z,z1:segment.b.z,layer,handle,sourceGeometry:segment,sourceFormat:options.sourceFormat||"DWG"}
  :{kind:"arc",cx:segment.cx,cy:segment.cy,r:segment.r,a0:segment.a0,a1:segment.a1,layer,handle,sourceGeometry:segment,sourceFormat:options.sourceFormat||"DWG"});
}
export function bulgeToSweep(bulge){return 4*Math.atan(finite(bulge,"value"));}
