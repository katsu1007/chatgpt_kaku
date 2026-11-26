// KAKU-owned SVG geometry for native DWG DIMENSION entities.
const finite=Number.isFinite,TAU=Math.PI*2;
const fmt=v=>Number((Number.isFinite(v)?v:0).toFixed(3)).toString();
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const valid=p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1]);
function line(a,b,stroke){return '<line x1="'+fmt(a[0])+'" y1="'+fmt(a[1])+'" x2="'+fmt(b[0])+'" y2="'+fmt(b[1])+'" '+stroke+'/>';}
function arrow(tip,dir,size,color){
 const n=Math.hypot(dir[0],dir[1]);if(n<1e-9)return "";
 const ux=dir[0]/n,uy=dir[1]/n,px=-uy,py=ux,bx=tip[0]+ux*size,by=tip[1]+uy*size,w=size*.42;
 return '<polygon points="'+fmt(tip[0])+','+fmt(tip[1])+' '+fmt(bx+px*w)+','+fmt(by+py*w)+' '+fmt(bx-px*w)+','+fmt(by-py*w)+'" fill="'+color+'"/>';
}
function polyline(points,stroke){return '<polyline points="'+points.map(p=>fmt(p[0])+','+fmt(p[1])).join(' ')+'" fill="none" '+stroke+'/>';}
function linear(item,p,stroke,color){
 const a=p.point13,b=p.point14,d=p.point10;if(![a,b,d].every(valid))return "";
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-9)return "";
 const ux=dx/length,uy=dy/length,nx=-uy,ny=ux,offset=(d[0]-a[0])*nx+(d[1]-a[1])*ny;
 const q1=[a[0]+nx*offset,a[1]+ny*offset],q2=[b[0]+nx*offset,b[1]+ny*offset];
 const size=Math.min(8,Math.max(2.5,length*.12)),ext=2;
 return '<g fill="none">'+line(a,[q1[0]+nx*ext,q1[1]+ny*ext],stroke)+line(b,[q2[0]+nx*ext,q2[1]+ny*ext],stroke)+line(q1,q2,stroke)+'</g>'+
  arrow(q1,[ux,uy],size,color)+arrow(q2,[-ux,-uy],size,color);
}
function angular(item,p,stroke,color){
 const center=p.point15,first=p.point13,second=p.point14;
 const arcPoint=item.dimensionType==="angular-2line"?(p.point16||p.point10):p.point10;
 if(![center,first,second,arcPoint].every(valid))return "";
 const r=dist(center,arcPoint);if(r<1e-8)return "";
 const a0=Math.atan2(first[1]-center[1],first[0]-center[0]),a1=Math.atan2(second[1]-center[1],second[0]-center[0]),am=Math.atan2(arcPoint[1]-center[1],arcPoint[0]-center[0]);
 let ccw=(a1-a0+TAU)%TAU,mid=(am-a0+TAU)%TAU;
 let sweep=mid<=ccw+1e-6?ccw:ccw-TAU;
 if(Math.abs(sweep)<1e-8)return "";
 const count=Math.max(12,Math.min(128,Math.ceil(Math.abs(sweep)*r/6))),points=Array.from({length:count+1},(_,i)=>{const a=a0+sweep*i/count;return[center[0]+r*Math.cos(a),center[1]+r*Math.sin(a)];});
 const sign=Math.sign(sweep),startTangent=[-Math.sin(a0)*sign,Math.cos(a0)*sign],endTangent=[Math.sin(a1)*sign,-Math.cos(a1)*sign],size=Math.min(7,Math.max(2.5,r*.12));
 return '<g fill="none">'+line(center,first,stroke)+line(center,second,stroke)+polyline(points,stroke)+'</g>'+
  arrow(points[0],startTangent,size,color)+arrow(points.at(-1),endTangent,size,color);
}
function radial(item,p,stroke,color){
 const center=p.point10,edge=p.point15;if(!valid(center)||!valid(edge))return "";
 const d=[center[0]-edge[0],center[1]-edge[1]],length=Math.hypot(...d);if(length<1e-9)return "";
 const size=Math.min(8,Math.max(2.5,length*.12));
 return '<g fill="none">'+line(center,edge,stroke)+'</g>'+arrow(edge,d,size,color);
}
function diameter(item,p,stroke,color){
 const a=p.point15,b=p.point10;if(!valid(a)||!valid(b))return "";
 const d=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...d);if(length<1e-9)return "";
 const size=Math.min(8,Math.max(2.5,length*.12));
 return '<g fill="none">'+line(a,b,stroke)+'</g>'+arrow(a,d,size,color)+arrow(b,[-d[0],-d[1]],size,color);
}
function ordinate(item,p,stroke,color){
 const feature=p.point13,leader=p.point14,origin=p.point10;if(!valid(feature)||!valid(leader))return "";
 const mid=valid(origin)?origin:leader,elbow=[leader[0],feature[1]],d=[leader[0]-feature[0],leader[1]-feature[1]];
 const size=Math.min(7,Math.max(2.5,dist(feature,leader)*.12));
 return '<g fill="none">'+line(feature,elbow,stroke)+line(elbow,leader,stroke)+(valid(origin)?line(origin,[origin[0],leader[1]],stroke):"")+'</g>'+arrow(feature,d,size,color);
}
export function renderDwgDimensionGeometry(item,{stroke,color="#222222"}={}){
 const p=item?.points||{},type=String(item?.dimensionType||"").toLowerCase();
 if(type==="linear"||type==="aligned")return linear(item,p,stroke,color);
 if(type==="angular-3pt"||type==="angular-2line")return angular(item,p,stroke,color);
 if(type==="radius")return radial(item,p,stroke,color);
 if(type==="diameter")return diameter(item,p,stroke,color);
 if(type==="ordinate")return ordinate(item,p,stroke,color);
 return "";
}
