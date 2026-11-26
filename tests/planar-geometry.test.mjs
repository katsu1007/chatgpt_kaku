import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanarGraph, segmentsFromEntities, signedPolygonArea } from "../original/planar-geometry.js";

const line=(x1,y1,x2,y2,sourceId)=>({x1,y1,x2,y2,sourceId});
const rectangle=(x1,y1,x2,y2,prefix="r")=>[
  line(x1,y1,x2,y1,prefix+"-b"),line(x2,y1,x2,y2,prefix+"-r"),
  line(x2,y2,x1,y2,prefix+"-t"),line(x1,y2,x1,y1,prefix+"-l")
];

test("closed rectangular boundary produces one bounded face with correct area",()=>{
  const graph=buildPlanarGraph(rectangle(0,0,100,80));
  assert.equal(graph.faces.length,1);
  assert.equal(graph.faces[0].area,8000);
  assert.equal(graph.diagnostics.graphEdges,4);
});

test("a partition connected to the boundary splits one rectangle into two faces",()=>{
  const graph=buildPlanarGraph([
    ...rectangle(0,0,100,100),
    line(50,0,50,100,"partition")
  ]);
  assert.equal(graph.faces.length,2);
  assert.deepEqual(graph.faces.map(f=>f.area).sort((a,b)=>a-b),[5000,5000]);
});

test("crossing segments are split at their exact intersection",()=>{
  const graph=buildPlanarGraph([line(0,0,100,100,"a"),line(0,100,100,0,"b")]);
  assert.equal(graph.diagnostics.intersectionCount,1);
  assert.equal(graph.diagnostics.graphNodes,5);
  assert.equal(graph.diagnostics.graphEdges,4);
  assert.equal(graph.faces.length,0);
});

test("overlapping collinear segments are split and represented by unique graph edges",()=>{
  const graph=buildPlanarGraph([line(0,0,100,0,"a"),line(40,0,140,0,"b")]);
  assert.equal(graph.diagnostics.graphEdges,3);
  const shared=graph.edges.find(e=>e.sourceIds.length===2);
  assert.ok(shared);
});

test("duplicate and reversed segments do not create duplicate graph edges",()=>{
  const graph=buildPlanarGraph([
    line(0,0,100,0,"a"),line(100,0,0,0,"b"),line(0,0,100,0,"c")
  ]);
  assert.equal(graph.edges.length,1);
  assert.deepEqual(graph.edges[0].sourceIds.sort(),["a","b","c"]);
});

test("snap tolerance joins near-coincident endpoints into a closed face",()=>{
  const graph=buildPlanarGraph([
    line(0,0,100,0),line(100.4,0,100,100),
    line(100,100,0,100),line(0,100,0,0)
  ],{snapTolerance:1});
  assert.equal(graph.faces.length,1);
});

test("zero-length and invalid segments are discarded with diagnostics",()=>{
  const graph=buildPlanarGraph([
    line(0,0,0,0),line(0,0,10,0),{x1:NaN,y1:0,x2:1,y2:1}
  ]);
  assert.equal(graph.diagnostics.validSegments,1);
  assert.equal(graph.diagnostics.discardedDegenerate,2);
});

test("polyline entities are decomposed into source-linked segments",()=>{
  const segments=segmentsFromEntities([
    {kind:"polyline",id:"wall-1",pts:[0,0,10,0,10,10]},
    {kind:"text",id:"label",pts:[1,1,2,2]}
  ]);
  assert.equal(segments.length,2);
  assert.ok(segments.every(s=>s.sourceId==="wall-1"));
});

test("signed polygon area preserves orientation",()=>{
  assert.equal(signedPolygonArea([[0,0],[10,0],[10,10],[0,10]]),100);
  assert.equal(signedPolygonArea([[0,0],[0,10],[10,10],[10,0]]),-100);
});

test("segments retain source layer kind semantic role scale and segment index",()=>{
  const segments=segmentsFromEntities([{
    kind:"polyline",id:"wall-A",layer:"0-1 平面図 / 躯体",
    semantic:{role:"wall-boundary",layerScaleDenominator:50},
    pts:[0,0,100,0,100,80]
  }]);
  assert.equal(segments.length,2);
  assert.deepEqual(segments.map(s=>s.sourceLayer),["0-1 平面図 / 躯体","0-1 平面図 / 躯体"]);
  assert.deepEqual(segments.map(s=>s.semanticRole),["wall-boundary","wall-boundary"]);
  assert.deepEqual(segments.map(s=>s.layerScaleDenominator),[50,50]);
  assert.deepEqual(segments.map(s=>s.sourceSegmentIndex),[0,1]);
});

test("bounded faces expose source provenance for every contributing boundary edge",()=>{
  const segments=[
    ...rectangle(0,0,100,80,"outer").map((s,i)=>({...s,sourceLayer:"0-1 平面図 / 躯体",sourceKind:"sen",semanticRole:"wall",layerScaleDenominator:50,sourceSegmentIndex:i})),
  ];
  const graph=buildPlanarGraph(segments);
  assert.equal(graph.faces.length,1);
  assert.equal(graph.faces[0].sourceRecords.length,4);
  assert.ok(graph.faces[0].sourceRecords.every(s=>s.layer==="0-1 平面図 / 躯体"&&s.kind==="sen"&&s.layerScaleDenominator===50));
});


test("closed polyline entities add their missing closing edge",()=>{
 const segs=segmentsFromEntities([{kind:"polyline",id:"ring",closed:true,pts:[0,0,100,0,100,100,0,100]}]);
 assert.equal(segs.length,4);
 assert.deepEqual([segs.at(-1).x1,segs.at(-1).y1,segs.at(-1).x2,segs.at(-1).y2],[0,100,0,0]);
 const graph=buildPlanarGraph(segs);
 assert.equal(graph.faces.length,1);
});
test("arcs and circles are tessellated into source-linked planar segments",()=>{
 const arc=segmentsFromEntities([{kind:"arc",id:"arc1",cx:0,cy:0,r:100,a0:0,a1:Math.PI}]);
 const circle=segmentsFromEntities([{kind:"circle",id:"circle1",cx:0,cy:0,r:100}]);
 assert.ok(arc.length>=18);
 assert.ok(circle.length>=36);
 assert.ok(circle.every(s=>s.sourceId==="circle1"));
 assert.equal(buildPlanarGraph(circle).faces.length,1);
});

test("bulged polylines create curved planar edges rather than straight chords",()=>{
 const segs=segmentsFromEntities([{kind:"polyline",id:"arc-wall",pts:[100,0,0,100],bulges:[Math.tan(Math.PI/8),0]}]);
 assert.ok(segs.length>3);
 assert.ok(segs.every(s=>s.sourceId==="arc-wall"));
 assert.ok(segs.some(s=>s.sourceSegmentIndex>0));
});
test("ellipse and rational spline entities produce closed planar faces",()=>{
 const ellipse=segmentsFromEntities([{kind:"ellipse",id:"ell",center:[0,0,0],majorAxis:[100,0,0],axisRatio:0.5,startParameter:0,endParameter:Math.PI*2}]);
 assert.ok(ellipse.length>=70);
 assert.equal(buildPlanarGraph(ellipse).faces.length,1);
 const spline=segmentsFromEntities([{kind:"spline",id:"spline",degree:2,knots:[0,0,0,0.5,1,1,1],controlPoints:[[0,0],[50,0],[50,50],[0,50]],closed:true}]);
 assert.ok(spline.length>=24);
 assert.ok(spline.every(s=>s.sourceId==="spline"));
});

test("decoded DWG circle and arc use center arrays and radius fields",()=>{
 const circle=segmentsFromEntities([{kind:"circle",id:"c",center:[10,20,0],radius:5}]);
 const arc=segmentsFromEntities([{kind:"arc",id:"a",center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI}]);
 assert.ok(circle.length>=36);
 assert.ok(arc.length>=18);
 assert.ok(circle.every(s=>s.sourceId==="c"));
});
