// Explicit CAD semantic roles that must not create room boundaries.
const NON_BOUNDARY_ROLE_PREFIXES=[
 "furniture","fixture","equipment","symbol","annotation","dimension","text",
 "lighting","electrical","plumbing","floor","floor-fill","door-leaf","door-swing",
 "hatch-pattern","centerline","centreline","grid","leader","fastener"
];
function rolesOf(item){
 return [item?.semanticRole,item?.semantic?.role,item?.role,item?.sourceGeometry?.semanticRole,item?.sourceGeometry?.semantic?.role,item?.sourceType]
  .filter(value=>value!=null).map(value=>String(value).trim().toLowerCase().replace(/[\s_]+/g,"-"))
  .filter(role=>role&&role!=="unclassified"&&role!=="unknown");
}
export function isNonBoundarySemanticItem(item){
 return rolesOf(item).some(role=>NON_BOUNDARY_ROLE_PREFIXES.some(prefix=>role===prefix||role.startsWith(prefix+".")||role.startsWith(prefix+"-")));
}
