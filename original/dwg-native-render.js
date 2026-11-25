// KAKU-owned lightweight SVG renderer for native DWG SheetItems.
// Keeps R2000/R2004 viewing independent from the optional JWW/DXF CDN.
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const xml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
const fmt=value=>Number(finite(value).toFixed(3)).toString();
export function prepareNativeDwgSheet(sheet,layers=[]){
 if(!sheet||!Array.isArray(sheet.items))throw new TypeError("Native DWG sheet items are required");
 const width=Math.max(1,finite(sheet.size?.w,1)),height=Math.max(1,finite(sheet.size?.h,1));
 const layerIndex=new Map(layers.map((layer,index)=>[layer.name,index]));
 const layerColors=new Map(layers.map(layer=>[layer.name,typeof layer.color==="string"?layer.color:"#303030"]));
 return {nativeDwg:true,sheet,width,height,layerIndex,layerColors};
}
function arcPoints(item){
 const r=finite(item.r),cx=finite(item.cx),cy=finite(item.cy);
 if(!(r>0))return [];
 if(item.isCircle)return Array.from({length:49},(_,i)=>{const a=Math.PI*2*i/48;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
 let a0=finite(item.a0),a1=finite(item.a1),sweep=a1-a0;
 while(sweep<0)sweep+=Math.PI*2;
 if(sweep>Math.PI*2+1e-6)sweep=Math.PI*2;
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
  if(item.kind==="line"||item.kind==="fill"){
   const pts=Array.isArray(item.pts)?item.pts:[];
   if(pts.length<4||pts.length%2)continue;
   const points=[];for(let i=0;i+1<pts.length;i+=2)if(Number.isFinite(pts[i])&&Number.isFinite(pts[i+1]))points.push(fmt(pts[i])+","+fmt(pts[i+1]));
   if(points.length<2)continue;
   if(item.kind==="fill")body.push(`<polygon points="${points.join(" ")}" fill="${color}" fill-opacity="0.22" ${stroke}/>`);
   else body.push(`<polyline points="${points.join(" ")}" fill="none" ${stroke}/>`);
  }else if(item.kind==="arc"){
   const pts=arcPoints(item);if(pts.length<2)continue;
   if(item.isCircle)body.push(`<circle cx="${fmt(item.cx)}" cy="${fmt(item.cy)}" r="${fmt(item.r)}" fill="none" ${stroke}/>`);
   else body.push(`<polyline points="${pts.map(p=>fmt(p[0])+","+fmt(p[1])).join(" ")}" fill="none" ${stroke}/>`);
  }else if(item.kind==="point"){
   body.push(`<circle cx="${fmt(item.x)}" cy="${fmt(item.y)}" r="2.5" fill="${color}"/>`);
  }else if(item.kind==="text"){
   const size=Math.max(7,Math.min(200,finite(item.height,12))),angle=-finite(item.rotation)*180/Math.PI;
   const value=xml(String(item.text??"").replace(/\\P/g," "));
   if(!value)continue;
   body.push(`<g transform="translate(${fmt(item.x)} ${fmt(item.y)}) rotate(${fmt(angle)}) scale(1 -1)"><text x="0" y="0" font-family="sans-serif" font-size="${fmt(size)}" fill="${color}">${value}</text></g>`);
  }else if(item.kind==="dimension"&&Number.isFinite(item.actualMeasurement)){
   const value=xml(String(item.actualMeasurement));
   body.push(`<g transform="translate(${fmt(item.x)} ${fmt(item.y)}) scale(1 -1)"><text x="0" y="0" font-family="sans-serif" font-size="10" fill="${color}">${value}</text></g>`);
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" role="img" aria-label="DWG drawing"><rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="#fff"/><g transform="translate(0 ${fmt(height)}) scale(1 -1)">${body.join("")}</g></svg>`;
}
