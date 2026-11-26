// Grid supercover line rasterization for room-boundary topology.
// Uses anisotropic cell dimensions and seals corner crossings without 3x3 dilation.
export function rasterizeSegmentSupercover(x1,y1,x2,y2,cw,ch,markCell){
 if(![x1,y1,x2,y2,cw,ch].every(Number.isFinite)||cw<=0||ch<=0||typeof markCell!=="function")return 0;
 let x=Math.round(x1/cw),y=Math.round(y1/ch);
 const endX=Math.round(x2/cw),endY=Math.round(y2/ch);
 const dx=endX-x,dy=endY-y,nx=Math.abs(dx),ny=Math.abs(dy),sx=Math.sign(dx),sy=Math.sign(dy);
 let ix=0,iy=0,count=0;
 const mark=(px,py)=>{if(markCell(px,py)!==false)count++;};
 mark(x,y);
 while(ix<nx||iy<ny){
  const decision=(1+2*ix)*ny-(1+2*iy)*nx;
  if(decision===0){
   // A diagonal corner crossing touches both orthogonal neighbours as well
   // as the diagonal cell; this prevents a 4-connected flood-fill leak.
   if(sx)mark(x+sx,y);
   if(sy)mark(x,y+sy);
   x+=sx;y+=sy;ix++;iy++;mark(x,y);
  }else if(decision<0){x+=sx;ix++;mark(x,y);}
  else{y+=sy;iy++;mark(x,y);}
 }
 return count;
}
