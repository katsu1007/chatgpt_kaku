// Shared conservative classifier for dimension strokes flattened from CAD/JWW objects.
const finite=Number.isFinite;
const DIMENSION_LABEL=/^\s*(?:(?:W|H|D|L|S|FL|CH|R|Ø|φ)\s*[:=]\s*)?[+-]?\d[\d,]*(?:\.\d+)?\s*(?:mm|ｍｍ|m|ｍ|cm|㎜|㎝|φ|ø)?\s*$/i;
function itemPoints(item){
 const p=item?.pts??item?.points??item?.vertices;if(!Array.isArray(p))return [];
 if(p.length&&typeof p[0]==="object")return p.filter(v=>finite(v?.x)&&finite(v?.y)).map(v=>({x:v.x,y:v.y}));
 const out=[];for(let i=0;i+1<p.length;i+=2)if(finite(p[i])&&finite(p[i+1]))out.push({x:p[i],y:p[i+1]});
 return out;
}
function distanceToSegment(point,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
 if(len2<=1e-12)return Math.hypot(point.x-a.x,point.y-a.y);
 const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len2));
 return Math.hypot(point.x-(a.x+t*dx),point.y-(a.y+t*dy));
}
function collectLineSegments(items){
 const out=[];
 for(const item of items||[]){
  if(!["line","polyline"].includes(String(item?.kind??item?.type??"").toLowerCase()))continue;
  const points=itemPoints(item);
  for(let i=0;i+1<points.length;i++)out.push({a:points[i],b:points[i+1],item});
 }
 return out;
}
export function dimensionTextAnchors(items){
 const segments=collectLineSegments(items);
 return (items||[]).filter(it=>String(it?.kind??it?.type??"").toLowerCase()==="text"&&DIMENSION_LABEL.test(String(it.text??""))).map(it=>{
  const x=Number(it.x??it.insertion?.x),y=Number(it.y??it.insertion?.y);
  const size=Number(it.size??it.height??it.textHeight),rot=Number(it.rot??it.rotation??0);
  if(![x,y,size,rot].every(finite)||size<=0)return null;
  const widthFactor=finite(Number(it.widthFactor))?Math.max(.25,Math.min(4,Number(it.widthFactor))):1;
  const w=Math.max(1,String(it.text).length)*size*.6*widthFactor;
  const anchor={x:x+w*.5*Math.cos(rot)+size*.5*Math.sin(rot),y:y+w*.5*Math.sin(rot)-size*.5*Math.cos(rot),rot,radius:w*.55+size*.75,size,label:String(it.text),dimensionLine:null};
  let best=null,bestDistance=Infinity;
  for(const segment of segments){
   const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,len=Math.hypot(dx,dy);
   if(len<size*2||Math.abs(Math.sin(Math.atan2(dy,dx)-rot))>=.22)continue;
   const distance=distanceToSegment(anchor,segment.a,segment.b);
   if(distance<=anchor.radius*1.5&&distance<bestDistance){best=segment;bestDistance=distance;}
  }
  if(best)anchor.dimensionLine={a:best.a,b:best.b,angle:Math.atan2(best.b.y-best.a.y,best.b.x-best.a.x)};
  return anchor;
 }).filter(Boolean);
}
export function isDimensionSegment(x1,y1,x2,y2,anchors){
 const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(!len)return false;
 const angle=Math.atan2(dy,dx),ux=dx/len,uy=dy/len;
 for(const anchor of anchors||[]){
  if(len>=anchor.size*2&&Math.abs(Math.sin(angle-anchor.rot))<.22){
   const t=Math.max(0,Math.min(1,((anchor.x-x1)*ux+(anchor.y-y1)*uy)/len));
   if(Math.hypot(anchor.x-(x1+t*dx),anchor.y-(y1+t*dy))<=anchor.radius)return true;
  }
  const base=anchor.dimensionLine;if(!base)continue;
  if(Math.abs(Math.cos(angle-base.angle))>=.25)continue;
  if(len<anchor.size*.5||len>Math.max(anchor.size*16,anchor.radius*8))continue;
  const tolerance=Math.max(5,anchor.size*.8),ends=[[x1,y1],[x2,y2]],targets=[[base.a.x,base.a.y],[base.b.x,base.b.y]];
  if(ends.some(p=>targets.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=tolerance)))return true;
 }
 return false;
}
