// KAKU independent planar geometry engine (v0.1).
// Pure geometry only: this module never decides whether a line is a wall or a room boundary.

const finite = Number.isFinite;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const clamp01 = t => Math.max(0, Math.min(1, t));

function segmentRecord(value, index) {
  const x1 = Number(value?.x1), y1 = Number(value?.y1);
  const x2 = Number(value?.x2), y2 = Number(value?.y2);
  if (![x1,y1,x2,y2].every(finite)) return null;
  if (Math.hypot(x2-x1,y2-y1) <= 1e-10) return null;
  return {
    x1,y1,x2,y2,
    sourceId: value.sourceId ?? value.id ?? "segment:"+index,
    sourceLayer: value.sourceLayer ?? value.layer ?? null,
    sourceKind: value.sourceKind ?? value.kind ?? value.type ?? null,
    semanticRole: value.semanticRole ?? value.semantic?.role ?? null,
    layerScaleDenominator: finite(value.layerScaleDenominator) && value.layerScaleDenominator > 0 ? value.layerScaleDenominator : null,
    sourceSegmentIndex: Number.isInteger(value.sourceSegmentIndex) ? value.sourceSegmentIndex : null
  };
}

export function segmentsFromEntities(entities = []) {
  const out = [];
  for (let i=0;i<entities.length;i++) {
    const entity=entities[i];
    if (!entity || !["line","polyline"].includes(String(entity.kind||entity.type||"").toLowerCase())) continue;
    const pts=entity.pts||entity.points||entity.vertices;
    if (!Array.isArray(pts)) continue;
    const pairs=pts.length&&typeof pts[0]==="object"
      ?pts.filter(p=>finite(p?.x)&&finite(p?.y)).map(p=>[p.x,p.y])
      :Array.from({length:Math.floor(pts.length/2)},(_,j)=>[pts[j*2],pts[j*2+1]]).filter(p=>p.every(finite));
    for(let j=0;j+1<pairs.length;j++) out.push({
      x1:pairs[j][0],y1:pairs[j][1],x2:pairs[j+1][0],y2:pairs[j+1][1],
      sourceId:entity.handle??entity.id??"entity:"+i
    });
  }
  return out;
}

function paramOnSegment(x,y,s) {
  const dx=s.x2-s.x1,dy=s.y2-s.y1;
  return Math.abs(dx)>=Math.abs(dy)?(x-s.x1)/dx:(y-s.y1)/dy;
}
function pointOnSegment(x,y,s,eps) {
  const dx=s.x2-s.x1,dy=s.y2-s.y1;
  const px=x-s.x1,py=y-s.y1;
  if(Math.abs(cross(dx,dy,px,py))>eps*Math.max(1,Math.hypot(dx,dy))) return false;
  const t=paramOnSegment(x,y,s);
  return t>=-eps&&t<=1+eps;
}
function pairIntersections(a,b,eps) {
  const rx=a.x2-a.x1,ry=a.y2-a.y1,sx=b.x2-b.x1,sy=b.y2-b.y1;
  const qx=b.x1-a.x1,qy=b.y1-a.y1;
  const rxs=cross(rx,ry,sx,sy),qpxr=cross(qx,qy,rx,ry);
  if(Math.abs(rxs)<=eps) {
    if(Math.abs(qpxr)>eps*Math.max(1,Math.hypot(rx,ry))) return [];
    const found=[];
    for(const [x,y] of [[a.x1,a.y1],[a.x2,a.y2],[b.x1,b.y1],[b.x2,b.y2]]) {
      if(pointOnSegment(x,y,a,eps)&&pointOnSegment(x,y,b,eps)) {
        const ta=clamp01(paramOnSegment(x,y,a)),tb=clamp01(paramOnSegment(x,y,b));
        if(!found.some(p=>Math.abs(p.ta-ta)<=eps&&Math.abs(p.tb-tb)<=eps))found.push({x,y,ta,tb});
      }
    }
    return found;
  }
  const t=cross(qx,qy,sx,sy)/rxs,u=cross(qx,qy,rx,ry)/rxs;
  if(t < -eps || t > 1+eps || u < -eps || u > 1+eps) return [];
  const ta=clamp01(t),tb=clamp01(u);
  return [{x:a.x1+ta*rx,y:a.y1+ta*ry,ta,tb}];
}
function polygonArea(points) {
  let sum=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    sum+=a.x*b.y-b.x*a.y;
  }
  return sum/2;
}

/** Split intersections and construct a planar half-edge graph with bounded faces. */
export function buildPlanarGraph(inputSegments = [], options = {}) {
  const eps=finite(options.intersectionTolerance)?Math.max(1e-12,options.intersectionTolerance):1e-9;
  const snap=finite(options.snapTolerance)?Math.max(0,options.snapTolerance):0;
  const raw=inputSegments.map(segmentRecord).filter(Boolean);
  const cuts=raw.map(()=>[0,1]);
  const sorted=raw.map((s,i)=>({i,minX:Math.min(s.x1,s.x2),maxX:Math.max(s.x1,s.x2),minY:Math.min(s.y1,s.y2),maxY:Math.max(s.y1,s.y2)}))
    .sort((a,b)=>a.minX-b.minX||a.minY-b.minY);
  let candidatePairs=0,intersectionCount=0;
  const active=[];
  for(const current of sorted){
    for(let k=active.length-1;k>=0;k--)if(active[k].maxX<current.minX-eps)active.splice(k,1);
    for(const other of active){
      if(other.maxY<current.minY-eps||current.maxY<other.minY-eps)continue;
      candidatePairs++;
      const hits=pairIntersections(raw[current.i],raw[other.i],eps);
      if(hits.length){
        intersectionCount+=hits.length;
        for(const hit of hits){cuts[current.i].push(hit.ta);cuts[other.i].push(hit.tb);}
      }
    }
    active.push(current);
  }

  const nodeMap=new Map(),nodes=[],edgeMap=new Map();
  const coordinateKey=(x,y)=>{
    if(snap>0)return Math.round(x/snap)+","+Math.round(y/snap);
    const q=1/Math.max(eps,1e-10);
    return Math.round(x*q)+","+Math.round(y*q);
  };
  const getNode=(x,y)=>{
    const key=coordinateKey(x,y);
    let node=nodeMap.get(key);
    if(!node){node={id:nodes.length,x,y,outgoing:[]};nodes.push(node);nodeMap.set(key,node);}
    return node;
  };
  let splitCount=0;
  for(let i=0;i<raw.length;i++){
    const s=raw[i],ts=cuts[i].sort((a,b)=>a-b),unique=[];
    for(const t of ts)if(!unique.length||Math.abs(t-unique[unique.length-1])>eps)unique.push(t);
    if(unique.length>2)splitCount+=unique.length-2;
    for(let j=0;j+1<unique.length;j++){
      const t0=unique[j],t1=unique[j+1];if(t1-t0<=eps)continue;
      const dx=s.x2-s.x1,dy=s.y2-s.y1;
      const a=getNode(s.x1+t0*dx,s.y1+t0*dy),b=getNode(s.x1+t1*dx,s.y1+t1*dy);
      if(a.id===b.id)continue;
      const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),key=lo+":"+hi;
      let edge=edgeMap.get(key);
      if(!edge){edge={id:edgeMap.size,a:lo,b:hi,sourceIds:[],sourceRecords:[]};edgeMap.set(key,edge);}
      if(!edge.sourceIds.includes(String(s.sourceId)))edge.sourceIds.push(String(s.sourceId));
      const record={sourceId:String(s.sourceId),layer:s.sourceLayer,kind:s.sourceKind,semanticRole:s.semanticRole,layerScaleDenominator:s.layerScaleDenominator,segmentIndex:s.sourceSegmentIndex};
      const recordKey=JSON.stringify(record);
      if(!edge.sourceRecords.some(item=>JSON.stringify(item)===recordKey))edge.sourceRecords.push(record);
    }
  }

  const halfEdges=[];
  for(const edge of edgeMap.values()){
    const a=nodes[edge.a],b=nodes[edge.b],h=halfEdges.length;
    const forward={id:h,from:a.id,to:b.id,twin:h+1,next:-1,edgeId:edge.id};
    const reverse={id:h+1,from:b.id,to:a.id,twin:h,next:-1,edgeId:edge.id};
    halfEdges.push(forward,reverse);a.outgoing.push(forward.id);b.outgoing.push(reverse.id);
  }
  for(const node of nodes){
    node.outgoing.sort((ia,ib)=>{
      const a=halfEdges[ia],b=halfEdges[ib],pa=nodes[a.to],pb=nodes[b.to];
      return Math.atan2(pa.y-node.y,pa.x-node.x)-Math.atan2(pb.y-node.y,pb.x-node.x);
    });
  }
  for(const h of halfEdges){
    const at=nodes[h.to],reverseIndex=at.outgoing.indexOf(h.twin);
    if(reverseIndex<0||!at.outgoing.length)continue;
    h.next=at.outgoing[(reverseIndex-1+at.outgoing.length)%at.outgoing.length];
  }
  const visited=new Uint8Array(halfEdges.length),faces=[];
  for(const start of halfEdges){
    if(visited[start.id]||start.next<0)continue;
    const ring=[],edgeIds=[];let current=start.id,guard=0;
    while(!visited[current]&&guard++<=halfEdges.length+1){
      visited[current]=1;
      const h=halfEdges[current];ring.push(nodes[h.from]);edgeIds.push(h.edgeId);current=h.next;
      if(current===start.id)break;
      if(current<0)break;
    }
    if(current!==start.id||ring.length<3)continue;
    const area=polygonArea(ring);
    if(area>eps)const uniqueEdgeIds=[...new Set(edgeIds)];
    const sourceRecords=new Map();
    for(const edgeId of uniqueEdgeIds)for(const record of edgeMap.get([...edgeMap.keys()][edgeId])?.sourceRecords||[])sourceRecords.set(JSON.stringify(record),record);
    faces.push({id:faces.length,area,points:ring.map(p=>({x:p.x,y:p.y})),edgeIds:uniqueEdgeIds,sourceRecords:[...sourceRecords.values()]});
  }
  return {
    nodes:nodes.map(({id,x,y})=>({id,x,y})),
    edges:[...edgeMap.values()],
    faces,
    diagnostics:{
      inputSegments:inputSegments.length,validSegments:raw.length,
      candidatePairs,intersectionCount,splitSegments:splitCount,
      graphNodes:nodes.length,graphEdges:edgeMap.size,boundedFaces:faces.length,
      discardedDegenerate:inputSegments.length-raw.length
    }
  };
}

export function signedPolygonArea(points) {
  if(!Array.isArray(points)||points.length<3)return 0;
  return polygonArea(points.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p));
}
