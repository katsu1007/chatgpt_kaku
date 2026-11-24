// Geometry helpers for separating multiple CAD drawings on one model-space sheet.
// A frame is a trusted rectangle returned by the CAD parser's findFrames helper.
function bounds(item){
 if(item.kind==="line"||item.kind==="fill"){
  const p=item.pts||[];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(let i=0;i+1<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}
  return [x0,y0,x1,y1];
 }
 if(item.kind==="arc")return [item.cx-item.r,item.cy-item.r,item.cx+item.r,item.cy+item.r];
 if(item.kind==="text")return [item.x,item.y,item.x+Math.max(1,String(item.text||"").length)*item.size*.6,item.y+item.size];
 if(item.kind==="image")return [item.x,item.y,item.x+item.w,item.y+item.h];
 return [Infinity,Infinity,-Infinity,-Infinity];
}
function clipSegment(x0,y0,x1,y1,box){
 let t0=0,t1=1,dx=x1-x0,dy=y1-y0;
 for(const [p,q] of [[-dx,x0-box[0]],[dx,box[2]-x0],[-dy,y0-box[1]],[dy,box[3]-y0]]){
  if(Math.abs(p)<1e-9){if(q<0)return null;continue;}
  const t=q/p;if(p<0){if(t>t1)return null;if(t>t0)t0=t;}else{if(t<t0)return null;if(t<t1)t1=t;}
 }
 return [x0+t0*dx,y0+t0*dy,x0+t1*dx,y0+t1*dy];
}
export function makeDrawingChoices(drawing,findFrames){
 const choices=[];
 for(let sheetIndex=0;sheetIndex<(drawing.sheets||[]).length;sheetIndex++){
  const sheet=drawing.sheets[sheetIndex];
  let frames=[];try{frames=typeof findFrames==="function"?findFrames(sheet)||[]:[];}catch(_){frames=[];}
  if(frames.length){
   frames.forEach((frame,frameIndex)=>choices.push({sheetIndex,frameIndex,frame,label:"シート "+(sheetIndex+1)+" / 図面枠 "+(frameIndex+1)+"（"+Math.round(frame[2]-frame[0])+" × "+Math.round(frame[3]-frame[1])+"）"}));
  }else choices.push({sheetIndex,frameIndex:-1,frame:null,label:"シート "+(sheetIndex+1)+" / 全体表示"+((drawing.sheets||[]).length>1?"（図面枠未検出）":"")});
 }
 return choices;
}
export function sliceSheetForFrame(source,frame){
 const [x0,y0,x1,y1]=frame;
 // Do not expand the frame: even a small proportional margin can pull in
 // neighboring drawing geometry on large model-space sheets.
 const box=[x0,y0,x1,y1],items=[],edgeTol=Math.max(x1-x0,y1-y0)*.0005;
 for(const item of source.items||[]){
  if(item.kind==="line"){
   const pts=item.pts||[];
   for(let i=0;i+3<pts.length;i+=2){
    const ax=pts[i],ay=pts[i+1],bx=pts[i+2],by=pts[i+3];
    const onFrame=(Math.abs(ay-y0)<edgeTol&&Math.abs(by-y0)<edgeTol)||(Math.abs(ay-y1)<edgeTol&&Math.abs(by-y1)<edgeTol)||(Math.abs(ax-x0)<edgeTol&&Math.abs(bx-x0)<edgeTol)||(Math.abs(ax-x1)<edgeTol&&Math.abs(bx-x1)<edgeTol);
    if(onFrame)continue;
    const clipped=clipSegment(ax,ay,bx,by,box);
    if(clipped&&Math.hypot(clipped[2]-clipped[0],clipped[3]-clipped[1])>edgeTol*.2){
     items.push({...item,pts:[clipped[0]-x0,clipped[1]-y0,clipped[2]-x0,clipped[3]-y0]});
    }
   }
   continue;
  }
  const b=bounds(item),cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
  if(cx<box[0]||cx>box[2]||cy<box[1]||cy>box[3])continue;
  if(item.kind==="fill")items.push({...item,pts:item.pts.map((v,i)=>v-(i%2?y0:x0))});
  else if(item.kind==="arc")items.push({...item,cx:item.cx-x0,cy:item.cy-y0});
  else if(item.kind==="text")items.push({...item,x:item.x-x0,y:item.y-y0});
  else if(item.kind==="image")items.push({...item,x:item.x-x0,y:item.y-y0});
 }
 return {...source,name:"図面枠",size:{w:x1-x0,h:y1-y0},items};
}
