// KAKU-owned geometry-only room candidate analysis. Shadow mode only.
import { buildPlanarGraph, segmentsFromEntities } from "./planar-geometry.js";
export function analyzePlanarRoomCandidates({items=[],wallLayerNames=[],hiddenLayers=[]}={}){
 const allowed=new Set((wallLayerNames||[]).map(String)),hidden=new Set((hiddenLayers||[]).map(String));
 const eligible=(items||[]).filter(item=>item&&allowed.has(String(item.layer??""))&&!hidden.has(String(item.layer??""))&&["line","polyline"].includes(String(item.kind||item.type||"").toLowerCase()));
 const segments=segmentsFromEntities(eligible),graph=buildPlanarGraph(segments);
 const areas=graph.faces.map(face=>face.area).filter(Number.isFinite).sort((a,b)=>a-b);
 return {faces:graph.faces,diagnostics:{inputItems:eligible.length,inputSegments:segments.length,intersectionCount:graph.diagnostics.intersectionCount,graphNodes:graph.diagnostics.graphNodes,graphEdges:graph.diagnostics.graphEdges,boundedFaces:graph.diagnostics.boundedFaces,minFaceArea:areas.length?areas[0]:0,maxFaceArea:areas.length?areas[areas.length-1]:0,totalFaceArea:areas.reduce((sum,value)=>sum+value,0)}};
}
