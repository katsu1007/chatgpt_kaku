// KAKU ORIGIN room extraction engine
// Grid-space topology engine. Coordinates are sheet mm; thresholds are relative to grid,
// never interpreted as real-world m² without scale conversion.
const OUTER_WALL_NAME=/(外壁|躯体|外周|建物外形|外形壁|exterior|outer.?wall)/i;
const WALL_NAME=/(壁|間仕切|躯体|外壁|内壁|壁芯|wall|partition)/i;
const NON_WALL_NAME=/(寸法|寸法線|文字|注記|家具|什器|設備|器具|照明|電気|コンセント|記号|ハッチ|引出線|寸法補助|dimension|furniture|fixture|text|symbol)/i;
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
function traceItems(items, names, hidden, W, H, nx, ny, cw, ch) {
  const wall=new Uint8Array(nx*ny); let usedItems=0,usedSegments=0,skippedHidden=0; const endpoints=[];
  const mark=(x,y)=>{
    const ix=Math.round(x/cw),iy=Math.round(y/ch);
    // 8-neighbour raster stroke reduces diagonal leaks.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=ix+dx,yy=iy+dy;
      if(xx>=0&&xx<nx&&yy>=0&&yy<ny)wall[yy*nx+xx]=1;
    }
  };
  const line=(x1,y1,x2,y2)=>{
    if(![x1,y1,x2,y2].every(Number.isFinite))return;
    const steps=Math.max(1,Math.ceil(Math.hypot((x2-x1)/cw,(y2-y1)/ch)*2));
    for(let k=0;k<=steps;k++){const t=k/steps;mark(x1+(x2-x1)*t,y1+(y2-y1)*t);}
    usedSegments++;
  };
  const rememberEndpoint=(x,y)=>{if(Number.isFinite(x)&&Number.isFinite(y))endpoints.push([Math.round(x/cw),Math.round(y/ch)]);};
  for(const it of items){
    if(!names.has(it.layer))continue;
    if(hidden.has(it.layer)){skippedHidden++;continue;}
    if(it.kind==="line"&&Array.isArray(it.pts)&&it.pts.length>=4){
      usedItems++;rememberEndpoint(it.pts[0],it.pts[1]);rememberEndpoint(it.pts[it.pts.length-2],it.pts[it.pts.length-1]);for(let k=0;k+3<it.pts.length;k+=2)line(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);
    }else if(it.kind==="arc"&&Number.isFinite(it.r)&&it.r>0){
      usedItems++;const sweep=it.a1-it.a0,n=Math.max(16,Math.ceil(Math.abs(sweep)*it.r/Math.min(cw,ch)*2));
      let px=it.cx+it.r*Math.cos(it.a0),py=it.cy+it.r*Math.sin(it.a0);rememberEndpoint(px,py);rememberEndpoint(it.cx+it.r*Math.cos(it.a1),it.cy+it.r*Math.sin(it.a1));
      for(let k=1;k<=n;k++){const a=it.a0+sweep*k/n,x=it.cx+it.r*Math.cos(a),y=it.cy+it.r*Math.sin(a);line(px,py,x,y);px=x;py=y;}
    }else if(it.kind==="fill"&&Array.isArray(it.pts)&&it.pts.length>=6){
      usedItems++;for(let k=0;k+3<it.pts.length;k+=2)line(it.pts[k],it.pts[k+1],it.pts[k+2],it.pts[k+3]);
      line(it.pts[it.pts.length-2],it.pts[it.pts.length-1],it.pts[0],it.pts[1]);
    }
  }
  // Heal only tiny drafting gaps between distinct line endpoints. Tolerance is
  // raster-relative (1.6 cells), so normal door openings remain open.
  const bins=new Map(),tol=1.6,tol2=tol*tol;
  for(const [x,y] of endpoints){
    const bx=Math.floor(x/2),by=Math.floor(y/2);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const bucket=bins.get((bx+ox)+":"+ (by+oy));if(!bucket)continue;
      for(const [px,py] of bucket){const dx=x-px,dy=y-py,d2=dx*dx+dy*dy;if(d2>0.01&&d2<=tol2){
        const steps=Math.max(1,Math.ceil(Math.sqrt(d2)*2));
        for(let k=0;k<=steps;k++){const t=k/steps,xx=Math.round(px+dx*t),yy=Math.round(py+dy*t);if(xx>=0&&xx<nx&&yy>=0&&yy<ny)wall[yy*nx+xx]=1;}
      }}
    }
    const key=bx+":"+by;if(!bins.has(key))bins.set(key,[]);bins.get(key).push([x,y]);
  }
  return {wall,usedItems,usedSegments,skippedHidden,endpointCount:endpoints.length};
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
function chooseRegions(regions,N){
  const inner=regions.filter(r=>!r.touchesEdge).sort((a,b)=>b.area-a.area);
  const largest=inner[0]?.area||0,minCells=Math.max(12,Math.floor(largest*.0008));
  return {inner,minCells,kept:inner.filter(r=>r.area>=minCells&&r.area<=N*.8).slice(0,160)};
}
export function extractRoomHierarchy({items,width,height,layers,selectedLayers,hiddenLayers=[]}){
  if(!(width>0&&height>0))throw new Error("図面サイズを取得できません");
  const hidden=new Set(hiddenLayers);
  const classified=classifyLayers(layers,items,hidden);
  const selected=selectedLayers?.length?new Set(selectedLayers):classified.parent;
  const allNames=selectedLayers?.length?new Set([...selected,...classified.all]):classified.all;
  if(!allNames.size)throw new Error("壁・図形候補レイヤーを自動判定できませんでした。図面の線分レイヤーを確認してください。");
  const supplemental=new Set([...allNames].filter(n=>!selected.has(n)));
  const aspect=width/height;
  const target=Math.max(900,Math.min(1500,Math.round(1100*Math.sqrt(Math.min(1.8,Math.max(.55,aspect))))));
  const nx=Math.max(320,Math.min(1500,Math.round(target*Math.sqrt(aspect))));
  const ny=Math.max(320,Math.min(1500,Math.round(target/Math.sqrt(aspect))));
  const cw=width/nx,ch=height/ny,N=nx*ny;
  const parentTrace=traceItems(items,selected,hidden,width,height,nx,ny,cw,ch);
  const childTrace=traceItems(items,allNames,hidden,width,height,nx,ny,cw,ch);
  const parentFlood=floodRegions(parentTrace.wall,nx,ny);
  const childFlood=floodRegions(childTrace.wall,nx,ny);
  const parents=chooseRegions(parentFlood.regions,N);
  const children=chooseRegions(childFlood.regions,N);
  const parentRooms=parents.kept.map((r,i)=>({...r,name:"大部屋 "+(i+1),level:1,children:[]}));
  const parentByRegion=new Map(parentRooms.map(p=>[p.id,p]));
  const childRooms=[];let unassignedChildren=0;
  for(const child of children.kept){
    // Resolve ownership by the exact parent flood-fill component at this child's seed,
    // not by overlapping bounding boxes.
    const parentRegionId=parentFlood.regionAt[child.seed];
    const parent=parentByRegion.get(parentRegionId);
    if(!parent){unassignedChildren++;continue;}
    // Avoid duplicating an unchanged parent as its own child.
    if(child.area>=parent.area*.985)continue;
    const room={...child,name:parent.name+"-"+(parent.children.length+1),level:2,parentId:parent.id,parentName:parent.name,children:[]};
    parent.children.push(room);childRooms.push(room);
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
    diagnostics:{selectedLayers:selected.size,supplementalLayers:supplemental.size,autoMode:classified.mode,parentLayerNames:[...selected],wallLayerNames:[...allNames],parentRegions:parents.inner.length,childRegions:children.inner.length,parentsKept:parentRooms.length,childrenKept:childRooms.length,unassignedChildren,minParentCells:parents.minCells,minChildCells:children.minCells,usedItems:childTrace.usedItems,usedSegments:childTrace.usedSegments,skippedHidden:childTrace.skippedHidden,endpointCount:childTrace.endpointCount}
  };
}
