// KAKU ORIGIN room extraction engine
// Grid-space topology engine. Coordinates are sheet mm; thresholds are relative to grid,
// never interpreted as real-world m² without scale conversion.
const OUTER_WALL_NAME=/(外壁|躯体|外周|建物外形|外形壁|exterior|outer.?wall)/i;
const WALL_NAME=/(壁|間仕切|躯体|外壁|内壁|壁芯|(?:^|[-_ ])(?:a-)?wall(?:$|[-_ ])|wall|partition)/i;
const NON_WALL_NAME=/(寸法|寸法線|寸法補助|寸法記入|寸法記号|引出線|引出|補助線|中心線|通り芯|グリッド|文字|注記|注釈|家具|什器|設備|器具|照明|電気|コンセント|記号|ハッチ|dimension|\bdim\b|measure|annotation|leader|extension|center.?line|grid|axis|furniture|fixture|text|symbol)/i;
// Numeric dimension labels help identify dimension strokes even when they share a wall layer.
const DIMENSION_LABEL=/^\s*[+-]?\d[\d,]*(?:\.\d+)?\s*(?:mm|ｍｍ|m|ｍ|cm|㎜|㎝|φ|ø)?\s*$/i;
function dimensionTextAnchors(items){
  return items.filter(it=>it.kind==="text"&&DIMENSION_LABEL.test(String(it.text||""))&&Number.isFinite(it.x)&&Number.isFinite(it.y)&&Number.isFinite(it.size)&&it.size>0).map(it=>{
    const w=Math.max(1,String(it.text).length)*it.size*.6,rot=it.rot||0;
    return {x:it.x+w*.5*Math.cos(rot)+it.size*.5*Math.sin(rot),y:it.y+w*.5*Math.sin(rot)-it.size*.5*Math.cos(rot),rot,radius:w*.55+it.size*.75,size:it.size};
  });
}
function isDimensionSegment(x1,y1,x2,y2,anchors){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(!len)return false;
  const angle=Math.atan2(dy,dx),ux=dx/len,uy=dy/len;
  for(const a of anchors){
    if(len<a.size*2||Math.abs(Math.sin(angle-a.rot))>=.22)continue;
    const t=Math.max(0,Math.min(1,((a.x-x1)*ux+(a.y-y1)*uy)/len));
    if(Math.hypot(a.x-(x1+t*dx),a.y-(y1+t*dy))<=a.radius)return true;
  }
  return false;
}
export function suggestWallLayers(layers=[]){
  const names=(layers||[]).map(layer=>typeof layer==="string"?layer:layer?.name);
  return [...new Set(names.filter(name=>name!=null&&WALL_NAME.test(String(name))&&!NON_WALL_NAME.test(String(name))).map(String))];
}
function classifyLayers(layers,items,hidden){
  const visible=(layers||[]).filter(l=>!hidden.has(l.name));
  const namedWalls=visible.filter(l=>WALL_NAME.test(String(l.name))&&!NON_WALL_NAME.test(String(l.name)));
  const geometryLayers=new Set(items.filter(it=>it.layer!=null&&["line","arc","fill"].includes(it.kind)).map(it=>it.layer));
  // Numeric or non-semantic layer names fall back to geometric layers, excluding obvious annotations.
  const candidates=namedWalls.length?namedWalls:visible.filter(l=>geometryLayers.has(l.name)&&!NON_WALL_NAME.test(String(l.name)));
  const outer=candidates.filter(l=>OUTER_WALL_NAME.test(String(l.name)));
  const parent=outer.length?outer:candidates;
  return {parent:new Set(parent.map(l=>l.name)),all:new Set(candidates.map(l=>l.name)),mode:namedWalls.length?(outer.length?"外周レイヤー＋壁レイヤー":"壁候補レイヤー"):"図形レイヤー自動判定"};
}
function findBoothFrontClosures(items,names,hidden){
  // Detect repeated U-shaped toilet cubicles: two parallel side partitions meet a
  // common rear wall, while their free ends face the same open corridor.
  // Close only the open front between those side partitions; ordinary door gaps
  // are collinear with their wall and therefore do not satisfy this geometry.
  const raw=[];
  for(const it of items){
    if(it.kind!=="line"||!names.has(it.layer)||hidden.has(it.layer)||!Array.isArray(it.pts))continue;
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
function traceItems(items, names, hidden, W, H, nx, ny, cw, ch) {
  const wall=new Uint8Array(nx*ny); let usedItems=0,usedSegments=0,skippedHidden=0,skippedDimensionSegments=0; const endpoints=[]; const doorEndpoints=[]; const dimAnchors=dimensionTextAnchors(items);
  const mark=(x,y)=>{
    const ix=Math.round(x/cw),iy=Math.round(y/ch);
    // 8-neighbour raster stroke reduces diagonal leaks.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=ix+dx,yy=iy+dy;
      if(xx>=0&&xx<nx&&yy>=0&&yy<ny)wall[yy*nx+xx]=1;
    }
  };
  const line=(x1,y1,x2,y2)=>{
    if(![x1,y1,x2,y2].every(Number.isFinite))return false;
    if(isDimensionSegment(x1,y1,x2,y2,dimAnchors)){skippedDimensionSegments++;return false;}
    endpoints.push([Math.round(x1/cw),Math.round(y1/ch)],[Math.round(x2/cw),Math.round(y2/ch)]);
    const steps=Math.max(1,Math.ceil(Math.hypot((x2-x1)/cw,(y2-y1)/ch)*2));
    for(let k=0;k<=steps;k++){const t=k/steps;mark(x1+(x2-x1)*t,y1+(y2-y1)*t);}
    usedSegments++;return true;
  };
  const rememberDoorEndpoint=(x,y,dx,dy)=>{
    const len=Math.hypot(dx,dy);
    if(len>0)doorEndpoints.push({x,y,ux:dx/len,uy:dy/len});
  };
  const rememberEndpoint=(x,y)=>{if(Number.isFinite(x)&&Number.isFinite(y))endpoints.push([Math.round(x/cw),Math.round(y/ch)]);};
  for(const it of items){
    if(!names.has(it.layer))continue;
    if(hidden.has(it.layer)){skippedHidden++;continue;}
    if(it.kind==="line"&&Array.isArray(it.pts)&&it.pts.length>=4){
      usedItems++;
      const segments=[];
      for(let k=0;k+3<it.pts.length;k+=2){
        const segment={x1:it.pts[k],y1:it.pts[k+1],x2:it.pts[k+2],y2:it.pts[k+3]};
        segment.used=line(segment.x1,segment.y1,segment.x2,segment.y2);
        segments.push(segment);
      }
      // A CAD polyline's intermediate vertices are connected corners, not
      // free wall ends. Only its true first/last vertices may close a doorway.
      if(!it.virtualBoothClosure&&segments.length){
        const first=segments[0],last=segments[segments.length-1];
        if(first.used)rememberDoorEndpoint(first.x1,first.y1,first.x2-first.x1,first.y2-first.y1);
        if(last.used)rememberDoorEndpoint(last.x2,last.y2,last.x1-last.x2,last.y1-last.y2);
      }
    }else if(it.kind==="arc"&&Number.isFinite(it.r)&&it.r>0){
      usedItems++;const sweep=it.a1-it.a0,n=Math.max(16,Math.ceil(Math.abs(sweep)*it.r/Math.min(cw,ch)*2));
      let px=it.cx+it.r*Math.cos(it.a0),py=it.cy+it.r*Math.sin(it.a0);rememberEndpoint(px,py);rememberEndpoint(it.cx+it.r*Math.cos(it.a1),it.cy+it.r*Math.sin(it.a1));
      for(let k=1;k<=n;k++){const a=it.a0+sweep*k/n,x=it.cx+it.r*Math.cos(a),y=it.cy+it.r*Math.sin(a);line(px,py,x,y);px=x;py=y;}
    }else if(it.kind==="fill"&&Array.isArray(it.pts)&&it.pts.length>=6){
      usedItems++;for(let k=0;k+3<it.pts.length;k+=2)line(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);
      line(it.pts[it.pts.length-2],it.pts[it.pts.length-1],it.pts[0],it.pts[1]);
    }
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
        if(Math.abs(a.ux*uy-a.uy*ux)*dist>35||Math.abs(b.ux*uy-b.uy*ux)*dist>35)continue;
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
    for(let k=0;k<=steps;k++){const t=k/steps;mark(a.x+dx*t,a.y+dy*t);}
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
  return {wall,usedItems,usedSegments,skippedHidden,skippedDimensionSegments,endpointCount:endpoints.length,bridgedDoorGaps};
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
function chooseRegions(regions,N,maxRatio=.82,nx= Math.round(Math.sqrt(N)),ny=Math.round(Math.sqrt(N))){
  const inner=regions.filter(r=>!r.touchesEdge).sort((a,b)=>b.area-a.area);
  // Do not scale the minimum room area from the largest hall: that erases
  // legitimate small rooms in large plans. Use a modest absolute cell floor
  // plus a sheet-relative minimum span to reject drafting/title-block islands.
  const minCells=16,minSpanCells=Math.max(8,Math.ceil(Math.min(nx,ny)*.03));
  const kept=inner.filter(r=>{
    const w=Math.max(1,r.maxx-r.minx+1),h=Math.max(1,r.maxy-r.miny+1);
    const boxArea=w*h,fill=r.area/boxArea,aspect=Math.max(w,h)/Math.min(w,h),ratio=r.area/N;
    // Reject drafting islands, thin annotation strips and tiny title-block cells.
    // Keep large halls: a high area alone is not enough to discard a real room.
    return r.area>=minCells&&Math.min(w,h)>=minSpanCells&&ratio<=maxRatio&&fill>=.10&&aspect<=24;
  }).slice(0,500);
  return {inner,minCells,minSpanCells,kept};
}
export function extractRoomHierarchy({items,width,height,layers,selectedLayers,hiddenLayers=[]}){
  if(!(width>0&&height>0))throw new Error("図面サイズを取得できません");
  const hidden=new Set(hiddenLayers);
  const classified=classifyLayers(layers,items,hidden);
  let selected=selectedLayers?.length?new Set(selectedLayers):classified.parent;
  let allNames=selectedLayers?.length?new Set([...selected,...classified.all]):classified.all;
  if(!allNames.size)throw new Error("壁・図形候補レイヤーを自動判定できませんでした。図面の線分レイヤーを確認してください。");
  const geometryNames=new Set(items.filter(it=>it.layer!=null&&["line","arc","fill"].includes(it.kind)&&!NON_WALL_NAME.test(String(it.layer))).map(it=>it.layer));
  let fallbackUsed=false;
  const supplemental=new Set([...allNames].filter(n=>!selected.has(n)));
  const aspect=width/height;
  const target=Math.max(900,Math.min(1500,Math.round(1100*Math.sqrt(Math.min(1.8,Math.max(.55,aspect))))));
  const nx=Math.max(320,Math.min(1500,Math.round(target*Math.sqrt(aspect))));
  const ny=Math.max(320,Math.min(1500,Math.round(target/Math.sqrt(aspect))));
  const cw=width/nx,ch=height/ny,N=nx*ny;
  let parentTrace=traceItems(items,selected,hidden,width,height,nx,ny,cw,ch);
  let boothClosures=findBoothFrontClosures(items,allNames,hidden);
  let childItems=boothClosures.length?[...items,...boothClosures]:items;
  let childTrace=traceItems(childItems,allNames,hidden,width,height,nx,ny,cw,ch);
  let parentFlood=floodRegions(parentTrace.wall,nx,ny);
  let childFlood=floodRegions(childTrace.wall,nx,ny);
  let parents=chooseRegions(parentFlood.regions,N,.995,nx,ny);
  let children=chooseRegions(childFlood.regions,N,.82,nx,ny);
  // If semantic wall-layer selection misses the building perimeter, retry with
  // every geometric layer except clearly non-architectural annotation/furniture.
  // This fallback is automatic and is used only when the first pass finds no room.
  if(!parents.kept.length&&(selected.size<allNames.size||geometryNames.size>allNames.size)){
    fallbackUsed=true;
    selected=new Set([...allNames,...geometryNames]);
    allNames=new Set([...allNames,...geometryNames]);
    parentTrace=traceItems(items,selected,hidden,width,height,nx,ny,cw,ch);
    boothClosures=findBoothFrontClosures(items,allNames,hidden);
    childItems=boothClosures.length?[...items,...boothClosures]:items;
    childTrace=traceItems(childItems,allNames,hidden,width,height,nx,ny,cw,ch);
    parentFlood=floodRegions(parentTrace.wall,nx,ny);
    // Keep the child topology independent: virtual cubicle-front closures are
    // intentionally present only in childTrace. Reusing parentFlood here silently
    // discarded those closures whenever automatic layer fallback was needed.
    childFlood=floodRegions(childTrace.wall,nx,ny);
    parents=chooseRegions(parentFlood.regions,N,.995);
    children=chooseRegions(childFlood.regions,N);
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
  // Prefer the finer partition for rendering, falling back to parent spaces if no inner walls were found.
  const displayRooms=childRooms.length?childRooms:parentRooms;
  const ids=new Int32Array(N);ids.fill(-1);
  for(let ri=0;ri<displayRooms.length;ri++){
    const r=displayRooms[ri],map=childRooms.length?childTrace.wall:parentTrace.wall;
    const seen=new Uint8Array(N),q=new Int32Array(r.area);let head=0,tail=0;
    q[tail++]=r.seed;seen[r.seed]=1;ids[r.seed]=ri;
    while(head<tail){const z=q[head++],x=z%nx,y=(z/nx)|0;
      for(const n of [x?z-1:-1,x<nx-1?z+1:-1,y?z-nx:-1,y<ny-1?z+nx:-1]){
        if(n>=0&&!seen[n]&&!map[n]){seen[n]=1;ids[n]=ri;q[tail++]=n;}
      }
    }
  }
  return {
    rooms:displayRooms.map((r,i)=>({...r,id:i,drawingAreaCm2:r.area*cw*ch/100})),
    parents:parentRooms.map(p=>({...p,children:p.children.map(c=>c.name)})),
    grid:{ids,nx,ny,cw,ch},
    diagnostics:{selectedLayers:selected.size,supplementalLayers:supplemental.size,autoMode:classified.mode+(fallbackUsed?" → 全図形レイヤー再判定":""),fallbackUsed,parentLayerNames:[...selected],wallLayerNames:[...allNames],parentRegions:parents.inner.length,childRegions:children.inner.length,parentsKept:parentRooms.length,childrenKept:childRooms.length,unassignedChildren,minParentCells:parents.minCells,minChildCells:children.minCells,minChildSpanCells:children.minSpanCells,minParentSpanCells:parents.minSpanCells,usedItems:childTrace.usedItems,usedSegments:childTrace.usedSegments,skippedHidden:childTrace.skippedHidden,skippedDimensionSegments:childTrace.skippedDimensionSegments,bridgedDoorGaps:childTrace.bridgedDoorGaps,virtualBoothClosures:boothClosures.length,endpointCount:childTrace.endpointCount}
  };
}
