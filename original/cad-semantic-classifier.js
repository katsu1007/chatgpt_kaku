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
export function isNonBoundarySemanticItem(item){
 const roles=rolesOf(item);
 // An explicitly classified wall/partition wins over generic block ancestry.
 // Otherwise symbol blocks must not become room boundaries just because their
 // expanded contents happen to contain closed geometry.
 if(roles.some(role=>["wall","partition","boundary","structural"].includes(role)))return false;
 return roles.some(role=>NON_BOUNDARY_ROLE_PREFIXES.some(prefix=>role===prefix||role.startsWith(prefix+".")||role.startsWith(prefix+"-")));
}
