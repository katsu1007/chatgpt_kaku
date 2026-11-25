// KAKU-owned recursive INSERT/MINSERT expansion for R2004 drawings.
import { createInsertTransform, createMInsertTransforms, transformBlockGeometry } from "./dwg-block-transform.js?v=20261125-text1";
function p3(value){return Array.isArray(value)?{x:value[0],y:value[1],z:value[2]||0}:value;}
function geometryForTransform(geometry){
 if(geometry?.kind==="line"&&Array.isArray(geometry.pts)&&geometry.pts[0]&&typeof geometry.pts[0]==="object")return {...geometry,pts:geometry.pts.flatMap(p=>[p.x,p.y])};
 if(geometry?.kind==="point"&&geometry.point)return {...geometry,x:geometry.point.x,y:geometry.point.y,z:geometry.point.z};
 if(geometry?.kind==="mtext")return {...geometry,insertion:p3(geometry.insertion),xAxis:p3(geometry.xAxis)};
 return geometry;
}
function insertTransformData(entity){
 const g=entity.geometry||{};
 return {...g,insertionPoint:p3(g.insertionPoint),scale:g.scale||{x:1,y:1,z:1}};
}
export function expandR2004BlockReferences(entities,blocks,{maxDepth=12,maxInstances=10000,maxExpandedEntities=200000}={}){
 const source=entities||[],blockList=blocks||[],byHandle=new Map(source.map(entity=>[BigInt(entity.selfHandle).toString(),entity]));
 const blocksByHandle=new Map(blockList.map(block=>[BigInt(block.handle).toString(),block]));
 const modelSpace=blockList.find(block=>String(block.name).toLowerCase()==="*model_space");
 const diagnostics={expanded:false,modelSpaceFound:!!modelSpace,topLevelEntityCount:0,insertCount:0,expandedInstanceCount:0,expandedEntityCount:0,
  unresolvedBlockReferences:0,skippedXrefs:0,skippedCycles:0,skippedDepth:0,skippedGeometry:0,skippedMissingChildren:0,limitReached:false};
 if(!modelSpace||!modelSpace.ownedHandles?.length)return {entities:source,diagnostics:{...diagnostics,reason:!modelSpace?"Model space BLOCK_HEADER not found":"Model space has no owned handles"}};
 const output=[],append=(entity)=>{if(output.length>=maxExpandedEntities){diagnostics.limitReached=true;return false;}output.push(entity);return true;};
 function expandInsert(insert,parentMatrix,path,stack,depth,rootInsertHandle){
  if(depth>maxDepth){diagnostics.skippedDepth++;return;}
  const ref=insert.insertHandles?.blockHeader?.value;
  const block=ref===undefined?null:blocksByHandle.get(BigInt(ref).toString());
  if(!block){diagnostics.unresolvedBlockReferences++;return;}
  if(block.flags?.isXref||block.flags?.xrefOverlaid){diagnostics.skippedXrefs++;return;}
  const blockKey=BigInt(block.handle).toString();
  if(stack.includes(blockKey)){diagnostics.skippedCycles++;return;}
  const data=insertTransformData(insert),basePoint=p3(block.basePoint);
  let matrices;
  try{
   matrices=insert.geometry.kind==="minsert"
    ?createMInsertTransforms(data,{basePoint,parentMatrix,maxInstances})
    :[createInsertTransform(data,{basePoint,parentMatrix})];
  }catch{diagnostics.skippedGeometry++;return;}
  const nextPath=[...path,block.name],nextStack=[...stack,blockKey];
  for(let instanceIndex=0;instanceIndex<matrices.length;instanceIndex++){
   if(diagnostics.expandedInstanceCount>=maxInstances){diagnostics.limitReached=true;return;}
   diagnostics.expandedInstanceCount++;
   const matrix=matrices[instanceIndex];
   for(const childRef of block.ownedHandles||[]){
    const child=byHandle.get(BigInt(childRef.value).toString());
    if(!child){diagnostics.skippedMissingChildren++;continue;}
    if(child.geometry?.kind==="insert"||child.geometry?.kind==="minsert"){
     diagnostics.insertCount++;
     expandInsert(child,matrix,nextPath,nextStack,depth+1,rootInsertHandle??insert.selfHandle);
     continue;
    }
    let transformed;
    try{transformed=transformBlockGeometry(geometryForTransform(child.geometry),matrix);}catch{diagnostics.skippedGeometry++;continue;}
    if(!transformed||transformed.kind==="unsupported"||transformed.kind==="ellipse"){diagnostics.skippedGeometry++;continue;}
    if(!append({...child,sourceGeometry:child.geometry,geometry:transformed,sourceEntityHandle:child.selfHandle,sourceInsertHandle:rootInsertHandle??insert.selfHandle,
      sourceBlockHandle:block.handle,blockPath:nextPath,blockInstanceIndex:instanceIndex,blockTransform:matrix}))return;
    diagnostics.expandedEntityCount++;
   }
   if(diagnostics.limitReached)return;
  }
 }
 for(const ref of modelSpace.ownedHandles){
  const entity=byHandle.get(BigInt(ref.value).toString());if(!entity)continue;
  diagnostics.topLevelEntityCount++;
  if(entity.geometry?.kind==="insert"||entity.geometry?.kind==="minsert"){
   diagnostics.insertCount++;expandInsert(entity,[1,0,0,1,0,0],[],[],0,entity.selfHandle);
  }else append(entity);
  if(diagnostics.limitReached)break;
 }
 diagnostics.expanded=true;
 return {entities:output,diagnostics};
}
