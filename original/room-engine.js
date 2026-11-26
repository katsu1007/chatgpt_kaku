import { tessellateCadCurve, tessellateBulgedPolyline } from "./cad-curve-tessellation.js";
import { dimensionTextAnchors, isDimensionSegment } from "./dimension-line-classifier.js";
import { isNonBoundarySemanticItem } from "./cad-semantic-classifier.js";
import { rasterizeSegmentSupercover } from "./room-rasterizer.js";
// KAKU ORIGIN room extraction engine
// Grid-space topology engine. Coordinates are sheet mm; thresholds are relative to grid,
// never interpreted as real-world m² without scale conversion.
const OUTER_WALL_NAME=/(外壁|躯体|外周|建物外形|外形壁|exterior|outer.?wall)/i;
const WALL_NAME=/(壁|間仕切|パーティション|ブース|躯体|外壁|内壁|壁芯|(?:^|[-_ ])(?:a-)?wall(?:$|[-_ ])|wall|partition)/i;
const NON_WALL_NAME=/(寸法|寸法線|寸法補助|寸法記入|寸法記号|引出線|引出|補助線|基準線|中心線|通り芯|グリッド|文字|注記|注釈|家具|什器|設備|機器|器具|照明|電気|コンセント|記号|ハッチ|仕上|目地|ルーバー|建具|サッシ|開口|床|タイル|dimension|\\bdim\\b|measure|annotation|leader|extension|center.?line|grid|axis|furniture|fixture|text|symbol|hatch(?:ing)?)/i;
// Jw_cad layer names may encode a group, e.g. "2-1 展開図 / 躯体".
// A layer named 躯体 in an elevation/development group is not the floor-plan perimeter.
// Exclude clearly non-plan groups from automatic wall discovery; explicit selections remain overrides.
const NON_PLAN_GROUP_NAME=/(展開図|立面図|断面図|詳細図|矩計図|軸組図|天井伏図|屋根伏図|基礎伏図|設備図|電気図|配線図)/i;
function isNonPlanGroupLayer(name){
  const match=String(name??"").match(/^\s*[0-9a-f]+-[0-9a-f]+\s+([^/]+)\s*\//i);
  return !!match&&NON_PLAN_GROUP_NAME.test(match[1]);
}
// Explicit CAD dimension metadata is stronger evidence than geometric heuristics.
// Keep this narrow: ordinary lines on a dimension-like layer are already handled
// by layer semantics, while these flags identify dimension graphics on mixed layers.
function isDimensionGraphicItem(it){
  const kind=String(it?.kind||it?.type||"").toLowerCase();
  const sourceKind=String(it?.sourceGeometry?.kind||it?.sourceGeometry?.type||"").toLowerCase();
  const sourceType=String(it?.sourceType||it?.originalType||it?.sourceGeometry?.sourceType||it?.sourceGeometry?.type||"").toLowerCase();
  const isRawJwwDimension=value=>value==="sunpou"||/(?:^|\\.)cdatasunpou$/i.test(value);
  return kind==="dimension"||sourceKind==="dimension"||isRawJwwDimension(sourceType)||String(it?.semanticRole??it?.semantic?.role??it?.role??"").toLowerCase()==="dimension"||it?.dimensionGraphic===true||it?.dimensionLine===true||it?.dimensionExtension===true||it?.dimensionArrow===true||it?.dimensionBoundary===true||it?.isDimension===true||it?.dimensionEntity===true;
}
// A flattened block is not automatically a wall. Only retain block ancestry when
// its definition path explicitly identifies architectural wall/partition content;
// fixture, furniture and unknown blocks remain non-boundary even on wall layers.
function isArchitecturalWallBlock(it){
  const path=Array.isArray(it?.blockPath)?it.blockPath:[];
  const names=[...path,it?.blockName,it?.sourceBlockName,it?.sourceNativeLayer].filter(value=>value!=null).map(String);
  return names.some(name=>name.split(/[\\/\\s:_-]+/).some(token=>/^(?:wall|walls|partition|partitions|structural|structure)$/i.test(token))||/(?:壁|間仕切|躯体|パーティション)/.test(name));
}
// Numeric dimension labels help identify dimension strokes even when they share a wall layer.
export function suggestWallLayers(layers=[]){
  const names=(layers||[]).map(layer=>typeof layer==="string"?layer:layer?.name);
  return [...new Set(names.filter(name=>name!=null&&!isNonPlanGroupLayer(name)&&WALL_NAME.test(String(name))&&!NON_WALL_NAME.test(String(name))).map(String))];
}
function classifyLayers(layers,items,hidden){
  const visible=(layers||[]).filter(l=>!hidden.has(l.name));
  const namedWalls=visible.filter(l=>!isNonPlanGroupLayer(l.name)&&WALL_NAME.test(String(l.name))&&!NON_WALL_NAME.test(String(l.name)));
  // Never promote every anonymous geometry layer to a wall layer. Furniture,
  // symbols, dimensions and title-block outlines often share ordinary CAD
  // layers; treating all closed geometry as rooms creates convincing-looking
  // but unrelated colored regions. Unknown layer names require an explicit
  // user selection until a confidence-ranked geometry classifier is validated.
  const candidates=namedWalls;
  const outer=candidates.filter(l=>OUTER_WALL_NAME.test(String(l.name)));
  const parent=outer.length?outer:candidates;
  const mode=namedWalls.length?(outer.length?"外周レイヤー＋壁レイヤー":"壁候補レイヤー"):"壁レイヤー名を特定できません（明示選択が必要）";
  return {parent:new Set(parent.map(l=>l.name)),all:new Set(candidates.map(l=>l.name)),mode};
}
function findBoothFrontClosures(items,names,hidden){
  // Detect repeated U-shaped toilet cubicles: two parallel side partitions meet a
  // common rear wall, while their free ends face the same open corridor.
  // Close only the open front between those side partitions; ordinary door gaps
  // are collinear with their wall and therefore do not satisfy this geometry.
  const raw=[];
  for(const it of items){
    if(it.hatchBoundary||isDimensionGraphicItem(it)||isNonBoundarySemanticItem(it,{allowBlockInstance:isArchitecturalWallBlock(it)})||!["line","polyline"].includes(it.kind)||!names.has(it.layer)||hidden.has(it.layer)||!Array.isArray(it.pts))continue;
    for(let k=0;k+3<it.pts.length;k+=2){
      const x1=it.pts[k],y1=it.pts[k+1],x2=it.pts[k+2],y2=it.pts[k+3],dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
      if(len>1)raw.push({it,x1,y1,x2,y2,dx:dx/len,dy:dy/len,len});
    }
  }
  // JWW commonly stores one physical partition as many short collinear strokes.
  // Join only same-layer fragments with near-identical direction, <=45 mm
  // perpendicular offset, and <=120 mm projected gap. This is deliberately
  // stricter than raster healing and never joins neighbouring parallel bays.
  // Group fragments by canonical direction and perpendicular offset, then
  // merge their projected intervals in one sorted pass. This avoids the old
  // all-pairs repeated scan (quadratic per pass) on dense JWW drawings.
  const groups=new Map(),angleStep=2*Math.PI/180,offsetStep=45;
  for(const s of raw){
    let angle=Math.atan2(s.dy,s.dx);
    if(angle<0)angle+=Math.PI;
    if(angle>=Math.PI)angle-=Math.PI;
    const bin=Math.round(angle/angleStep),ux=Math.cos(bin*angleStep),uy=Math.sin(bin*angleStep);
    const nx=-uy,ny=ux,offset=(s.x1*nx+s.y1*ny+s.x2*nx+s.y2*ny)/2;
    const key=String(s.it.layer)+"|"+bin+"|"+Math.round(offset/offsetStep);
    if(!groups.has(key))groups.set(key,{it:s.it,ux,uy,offset,nx,ny,parts:[]});
    const g=groups.get(key),p1=s.x1*g.ux+s.y1*g.uy,p2=s.x2*g.ux+s.y2*g.uy;
    g.parts.push({lo:Math.min(p1,p2),hi:Math.max(p1,p2)});
  }
  const segs=[];
  for(const g of groups.values()){
    g.parts.sort((a,b)=>a.lo-b.lo);
    let lo=null,hi=null;
    const flush=()=>{if(lo!==null&&hi-lo>1)segs.push({it:g.it,x1:g.ux*lo+g.nx*g.offset,y1:g.uy*lo+g.ny*g.offset,x2:g.ux*hi+g.nx*g.offset,y2:g.uy*hi+g.ny*g.offset,dx:g.ux,dy:g.uy,len:hi-lo});};
    for(const p of g.parts){
      if(lo===null){lo=p.lo;hi=p.hi;continue;}
      if(p.lo-hi<=120){hi=Math.max(hi,p.hi);}
      else{flush();lo=p.lo;hi=p.hi;}
    }
    flush();
  }
  const pointLineDistance=(p,s)=>{
    const vx=s.x2-s.x1,vy=s.y2-s.y1,l2=vx*vx+vy*vy;
    const t=Math.max(0,Math.min(1,((p.x-s.x1)*vx+(p.y-s.y1)*vy)/l2));
    return Math.hypot(p.x-(s.x1+t*vx),p.y-(s.y1+t*vy));
  };
  const closures=[];
  // Index rear-wall segments by sampled points along their length. The previous
  // implementation scanned every segment again for every candidate booth pair;
  // this spatial index keeps the confirmation step local even on dense plans.
  const rearCell=550,rearBins=new Map(),rearKey=(x,y)=>Math.floor(x/rearCell)+":"+Math.floor(y/rearCell);
  for(let i=0;i<segs.length;i++){
    const s=segs[i],steps=Math.max(1,Math.ceil(s.len/rearCell));
    for(let k=0;k<=steps;k++){
      const q=k/steps,key=rearKey(s.x1+(s.x2-s.x1)*q,s.y1+(s.y2-s.y1)*q);
      if(!rearBins.has(key))rearBins.set(key,new Set());
      rearBins.get(key).add(i);
    }
  }
  const endpointCell=1100,nearbySegments=new Map();
  const bucketKey=(x,y)=>Math.floor(x/endpointCell)+":"+Math.floor(y/endpointCell);
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    for(const p of [{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}]){
      const key=bucketKey(p.x,p.y);
      if(!nearbySegments.has(key))nearbySegments.set(key,[]);
      nearbySegments.get(key).push(i);
    }
  }
  const candidatePairs=new Set();
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    for(const p of [{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}]){
      const bx=Math.floor(p.x/endpointCell),by=Math.floor(p.y/endpointCell);
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        for(const j of nearbySegments.get((bx+ox)+":"+(by+oy))||[]){
          if(j>i)candidatePairs.add(i+","+j);
        }
      }
    }
  }
  for(const pair of candidatePairs){
    const [i,j]=pair.split(",").map(Number),a=segs[i],b=segs[j];
    if(Math.abs(a.dx*b.dx+a.dy*b.dy)<.97)continue;
    const endsA=[{x:a.x1,y:a.y1,back:{x:a.x2,y:a.y2}},{x:a.x2,y:a.y2,back:{x:a.x1,y:a.y1}}];
    const endsB=[{x:b.x1,y:b.y1,back:{x:b.x2,y:b.y2}},{x:b.x2,y:b.y2,back:{x:b.x1,y:b.y1}}];
    let found=null;
    for(const ea of endsA)for(const eb of endsB){
      const gx=eb.x-ea.x,gy=eb.y-ea.y,gap=Math.hypot(gx,gy);if(gap<450||gap>1100)continue;
      const ux=gx/gap,uy=gy/gap;
      if(Math.abs(ux*a.dx+uy*a.dy)>.22||Math.abs(ux*b.dx+uy*b.dy)>.22)continue;
      // Both opposite ends must land on the same cross-wall, confirming a U shape.
      const ba=ea.back,bb=eb.back;
      const rearCandidates=new Set();
      for(const p of [ba,bb]){
        const bx=Math.floor(p.x/rearCell),by=Math.floor(p.y/rearCell);
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
          for(const k of rearBins.get((bx+ox)+":"+(by+oy))||[])rearCandidates.add(k);
        }
      }
      let rear=false;
      for(const k of rearCandidates){
        const s=segs[k];
        if(k!==i&&k!==j&&s.len>gap*.8&&Math.abs(s.dx*ux+s.dy*uy)>.92&&
          pointLineDistance(ba,s)<80&&pointLineDistance(bb,s)<80){rear=true;break;}
      }
      if(rear){found={x1:ea.x,y1:ea.y,x2:eb.x,y2:eb.y,layer:a.it.layer};break;}
    }
    if(found&&!closures.some(c=>Math.hypot(c.x1-found.x1,c.y1-found.y1)<80&&Math.hypot(c.x2-found.x2,c.y2-found.y2)<80))closures.push(found);
  }
  return closures.map((c,i)=>({kind:"line",layer:c.layer,pts:[c.x1,c.y1,c.x2,c.y2],virtualBoothClosure:true,virtualId:i}));
}
function isWallLikeFill(pts,cw,ch){
  if(!Array.isArray(pts)||pts.length<6||pts.length%2)return false;
  const n=pts.length/2;let mx=0,my=0;
  for(let i=0;i<pts.length;i+=2){if(!Number.isFinite(pts[i])||!Number.isFinite(pts[i+1]))return false;mx+=pts[i];my+=pts[i+1];}
  mx/=n;my/=n;
  let xx=0,xy=0,yy=0;
  for(let i=0;i<pts.length;i+=2){const x=pts[i]-mx,y=pts[i+1]-my;xx+=x*x;xy+=x*y;yy+=y*y;}
  xx/=n;xy/=n;yy/=n;
  const trace=xx+yy,disc=Math.sqrt(Math.max(0,(xx-yy)*(xx-yy)+4*xy*xy));
  const major=Math.sqrt(Math.max(0,(trace+disc)/2));
  const minor=Math.sqrt(Math.max(0,(trace-disc)/2));
  const ratio=major/Math.max(minor,1e-6);
  // JWW SOLID may also encode circular markers, arrows and compact symbols.
  // Only long, thin filled polygons are plausible wall bands; ordinary line
  // geometry remains the primary source for wall boundaries.
  return ratio>=3.5&&major*2>=Math.max(cw,ch)*12;
}
function traceItems(items, names, hidden, W, H, nx, ny, cw, ch) {
  const wall=new Uint8Array(nx*ny); let usedItems=0,usedSegments=0,skippedHidden=0,skippedDimensionItems=0,skippedDimensionSegments=0,skippedSemanticItems=0,skippedNonWallFills=0,snappedTJunctions=0,rasterizedCells=0; const usedLayers=new Set(); let activeLayer=null; const endpoints=[]; const doorEndpoints=[]; const geometrySegments=[]; const dimAnchors=dimensionTextAnchors(items);
  const markCell=(ix,iy)=>{
    if(ix<0||iy<0||ix>=nx||iy>=ny)return false;
    const index=iy*nx+ix;if(wall[index])return false;
    wall[index]=1;rasterizedCells++;return true;
  };
  const markWorld=(x,y)=>markCell(Math.round(x/cw),Math.round(y/ch));
  const markEndpoint=(x,y)=>{
    const ix=Math.round(x/cw),iy=Math.round(y/ch);
    // Small endpoint-only healing preserves wall thickness while closing tiny
    // drafting gaps and connecting virtual doorway/cubicle closures.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)markCell(ix+dx,iy+dy);
  };
  const line=(x1,y1,x2,y2)=>{
    if(![x1,y1,x2,y2].every(Number.isFinite))return false;
    if(isDimensionSegment(x1,y1,x2,y2,dimAnchors)){skippedDimensionSegments++;return false;}
    if(activeLayer!=null)usedLayers.add(String(activeLayer));
    endpoints.push([Math.round(x1/cw),Math.round(y1/ch)],[Math.round(x2/cw),Math.round(y2/ch)]);
    geometrySegments.push({x1:x1/cw,y1:y1/ch,x2:x2/cw,y2:y2/ch,layer:activeLayer==null?null:String(activeLayer)});
    markEndpoint(x1,y1);
    rasterizeSegmentSupercover(x1,y1,x2,y2,cw,ch,markCell);
    markEndpoint(x2,y2);
    usedSegments++;return true;
  };
  const rememberDoorEndpoint=(x,y,dx,dy,layer,sourceId)=>{
    const len=Math.hypot(dx,dy);
    if(len>0)doorEndpoints.push({x,y,ux:dx/len,uy:dy/len,layer:layer==null?null:String(layer),sourceId});
  };
  const rememberEndpoint=(x,y)=>{if(Number.isFinite(x)&&Number.isFinite(y))endpoints.push([Math.round(x/cw),Math.round(y/ch)]);};
  for(let itemIndex=0;itemIndex<items.length;itemIndex++){
    const it=items[itemIndex];
    activeLayer=it.layer;
    if(it.hatchBoundary||!names.has(it.layer))continue;
    if(hidden.has(it.layer)){skippedHidden++;continue;}
    if(isDimensionGraphicItem(it)){skippedDimensionItems++;continue;}
    if(isNonBoundarySemanticItem(it,{allowBlockInstance:isArchitecturalWallBlock(it)})){skippedSemanticItems++;continue;}
    if((it.kind==="line"||it.kind==="polyline")&&Array.isArray(it.pts)&&it.pts.length>=4){
      usedItems++;
      const segments=[];
      const isClosed=it.closed===true||it.isClosed===true||it.closedFlag===true||it.flags?.closed===true;
      const polylinePts=it.kind==="polyline"&&Array.isArray(it.bulges)
        ?tessellateBulgedPolyline({pts:it.pts,bulges:it.bulges,closed:isClosed},{maxSegments:20000}).points.flat()
        :it.pts;
      for(let k=0;k+3<polylinePts.length;k+=2){
        const segment={x1:polylinePts[k],y1:polylinePts[k+1],x2:polylinePts[k+2],y2:polylinePts[k+3]};
        segment.used=line(segment.x1,segment.y1,segment.x2,segment.y2);
        segments.push(segment);
      }
      // A CAD polyline's intermediate vertices are connected corners, not
      // free wall ends. Only its true first/last vertices may close a doorway.
      if(isClosed&&segments.length){
        const first=segments[0],last=segments[segments.length-1];
        if(first.used&&last.used)line(last.x2,last.y2,first.x1,first.y1);
      }else if(!it.virtualBoothClosure&&segments.length){
        const first=segments[0],last=segments[segments.length-1];
        if(first.used)rememberDoorEndpoint(first.x1,first.y1,first.x2-first.x1,first.y2-first.y1,activeLayer,itemIndex);
        if(last.used)rememberDoorEndpoint(last.x2,last.y2,last.x1-last.x2,last.y1-last.y2,activeLayer,itemIndex);
      }
    }else if((it.kind==="arc"||it.kind==="circle")&&(Number.isFinite(it.r??it.radius))&&(it.r??it.radius)>0){
      const center=it.center??it.centre,cx=Number(it.cx??it.x??center?.[0]??center?.x),cy=Number(it.cy??it.y??center?.[1]??center?.y),radius=Number(it.r??it.radius);
      if(!Number.isFinite(cx)||!Number.isFinite(cy))continue;
      usedItems++;
      const rawA0=Number(it.a0??it.startAngle??0),rawA1=Number(it.a1??it.endAngle??(rawA0+Math.PI*2));
      const rawSweep=rawA1-rawA0,circle=it.kind==="circle"||it.isCircle===true||Math.abs(Math.abs(rawSweep)-Math.PI*2)<=1e-6,a0=circle?0:rawA0;
      let sweep=circle?Math.PI*2:rawSweep;
      if(Math.abs(sweep)>Math.PI*2)sweep=Math.sign(sweep)*Math.PI*2;
      const n=Math.max(16,Math.ceil(Math.abs(sweep)*radius/Math.min(cw,ch)*2));
      let px=cx+radius*Math.cos(a0),py=cy+radius*Math.sin(a0);
      if(!circle){rememberEndpoint(px,py);rememberEndpoint(cx+radius*Math.cos(a0+sweep),cy+radius*Math.sin(a0+sweep));}
      for(let k=1;k<=n;k++){const a=a0+sweep*k/n,x=cx+radius*Math.cos(a),y=cy+radius*Math.sin(a);line(px,py,x,y);px=x;py=y;}
    }else if(it.kind==="ellipse"||it.kind==="spline"){
      const curve=tessellateCadCurve(it,{maxSegments:20000});
      if(curve.points.length>=2){
        usedItems++;
        for(let k=0;k+1<curve.points.length;k++)line(curve.points[k][0],curve.points[k][1],curve.points[k+1][0],curve.points[k+1][1]);
        if(curve.closed&&curve.points.length>2)line(curve.points.at(-1)[0],curve.points.at(-1)[1],curve.points[0][0],curve.points[0][1]);
      }
    }else if(it.kind==="fill"&&Array.isArray(it.pts)&&it.pts.length>=6){
      if(!isWallLikeFill(it.pts,cw,ch)){skippedNonWallFills++;continue;}
      usedItems++;for(let k=0;k+3<it.pts.length;k+=2)line(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);
      line(it.pts[it.pts.length-2],it.pts[it.pts.length-1],it.pts[0],it.pts[1]);
    }
  }
  // Repair near-miss T-junctions before flood fill. CAD plans often draw a
  // partition endpoint a few millimetres short of the receiving wall; endpoint-
  // to-endpoint healing cannot fix that. Index sampled segment points in grid
  // space, then connect only endpoints lying within 2.25 raster cells of a
  // segment interior. The small, resolution-relative tolerance cannot bridge
  // normal door openings.
  const tCell=8,tBins=new Map(),tKey=(x,y)=>Math.floor(x/tCell)+":"+Math.floor(y/tCell);
  for(let si=0;si<geometrySegments.length;si++){
    const s=geometrySegments[si],dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.hypot(dx,dy);
    const steps=Math.max(1,Math.ceil(len/(tCell*.7)));
    for(let k=0;k<=steps;k++){
      const t=k/steps,key=tKey(s.x1+dx*t,s.y1+dy*t);
      if(!tBins.has(key))tBins.set(key,new Set());
      tBins.get(key).add(si);
    }
  }
  const endpointSeen=new Set();
  for(const [ex,ey] of endpoints){
    const pointKey=ex+","+ey;if(endpointSeen.has(pointKey))continue;endpointSeen.add(pointKey);
    const bx=Math.floor(ex/tCell),by=Math.floor(ey/tCell),candidates=new Set();
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)
      for(const si of tBins.get((bx+ox)+":"+(by+oy))||[])candidates.add(si);
    let best=null,bestD=2.25*2.25;
    for(const si of candidates){
      const s=geometrySegments[si],dx=s.x2-s.x1,dy=s.y2-s.y1,l2=dx*dx+dy*dy;
      if(l2<1)continue;
      const t=((ex-s.x1)*dx+(ey-s.y1)*dy)/l2;
      if(t<.03||t>.97)continue;
      const px=s.x1+t*dx,py=s.y1+t*dy,d2=(ex-px)*(ex-px)+(ey-py)*(ey-py);
      if(d2>0.04&&d2<bestD){bestD=d2;best={x:px,y:py};}
    }
    if(best){
      const steps=Math.max(1,Math.ceil(Math.sqrt(bestD)*2));
      for(let k=0;k<=steps;k++){const t=k/steps,x=Math.round(ex+(best.x-ex)*t),y=Math.round(ey+(best.y-ey)*t);if(x>=0&&x<nx&&y>=0&&y<ny)wall[y*nx+x]=1;}
      snappedTJunctions++;
    }
  }
  // Heal short collinear gaps between separate CAD entities before the
  // larger doorway bridge pass. JWW often fragments one physical partition into
  // short strokes with 30-40 mm drafting gaps; endpoint dilation alone is not
  // sufficient at the selected raster resolution. Keep this below ordinary
  // door-opening widths and require same-layer, facing, mutually-nearest ends.
  const fragmentGapMax=60,fragmentBucket=fragmentGapMax,fragmentBins=new Map();
  const fragmentKey=(x,y)=>Math.floor(x/fragmentBucket)+":"+Math.floor(y/fragmentBucket);
  for(let i=0;i<doorEndpoints.length;i++){
    const ep=doorEndpoints[i],key=fragmentKey(ep.x,ep.y);
    if(!fragmentBins.has(key))fragmentBins.set(key,[]);
    fragmentBins.get(key).push(i);
  }
  const fragmentBest=new Map();
  for(let i=0;i<doorEndpoints.length;i++){
    const a=doorEndpoints[i],bx=Math.floor(a.x/fragmentBucket),by=Math.floor(a.y/fragmentBucket);
    let bestIndex=-1,bestDistance=Infinity;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      for(const j of fragmentBins.get((bx+ox)+":"+(by+oy))||[]){
        if(i===j)continue;
        const b=doorEndpoints[j];
        if(a.sourceId===b.sourceId||a.layer==null||a.layer!==b.layer)continue;
        const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
        if(distance<1||distance>fragmentGapMax)continue;
        const ux=dx/distance,uy=dy/distance;
        if(a.ux*ux+a.uy*uy>-.96||b.ux*ux+b.uy*uy<.96)continue;
        if(Math.abs(a.ux*uy-a.uy*ux)*distance>35||Math.abs(b.ux*uy-b.uy*ux)*distance>35)continue;
        if(distance<bestDistance){bestDistance=distance;bestIndex=j;}
      }
    }
    if(bestIndex>=0)fragmentBest.set(i,bestIndex);
  }
  let bridgedFragmentGaps=0;
  for(const [i,j] of fragmentBest){
    if(i>=j||fragmentBest.get(j)!==i)continue;
    const a=doorEndpoints[i],b=doorEndpoints[j],dx=b.x-a.x,dy=b.y-a.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.min(cw,ch)*2));
    for(let k=0;k<=steps;k++){const t=k/steps;markWorld(a.x+dx*t,a.y+dy*t);}
    bridgedFragmentGaps++;
  }
  // Bridge only mutually-best facing endpoints. A global all-pairs bridge can
  // accidentally connect nearby parallel walls, T-junctions, or adjacent cubicles.
  // Mutual nearest-neighbour matching makes each endpoint participate in at most
  // one doorway bridge and prefers the most plausible local opening.
  const bridgeMin=350,bridgeMax=1200,bucketSize=bridgeMax;
  const endpointBins=new Map();
  for(let i=0;i<doorEndpoints.length;i++){
    const ep=doorEndpoints[i],bx=Math.floor(ep.x/bucketSize),by=Math.floor(ep.y/bucketSize),key=bx+":"+by;
    if(!endpointBins.has(key))endpointBins.set(key,[]);
    endpointBins.get(key).push(i);
  }
  const best=new Map();
  for(let i=0;i<doorEndpoints.length;i++){
    const a=doorEndpoints[i],bx=Math.floor(a.x/bucketSize),by=Math.floor(a.y/bucketSize);
    let bestIndex=-1,bestScore=Infinity;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      for(const j of endpointBins.get((bx+ox)+":"+(by+oy))||[]){
        if(i===j)continue;
        const b=doorEndpoints[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
        if(dist<bridgeMin||dist>bridgeMax)continue;
        const ux=dx/dist,uy=dy/dist;
        // Both endpoints must point into the same gap, face each other,
        // and lie on the same projected wall axis.
        if(a.ux*ux+a.uy*uy>-.96||b.ux*ux+b.uy*uy<.96)continue;
        // Permit modest perpendicular drafting offsets on angled partition fragments.
         // Mutual-nearest matching and opposing directions keep this local; the
         // 50 mm ceiling avoids turning ordinary nearby parallel walls into joins.
         if(Math.abs(a.ux*uy-a.uy*ux)*dist>50||Math.abs(b.ux*uy-b.uy*ux)*dist>50)continue;
        const score=dist;
        if(score<bestScore){bestScore=score;bestIndex=j;}
      }
    }
    if(bestIndex>=0)best.set(i,bestIndex);
  }
  let bridgedDoorGaps=0;
  for(const [i,j] of best){
    if(i>=j||best.get(j)!==i)continue;
    const a=doorEndpoints[i],b=doorEndpoints[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
    const steps=Math.max(1,Math.ceil(dist/Math.min(cw,ch)*2));
    for(let k=0;k<=steps;k++){const t=k/steps;markWorld(a.x+dx*t,a.y+dy*t);}
    bridgedDoorGaps++;
  }
  // Heal only tiny drafting gaps between distinct line endpoints.
  const bins=new Map(),tol=1.6,tol2=tol*tol;
  for(const [x,y] of endpoints){
    const bx=Math.floor(x/2),by=Math.floor(y/2);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const bucket=bins.get((bx+ox)+":"+(by+oy));if(!bucket)continue;
      for(const [px,py] of bucket){
        const dx=x-px,dy=y-py,d2=dx*dx+dy*dy;
        if(d2>0.01&&d2<=tol2){
          const steps=Math.max(1,Math.ceil(Math.sqrt(d2)*2));
          for(let k=0;k<=steps;k++){const t=k/steps,xx=Math.round(px+dx*t),yy=Math.round(py+dy*t);if(xx>=0&&xx<nx&&yy>=0&&yy<ny)wall[yy*nx+xx]=1;}
        }
      }
    }
    const key=bx+":"+by;if(!bins.has(key))bins.set(key,[]);bins.get(key).push([x,y]);
  }
  return {wall,usedItems,usedSegments,usedLayers:[...usedLayers],geometrySegments,skippedHidden,skippedDimensionItems,skippedDimensionSegments,skippedSemanticItems,skippedNonWallFills,endpointCount:endpoints.length,bridgedDoorGaps,bridgedFragmentGaps,snappedTJunctions,rasterizedCells};
}
function floodRegions(wall,nx,ny){
  const N=nx*ny,seen=new Uint8Array(N),queue=new Int32Array(N),regionAt=new Int32Array(N),regions=[];regionAt.fill(-1);let rid=0;
  for(let p=0;p<N;p++){
    if(wall[p]||seen[p])continue;
    const regionId=rid++;let head=0,tail=0;queue[tail++]=p;seen[p]=1;regionAt[p]=regionId;
    let area=0,sx=0,sy=0,minx=nx,miny=ny,maxx=0,maxy=0;
    while(head<tail){
      const q=queue[head++],x=q%nx,y=(q/nx)|0;area++;sx+=x;sy+=y;
      if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
      const ns=[x?q-1:-1,x<nx-1?q+1:-1,y?q-nx:-1,y<ny-1?q+nx:-1];
      for(const z of ns)if(z>=0&&!wall[z]&&!seen[z]){seen[z]=1;regionAt[z]=regionId;queue[tail++]=z;}
    }
    // Place labels on an actual cell inside the component. The geometric centroid
    // can fall outside concave/L-shaped rooms, so choose the component cell nearest it.
    let labelSeed=p,best=Infinity;
    for(let k=0;k<tail;k++){const z=queue[k],x=z%nx,y=(z/nx)|0,d=(x-sx/area)**2+(y-sy/area)**2;if(d<best){best=d;labelSeed=z;}}
    regions.push({id:regionId,seed:p,area,cx:sx/area,cy:sy/area,labelX:labelSeed%nx,labelY:(labelSeed/nx)|0,minx,miny,maxx,maxy,touchesEdge:minx===0||miny===0||maxx===nx-1||maxy===ny-1});
  }
  return {regions,regionAt};
}
function chooseRegions(regions,N,maxRatio=.82,nx= Math.round(Math.sqrt(N)),ny=Math.round(Math.sqrt(N)),cellWorldSize=1){
  const inner=regions.filter(r=>!r.touchesEdge).sort((a,b)=>b.area-a.area);
  // Keep the minimum span tied to drawing units and raster resolution, not to
  // the overall sheet size. A fixed percentage of a large warehouse plan can
  // otherwise erase real 900 mm toilet cubicles and compact service rooms.
  // The 8-cell floor still rejects sub-resolution drafting noise.
  const minCells=16,minSpanCells=Math.max(8,Math.ceil(30/Math.max(1e-9,cellWorldSize)));
  const kept=inner.filter(r=>{
    const w=Math.max(1,r.maxx-r.minx+1),h=Math.max(1,r.maxy-r.miny+1);
    const boxArea=w*h,fill=r.area/boxArea,aspect=Math.max(w,h)/Math.min(w,h),ratio=r.area/N;
    // Reject drafting islands, thin annotation strips and tiny title-block cells.
    // Keep large halls: a high area alone is not enough to discard a real room.
    return r.area>=minCells&&Math.min(w,h)>=minSpanCells&&ratio<=maxRatio&&fill>=.10&&aspect<=24;
  }).slice(0,500);
  return {inner,minCells,minSpanCells,kept};
}
function floorPolygonOf(item){
 const role=String(item?.semanticRole??item?.semantic?.role??item?.role??item?.sourceGeometry?.semanticRole??item?.sourceGeometry?.semantic?.role??"").trim().toLowerCase().replace(/[\s_]+/g,"-");
 const explicit=item?.floorFill===true||role==="floor"||role.startsWith("floor-")||role.startsWith("floor.");
 if(!explicit)return null;
 const kind=String(item?.kind??item?.type??"").toLowerCase();
 if(!["fill","solid","polyline"].includes(kind))return null;
 if(kind==="polyline"&&!(item.closed===true||item.isClosed===true||item.closedFlag===true||item.flags?.closed===true))return null;
 const raw=item.pts??item.points??item.vertices;if(!Array.isArray(raw))return null;
 if(kind==="polyline"&&(Array.isArray(item.bulges)||raw.some(vertex=>vertex&&typeof vertex==="object"&&Number(vertex.bulge)!==0))){
  const curve=tessellateBulgedPolyline(item,{maxSegments:20000});
  return curve.closed&&curve.points.length>=3?curve.points.map(([x,y])=>({x,y})):null;
 }
 const points=raw.length&&typeof raw[0]==="object"
  ?raw.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)).map(p=>({x:p.x,y:p.y}))
  :Array.from({length:Math.floor(raw.length/2)},(_,i)=>({x:raw[i*2],y:raw[i*2+1]})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 return points.length>=3?points:null;
}
function createFloorSpaceMask(items,wall,nx,ny,cw,ch,hidden){
 const mask=new Uint8Array(nx*ny);mask.fill(1);const layers=new Set();let floorFillCount=0,floorMaskCells=0;
 for(const item of items||[]){
  if(hidden.has(item?.layer))continue;
  const points=floorPolygonOf(item);if(!points)continue;
  floorFillCount++;if(item.layer!=null)layers.add(String(item.layer));
  const minX=Math.max(0,Math.ceil(Math.min(...points.map(p=>p.x))/cw-.5));
  const maxX=Math.min(nx-1,Math.floor(Math.max(...points.map(p=>p.x))/cw-.5));
  const minY=Math.max(0,Math.ceil(Math.min(...points.map(p=>p.y))/ch-.5));
  const maxY=Math.min(ny-1,Math.floor(Math.max(...points.map(p=>p.y))/ch-.5));
  for(let iy=minY;iy<=maxY;iy++){
   const y=(iy+.5)*ch,intersections=[];
   for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];
    if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))intersections.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
   }
   intersections.sort((a,b)=>a-b);
   for(let k=0;k+1<intersections.length;k+=2){
    const left=Math.max(minX,Math.ceil(intersections[k]/cw-.5)),right=Math.min(maxX,Math.floor(intersections[k+1]/cw-.5));
    for(let ix=left;ix<=right;ix++){const index=iy*nx+ix;if(!wall[index]&&mask[index]){mask[index]=0;floorMaskCells++;}}
   }
  }
 }
 return {wall:mask,floorFillCount,floorMaskCells,layers:[...layers]};
}
function furnitureHaloEvidence(region,items,wallNames,hidden,cw,ch){
  const areaM2=region.area*cw*ch/1e6;
  if(areaM2<.3||areaM2>4)return false;
  const minX=region.minx*cw,maxX=(region.maxx+1)*cw,minY=region.miny*ch,maxY=(region.maxy+1)*ch;
  const labelPattern=/(トイレ|便所|WC|洗面|脱衣|浴室|倉庫|収納|物入|更衣|会議|事務|休憩|厨房|食堂|通路|廊下|洋室|和室|寝室|書庫|機械室|電気室)/i;
  for(const it of items||[]){
    const kind=String(it?.kind??it?.type??"").toLowerCase();
    if(kind!=="text")continue;
    const value=String(it.text??it.t??it.value??"");
    const x=Number(it.x??it.position?.x),y=Number(it.y??it.position?.y);
    if(labelPattern.test(value)&&Number.isFinite(x)&&Number.isFinite(y)&&x>=minX&&x<=maxX&&y>=minY&&y<=maxY)return false;
  }
  const sides=new Set(),centers=new Set();
  for(const it of items||[]){
    const layer=String(it?.layer??"");
    if(!layer||wallNames.has(layer)||hidden.has(layer))continue;
    if(/寸法|注記|文字|annotation|dimension|leader|\bdim\b/i.test(layer))continue;
    const kind=String(it?.kind??it?.type??"").toLowerCase();
    if(!["line","polyline","arc","circle","fill","solid"].includes(kind))continue;
    let xs=[],ys=[];
    const raw=it.pts??it.points??it.vertices;
    if(Array.isArray(raw)){
      if(raw.length&&typeof raw[0]==="object"){
        for(const p of raw){if(Number.isFinite(p?.x)&&Number.isFinite(p?.y)){xs.push(p.x);ys.push(p.y);}}
      }else{
        for(let i=0;i+1<raw.length;i+=2){if(Number.isFinite(raw[i])&&Number.isFinite(raw[i+1])){xs.push(raw[i]);ys.push(raw[i+1]);}}
      }
    }
    if(!xs.length&&["arc","circle"].includes(kind)){
      const center=it.center??it.centre;
      const x=Number(it.cx??it.x??center?.[0]??center?.x),y=Number(it.cy??it.y??center?.[1]??center?.y),r=Number(it.r??it.radius);
      if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(r)){xs=[x-r,x+r];ys=[y-r,y+r];}
    }
    if(!xs.length)continue;
    const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
    const vertical=y>=minY-300&&y<=maxY+300,horizontal=x>=minX-300&&x<=maxX+300;
    if(x<minX&&minX-x<=500&&vertical)sides.add("left");
    else if(x>maxX&&x-maxX<=500&&vertical)sides.add("right");
    if(y<minY&&minY-y<=500&&horizontal)sides.add("bottom");
    else if(y>maxY&&y-maxY<=500&&horizontal)sides.add("top");
    if((x<minX&&minX-x<=500&&vertical)||(x>maxX&&x-maxX<=500&&vertical)||(y<minY&&minY-y<=500&&horizontal)||(y>maxY&&y-maxY<=500&&horizontal)){
      centers.add(Math.round(x/250)+":"+Math.round(y/250));
    }
  }
  return centers.size>=4&&((sides.has("left")&&sides.has("right"))||(sides.has("top")&&sides.has("bottom")));
}
function filterFurnitureIslands(regions,items,wallNames,hidden,cw,ch){
  const filteredKeys=[];
  const kept=(regions.kept||[]).filter(region=>{
    if(!furnitureHaloEvidence(region,items,wallNames,hidden,cw,ch))return true;
    filteredKeys.push([region.id,region.seed,region.area].join(":"));return false;
  });
  return {...regions,kept,filteredFurnitureIslands:filteredKeys.length,filteredFurnitureKeys:filteredKeys};
}
export function extractRoomHierarchy({items,width,height,layers,selectedLayers,hiddenLayers=[]}){
  if(!(width>0&&height>0))throw new Error("図面サイズを取得できません");
  const hidden=new Set(hiddenLayers);
  const classified=classifyLayers(layers,items,hidden);
  // An explicit wall-candidate selection filters the geometry used for room
  // extraction; it must not promote every interior partition to an outer boundary.
  // Prefer semantically named exterior layers for the parent pass, while all
  // selected wall candidates remain available to the child-room pass.
  const requested=selectedLayers?.length
    ?new Set(selectedLayers.filter(name=>!NON_WALL_NAME.test(String(name))))
    :null;
  // Explicit selection controls the parent-boundary preference, not the
  // supplemental child-wall set. Keep automatically classified wall layers
  // available so choosing only the exterior layer does not erase partitions.
  let allNames=requested
    ?new Set([...requested,...classified.all])
    :new Set(classified.all);
  let selected=requested
    ?(()=>{const exterior=[...new Set([...requested,...classified.all])].filter(name=>OUTER_WALL_NAME.test(String(name)));return new Set(exterior.length?exterior:requested);})()
    :new Set(classified.parent);
  const hasFloorFills=items.some(item=>floorPolygonOf(item));
  if(!allNames.size&&!hasFloorFills)throw new Error("壁レイヤーを自動判定できません。誤った区画を表示しないため自動色付けを停止しました。壁レイヤーを明示選択してください。");
  let fallbackUsed=false;
  const supplemental=new Set([...allNames].filter(n=>!selected.has(n)));
  const aspect=width/height;
  const target=Math.max(900,Math.min(1500,Math.round(1100*Math.sqrt(Math.min(1.8,Math.max(.55,aspect))))));
  const nx=Math.max(320,Math.min(1500,Math.round(target*Math.sqrt(aspect))));
  const ny=Math.max(320,Math.min(1500,Math.round(target/Math.sqrt(aspect))));
  const cw=width/nx,ch=height/ny,N=nx*ny;
  let parentTrace=traceItems(items,selected,hidden,width,height,nx,ny,cw,ch);
  // Exterior perimeter edges must not be interpreted as cubicle partitions.
  // Keep generic wall layers eligible, but exclude explicitly named outer-wall layers.
  const boothPartitionNames=new Set([...allNames].filter(name=>!OUTER_WALL_NAME.test(String(name))));
  let boothClosures=findBoothFrontClosures(items,boothPartitionNames,hidden);
  let childItems=boothClosures.length?[...items,...boothClosures]:items;
  let childTrace=traceItems(childItems,allNames,hidden,width,height,nx,ny,cw,ch);
  let parentFlood=floodRegions(parentTrace.wall,nx,ny);
  let childFlood=floodRegions(childTrace.wall,nx,ny);
  let parents=chooseRegions(parentFlood.regions,N,.995,nx,ny,Math.min(cw,ch));
  let children=chooseRegions(childFlood.regions,N,.995,nx,ny,Math.min(cw,ch));
  // If semantic wall-layer selection misses the building perimeter, retry with
  // every geometric layer except clearly non-architectural annotation/furniture.
  // This fallback is automatic and is used only when the first pass finds no room.
  if(!parents.kept.length&&selected.size<allNames.size){
    fallbackUsed=true;
    selected=new Set(allNames);
    parentTrace=traceItems(items,selected,hidden,width,height,nx,ny,cw,ch);
    boothClosures=findBoothFrontClosures(items,new Set([...allNames].filter(name=>!OUTER_WALL_NAME.test(String(name)))),hidden);
    childItems=boothClosures.length?[...items,...boothClosures]:items;
    childTrace=traceItems(childItems,allNames,hidden,width,height,nx,ny,cw,ch);
    parentFlood=floodRegions(parentTrace.wall,nx,ny);
    // Keep the child topology independent: virtual cubicle-front closures are
    // intentionally present only in childTrace. Reusing parentFlood here silently
    // discarded those closures whenever automatic layer fallback was needed.
    childFlood=floodRegions(childTrace.wall,nx,ny);
    parents=chooseRegions(parentFlood.regions,N,.995,nx,ny,Math.min(cw,ch));
    children=chooseRegions(childFlood.regions,N,.995,nx,ny,Math.min(cw,ch));
  }
  const floorMask=createFloorSpaceMask(items,childTrace.wall,nx,ny,cw,ch,hidden);
  let floorFlood=null,floorRegions={inner:[],kept:[],minCells:0,minSpanCells:0},floorFillUsed=false;
  if(floorMask.floorFillCount&&floorMask.floorMaskCells){
    floorFlood=floodRegions(floorMask.wall,nx,ny);
    floorRegions=chooseRegions(floorFlood.regions,N,.995,nx,ny,Math.min(cw,ch));
    if(floorRegions.kept.length){
      if(!parents.kept.length){
        parents=floorRegions;parentFlood=floorFlood;
        children={inner:[],kept:[],minCells:children.minCells,minSpanCells:children.minSpanCells};
        floorFillUsed=true;
      }else if(floorRegions.kept.length>children.kept.length){
        const sameAsParents=floorRegions.kept.length===parents.kept.length&&floorRegions.kept.every(floorRegion=>
          parents.kept.some(parent=>Math.abs(floorRegion.area-parent.area)<=Math.max(1,parent.area*.05)&&Math.hypot(floorRegion.cx-parent.cx,floorRegion.cy-parent.cy)<=2));
        if(!sameAsParents){children=floorRegions;childFlood=floorFlood;floorFillUsed=true;}
      }
    }
  }
  // Closed furniture outlines sometimes share a wall layer with architectural
  // geometry. A small isolated loop surrounded by repeated non-wall symbols is
  // not a room; retain it only when an explicit room label provides evidence.
  let filteredFurnitureIslands=0;
  if(!floorFillUsed){
    parents=filterFurnitureIslands(parents,items,allNames,hidden,cw,ch);
    children=filterFurnitureIslands(children,items,allNames,hidden,cw,ch);
    filteredFurnitureIslands=new Set([...(parents.filteredFurnitureKeys||[]),...(children.filteredFurnitureKeys||[])]).size;
  }
  const parentRooms=parents.kept.map((r,i)=>({...r,name:"大部屋 "+(i+1),level:1,children:[]}));
  const parentByRegion=new Map(parentRooms.map(p=>[p.id,p]));
  const childRooms=[];let unassignedChildren=0;
  const childGroups=new Map();
  for(const child of children.kept){
    const parentRegionId=parentFlood.regionAt[child.seed];
    if(!childGroups.has(parentRegionId))childGroups.set(parentRegionId,[]);
    childGroups.get(parentRegionId).push(child);
  }
  for(const [parentRegionId,group] of childGroups){
    const parent=parentByRegion.get(parentRegionId);
    if(!parent){unassignedChildren+=group.length;continue;}
    // A lone child covering nearly all of its parent is the same space, often
    // caused by a doorway gap. If a second enclosed component exists, retain
    // both the dominant hall and the small enclosed room.
    if(group.length===1&&group[0].area>=parent.area*.985)continue;
    for(const child of group){
      const room={...child,name:parent.name+"-"+(parent.children.length+1),level:2,parentId:parent.id,parentName:parent.name,children:[]};
      parent.children.push(room);childRooms.push(room);
    }
  }
  const scaleTrace=childRooms.length?childTrace:parentTrace;
  const scaleLayerNames=new Set([...(scaleTrace.usedLayers||[]),...(floorFillUsed?floorMask.layers:[])]);
  const scaleLayers=[...scaleLayerNames].map(name=>({name,scale:(layers||[]).find(layer=>String(layer?.name??"")===String(name))?.scale}));
  const knownScales=scaleLayers.map(entry=>entry.scale).filter(value=>Number.isFinite(value)&&value>0);
  const unknownScaleLayers=scaleLayers.filter(entry=>!(Number.isFinite(entry.scale)&&entry.scale>0)).map(entry=>entry.name);
  const uniqueScales=[...new Set(knownScales.map(value=>Number(value.toPrecision(10))))];
  const scaleAssessment={
    status:!scaleLayers.length||unknownScaleLayers.length?"unknown":uniqueScales.length===1?"uniform":"mixed",
    denominator:!unknownScaleLayers.length&&uniqueScales.length===1?uniqueScales[0]:null,
    candidateLayers:scaleLayers.length,usedBoundaryLayers:[...scaleLayerNames],unknownLayers:unknownScaleLayers,distinctDenominators:uniqueScales
  };
  // Prefer the finer partition for rendering, falling back to parent spaces if no inner walls were found.
  const displayRooms=childRooms.length?childRooms:parentRooms;
  const ids=new Int32Array(N);ids.fill(-1);
  // Flood-fill already assigned every open cell to a region. Reuse that topology
  // instead of allocating and traversing a full-size visited array once per room.
  // This keeps rendering close to O(grid cells + room count), even on dense plans.
  const displayRegionAt=childRooms.length?childFlood.regionAt:parentFlood.regionAt;
  const maxRegionId=displayRooms.reduce((max,r)=>Math.max(max,r.id),-1);
  // Attribute actual traced boundary segments to adjacent room regions. This lets
  // each room use the scale of its own enclosing walls instead of requiring every
  // wall layer in the entire drawing to share one denominator.
  const roomBoundaryLayers=new Map(displayRooms.map(room=>[room.id,new Set()]));
  const scaleSegments=scaleTrace.geometrySegments||[];
  for(const segment of scaleSegments){
    if(!segment.layer)continue;
    const dx=segment.x2-segment.x1,dy=segment.y2-segment.y1,len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    const nxn=-dy/len,nyn=dx/len,steps=Math.max(1,Math.ceil(len/3));
    for(let k=0;k<=steps;k++){
      const t=k/steps,x=segment.x1+dx*t,y=segment.y1+dy*t;
      for(const offset of [1.5,2.5,4]){
        for(const sign of [-1,1]){
          const ix=Math.round(x+nxn*offset*sign),iy=Math.round(y+nyn*offset*sign);
          if(ix<0||iy<0||ix>=nx||iy>=ny)continue;
          const regionId=displayRegionAt[iy*nx+ix];
          if(roomBoundaryLayers.has(regionId))roomBoundaryLayers.get(regionId).add(segment.layer);
        }
      }
    }
  }
  const layerScaleByName=new Map((layers||[]).map(layer=>[String(layer?.name??""),layer?.scale]));
  const assessRoomScale=room=>{
    const names=roomBoundaryLayers.get(room.id)||new Set();
    if(floorFillUsed)for(const name of floorMask.layers)names.add(name);
    // If raster adjacency could not confidently associate a boundary, retain the
    // conservative whole-trace assessment rather than guessing a room scale.
    if(!names.size)return scaleAssessment;
    const entries=[...names].map(name=>({name,scale:layerScaleByName.get(name)}));
    const unknown=entries.filter(entry=>!(Number.isFinite(entry.scale)&&entry.scale>0)).map(entry=>entry.name);
    const scales=[...new Set(entries.filter(entry=>Number.isFinite(entry.scale)&&entry.scale>0).map(entry=>Number(Number(entry.scale).toPrecision(10))))];
    const status=!entries.length||unknown.length?"unknown":scales.length===1?"uniform":"mixed";
    return {status,denominator:status==="uniform"?scales[0]:null,boundaryLayers:[...names],unknownLayers:unknown,distinctDenominators:scales};
  };
  const roomScaleAssessments=new Map(displayRooms.map(room=>[room.id,assessRoomScale(room)]));
  const displayIndexByRegion=new Int32Array(maxRegionId+1);displayIndexByRegion.fill(-1);
  for(let ri=0;ri<displayRooms.length;ri++)displayIndexByRegion[displayRooms[ri].id]=ri;
  for(let cell=0;cell<N;cell++){
    const regionId=displayRegionAt[cell];
    if(regionId>=0&&regionId<displayIndexByRegion.length){
      const displayIndex=displayIndexByRegion[regionId];
      if(displayIndex>=0)ids[cell]=displayIndex;
    }
  }
  // Diagnostic-only inventory: preserve every source item and expose which
  // primitive and source/block metadata survives the CAD reader.
  const layerStats=new Map();
  for(const it of items){
    const name=String(it.layer??"(レイヤーなし)");
    if(!layerStats.has(name))layerStats.set(name,{name,total:0,line:0,arc:0,fill:0,text:0,other:0,sourceTagged:0,blockTagged:0});
    const stat=layerStats.get(name);stat.total++;
    if(["line","arc","fill","text"].includes(it.kind))stat[it.kind]++;else stat.other++;
    if(["sourceType","sourceFormat","sourceHandle","sourceLayerGroup","entityType","sourceId","objectId","sourceInsertHandle","sourceBlockHandle","sourceEntityHandle","handle"].some(k=>it[k]!=null)||(Array.isArray(it.blockPath)&&it.blockPath.length>0))stat.sourceTagged++;
    if(["blockName","blockId","blockNum","sourceInsertHandle","sourceBlockHandle"].some(k=>it[k]!=null)||(Array.isArray(it.blockPath)&&it.blockPath.length>0)||it.blockInstance===true)stat.blockTagged++;
  }
  const layerInventory=[...layerStats.values()].sort((a,b)=>b.total-a.total);
  return {
    rooms:displayRooms.map((r,i)=>{
      const drawingAreaCm2=r.area*cw*ch/100;
      const roomScale=roomScaleAssessments.get(r.id)||scaleAssessment;
      return {...r,id:i,drawingAreaCm2,scaleAssessment:roomScale,
        realAreaM2:roomScale.status==="uniform"?drawingAreaCm2*roomScale.denominator*roomScale.denominator/10000:null};
    }),
    parents:parentRooms.map(p=>({...p,children:p.children.map(c=>c.name)})),
    grid:{ids,nx,ny,cw,ch},
    diagnostics:{scaleAssessment,roomScaleAssessments:displayRooms.map(room=>({roomId:room.id,name:room.name,...(roomScaleAssessments.get(room.id)||scaleAssessment)})),floorFillCount:floorMask.floorFillCount,floorMaskCells:floorMask.floorMaskCells,floorRegions:floorRegions.inner.length,floorFillLayers:floorMask.layers,floorFillUsed,filteredFurnitureIslands,selectedLayers:selected.size,supplementalLayers:supplemental.size,autoMode:classified.mode+(fallbackUsed?" → 全図形レイヤー再判定":""),fallbackUsed,parentLayerNames:[...selected],wallLayerNames:[...allNames],layerInventory,parentRegions:parents.inner.length,childRegions:children.inner.length,parentsKept:parentRooms.length,childrenKept:childRooms.length,unassignedChildren,minParentCells:parents.minCells,minChildCells:children.minCells,minChildSpanCells:children.minSpanCells,minParentSpanCells:parents.minSpanCells,usedItems:childTrace.usedItems,usedSegments:childTrace.usedSegments,skippedHidden:childTrace.skippedHidden,skippedDimensionItems:childTrace.skippedDimensionItems,skippedDimensionSegments:childTrace.skippedDimensionSegments,skippedSemanticItems:childTrace.skippedSemanticItems,skippedNonWallFills:childTrace.skippedNonWallFills,rasterizedCells:childTrace.rasterizedCells,rasterization:"supercover",bridgedDoorGaps:childTrace.bridgedDoorGaps,bridgedFragmentGaps:childTrace.bridgedFragmentGaps,snappedTJunctions:childTrace.snappedTJunctions,virtualBoothClosures:boothClosures.length,endpointCount:childTrace.endpointCount}
  };
}
