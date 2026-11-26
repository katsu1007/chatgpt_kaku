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
function segmentKey(a,b){
 const p=[a.x.toFixed(2),a.y.toFixed(2)],q=[b.x.toFixed(2),b.y.toFixed(2)];
 return p.join(",")<q.join(",")?p.join(",")+"|"+q.join(","):q.join(",")+"|"+p.join(",");
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
  if(best){
   const angle=Math.atan2(best.b.y-best.a.y,best.b.x-best.a.x),length=Math.hypot(best.b.x-best.a.x,best.b.y-best.a.y);
   anchor.dimensionLine={a:best.a,b:best.b,angle};
   const tolerance=Math.max(5,size*.8),maxLength=Math.max(size*16,anchor.radius*8),nearA=[],nearB=[];
   for(const segment of segments){
    if(segment===best)continue;
    const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,len=Math.hypot(dx,dy);
    if(len<size*.5||len>maxLength||Math.abs(Math.cos(Math.atan2(dy,dx)-angle))>=.25)continue;
    const dA=Math.min(Math.hypot(segment.a.x-best.a.x,segment.a.y-best.a.y),Math.hypot(segment.b.x-best.a.x,segment.b.y-best.a.y));
    const dB=Math.min(Math.hypot(segment.a.x-best.b.x,segment.a.y-best.b.y),Math.hypot(segment.b.x-best.b.x,segment.b.y-best.b.y));
    if(dA<=tolerance)nearA.push(segment);
    if(dB<=tolerance)nearB.push(segment);
   }
   // Require a matching extension at both ends; a lone perpendicular wall
   // meeting one endpoint is not enough evidence to discard real geometry.
   if(nearA.length&&nearB.length)anchor.extensionSegmentKeys=new Set([...nearA,...nearB].map(segment=>segmentKey(segment.a,segment.b)));
  }
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
  if(anchor.extensionSegmentKeys?.has(segmentKey({x:x1,y:y1},{x:x2,y:y2})))return true;
 }
 return false;
}
