// Explicit CAD semantic roles that must not create room boundaries.
const NON_BOUNDARY_ROLE_PREFIXES=[
 "furniture","fixture","equipment","symbol","annotation","dimension","text",
 "lighting","electrical","plumbing","floor","floor-fill","door-leaf","door-swing",
 "hatch-pattern","centerline","centreline","grid","leader","fastener","block-instance"
];
function rolesOf(item){
 return [item?.semanticRole,item?.semantic?.role,item?.role,item?.sourceGeometry?.semanticRole,item?.sourceGeometry?.semantic?.role,item?.sourceType,item?.blockInstance===true?"block-instance":null]
  .filter(value=>value!=null).map(value=>String(value).trim().toLowerCase().replace(/[\s_]+/g,"-"))
  .filter(role=>role&&role!=="unclassified"&&role!=="unknown");
}
const NON_BOUNDARY_SOURCE_LAYER=/(家具|什器|設備|機器|器具|便器|衛生器具|照明|電気|コンセント|記号|注記|注釈|寸法|文字|建具|サッシ|開口|仕上|ハッチ|furniture|fixture|equipment|lighting|electrical|plumbing|dimension|annotation|symbol|hatch)/i;
export function isNonBoundarySemanticItem(item,{allowBlockInstance=false}={}){
 const nativeLayer=String(item?.sourceNativeLayer??item?.source?.nativeLayer??"");
 const roles=rolesOf(item);
 // An explicitly classified wall/partition wins over generic block ancestry.
 // Otherwise symbol blocks must not become room boundaries just because their
 // expanded contents happen to contain closed geometry.
 if(roles.some(role=>["wall","partition","boundary","structural"].includes(role)))return false;
 // The source-native layer belongs to the child entity; unlike the displayed
 // INSERT layer, it can identify furniture/fixtures flattened onto a wall layer.
 if(nativeLayer&&NON_BOUNDARY_SOURCE_LAYER.test(nativeLayer))return true;
 // When a flattened block child has lost its own layer, the visible layer may
 // be only the INSERT layer. Do not trust that display-layer label as proof of
 // a wall boundary. Explicit wall roles and named architectural wall blocks
 // remain eligible through the checks above / allowBlockInstance.
 const layerProvenance=String(item?.sourceLayerProvenance??item?.source?.layerProvenance??"");
 if(layerProvenance==="child-layer-unavailable"&&!allowBlockInstance)return true;
 const checkedRoles=allowBlockInstance?roles.filter(role=>!(role==="block-instance"||role.startsWith("block-instance.")||role.startsWith("block-instance-"))):roles;
 return checkedRoles.some(role=>NON_BOUNDARY_ROLE_PREFIXES.some(prefix=>role===prefix||role.startsWith(prefix+".")||role.startsWith(prefix+"-")));
}
