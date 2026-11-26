import { tessellateCadCurve, tessellateBulgedPolyline } from "./cad-curve-tessellation.js";
// KAKU-owned lightweight SVG renderer for native DWG SheetItems.
// Keeps R2000/R2004 viewing independent from the optional JWW/DXF CDN.
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const xml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
const fmt=value=>Number(finite(value).toFixed(3)).toString();
// Convert common AutoCAD TEXT/MTEXT control sequences to displayable text.
// This is a presentation transform only; the original source text remains intact.
export function normalizeDwgText(input){
 let value=String(input??"");
 value=value.replace(/%%([dpc])/gi,(_,code)=>({d:"°",p:"±",c:"Ø"}[code.toLowerCase()]));
 value=value.replace(/\\U\+([0-9a-f]{4,8})/gi,(_,hex)=>{
  const cp=parseInt(hex,16);return cp<=0x10ffff?String.fromCodePoint(cp):"";
 });
 value=value.replace(/\\S([^;]*);/g,(_,stack)=>stack.replace(/[\^#]/g,"/"));
 value=value.replace(/\\P/gi,"\n").replace(/\\~/g,"\u00a0");
 value=value.replace(/\\[AaCcFfHhQqTtWw][^;]*;/g,"");
 value=value.replace(/\\[LlOoKk]/g,"");
 value=value.replace(/\\([\\{}])/g,"$1");
 value=value.replace(/[{}]/g,"");
 return value.split(/\r?\n/).map(line=>line.trimEnd());
}
export function prepareNativeDwgSheet(sheet,layers=[]){
 if(!sheet||!Array.isArray(sheet.items))throw new TypeError("Native DWG sheet items are required");
 const width=Math.max(1,finite(sheet.size?.w,1)),height=Math.max(1,finite(sheet.size?.h,1));
 const layerIndex=new Map(layers.map((layer,index)=>[layer.name,index]));
 const layerColors=new Map(layers.map(layer=>[layer.name,typeof layer.color==="string"?layer.color:"#303030"]));
 return {nativeDwg:true,sheet,width,height,layerIndex,layerColors};
}
function arcPoints(item){
 const center=item.center??item.centre;
 const r=finite(item.r??item.radius),cx=finite(item.cx??item.x??center?.[0]??center?.x),cy=finite(item.cy??item.y??center?.[1]??center?.y);
 if(!(r>0))return [];
 if(item.isCircle||item.kind==="circle")return Array.from({length:49},(_,i)=>{const a=Math.PI*2*i/48;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
 const a0=finite(item.a0??item.startAngle),a1=finite(item.a1??item.endAngle),sweep=a1-a0;
 if(Math.abs(sweep)>Math.PI*2+1e-6)return [];
 const count=Math.max(12,Math.min(256,Math.ceil(Math.abs(sweep)*Math.max(r,1)/8)));
 return Array.from({length:count+1},(_,i)=>{const a=a0+sweep*i/count;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
}
export function renderNativeDwgSvg(prepared,hidden=new Uint8Array(0)){
 if(!prepared?.nativeDwg)throw new TypeError("Prepared native DWG sheet is required");
 const {sheet,width,height,layerIndex,layerColors}=prepared;
 const body=[];
 for(const item of sheet.items){
  const index=layerIndex.get(item.layer);
  if(index!==undefined&&hidden[index])continue;
  const color=xml(layerColors.get(item.layer)||"#303030"),stroke=`stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
  if(item.kind==="line"||item.kind==="polyline"||item.kind==="fill"){
   let pts=Array.isArray(item.pts)?item.pts:[];
   const closed=item.closed===true||item.isClosed===true||item.closedFlag===true;
   if(item.kind==="polyline"&&Array.isArray(item.bulges)){
    const curve=tessellateBulgedPolyline({...item,pts},{maxSegments:20000});pts=curve.points.flat();
   }
   if(pts.length<4||pts.length%2)continue;
   const points=[];for(let i=0;i+1<pts.length;i+=2)if(Number.isFinite(pts[i])&&Number.isFinite(pts[i+1]))points.push(fmt(pts[i])+","+fmt(pts[i+1]));
   if(points.length<2)continue;
   if(item.kind==="fill")body.push(`<polygon points="${points.join(" ")}" fill="${color}" fill-opacity="0.22" ${stroke}/>`);
   else if(closed)body.push(`<polygon points="${points.join(" ")}" fill="none" ${stroke}/>`);
   else body.push(`<polyline points="${points.join(" ")}" fill="none" ${stroke}/>`);
  }else if(item.kind==="ellipse"||item.kind==="spline"){
   const curve=tessellateCadCurve(item,{maxSegments:20000});
   if(curve.points.length<2)continue;
   const points=curve.points.map(p=>fmt(p[0])+","+fmt(p[1])).join(" ");
   if(curve.closed)body.push(`<polygon points="${points}" fill="none" ${stroke}/>`);
   else body.push(`<polyline points="${points}" fill="none" ${stroke}/>`);
  }else if(item.kind==="arc"||item.kind==="circle"){
   const pts=arcPoints(item);if(pts.length<2)continue;
   if(item.isCircle||item.kind==="circle")body.push(`<circle cx="${fmt(item.cx??item.center?.[0]??item.center?.x)}" cy="${fmt(item.cy??item.center?.[1]??item.center?.y)}" r="${fmt(item.r??item.radius)}" fill="none" ${stroke}/>`);
   else body.push(`<polyline points="${pts.map(p=>fmt(p[0])+","+fmt(p[1])).join(" ")}" fill="none" ${stroke}/>`);
  }else if(item.kind==="point"){
   body.push(`<circle cx="${fmt(item.x)}" cy="${fmt(item.y)}" r="2.5" fill="${color}"/>`);
  }else if(item.kind==="text"){
   const size=Math.max(7,Math.min(200,finite(item.height,12))),angle=-finite(item.rotation)*180/Math.PI;
   const lines=normalizeDwgText(item.text);
   if(!lines.some(line=>line.trim()))continue;
   const tspans=lines.map((line,index)=>`<tspan x="0" dy="${index===0?0:fmt(size*1.25)}">${xml(line)}</tspan>`).join("");
   body.push(`<g transform="translate(${fmt(item.x)} ${fmt(item.y)}) rotate(${fmt(angle)}) scale(1 -1)"><text x="0" y="0" font-family="sans-serif" font-size="${fmt(size)}" fill="${color}">${tspans}</text></g>`);
  }else if(item.kind==="dimension"&&Number.isFinite(item.actualMeasurement)){
   const p=item.points||{},a=p.point13,b=p.point14,d=p.point10;
   if((item.dimensionType==="linear"||item.dimensionType==="aligned")&&[a,b,d].every(v=>Array.isArray(v)&&Number.isFinite(v[0])&&Number.isFinite(v[1]))){
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length>1e-9){
     const nx=-dy/length,ny=dx/length,offset=(d[0]-a[0])*nx+(d[1]-a[1])*ny;
     const q1=[a[0]+nx*offset,a[1]+ny*offset],q2=[b[0]+nx*offset,b[1]+ny*offset];
     const ext=2,mark=2.5;
     const line=(x1,y1,x2,y2)=>"<line x1=\""+fmt(x1)+"\" y1=\""+fmt(y1)+"\" x2=\""+fmt(x2)+"\" y2=\""+fmt(y2)+"\" "+stroke+"/>";
     body.push("<g fill=\"none\">"+line(a[0],a[1],q1[0]+nx*ext,q1[1]+ny*ext)+line(b[0],b[1],q2[0]+nx*ext,q2[1]+ny*ext)+line(q1[0],q1[1],q2[0],q2[1])+line(q1[0]-mark,q1[1]-mark,q1[0]+mark,q1[1]+mark)+line(q2[0]-mark,q2[1]-mark,q2[0]+mark,q2[1]+mark)+"</g>");
    }
   }
   const value=xml(String(item.actualMeasurement));
   body.push("<g transform=\"translate("+fmt(item.x)+" "+fmt(item.y)+") scale(1 -1)\"><text x=\"0\" y=\"0\" font-family=\"sans-serif\" font-size=\"10\" fill=\""+color+"\">"+value+"</text></g>");
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" role="img" aria-label="DWG drawing"><rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="#fff"/><g transform="translate(0 ${fmt(height)}) scale(1 -1)">${body.join("")}</g></svg>`;
}
