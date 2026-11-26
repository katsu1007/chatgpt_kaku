// Explicit CAD semantic roles that must not create room boundaries.
const NON_BOUNDARY_ROLE_PREFIXES=[
 "furniture","fixture","equipment","symbol","annotation","dimension","text",
 "lighting","electrical","plumbing","floor","floor-fill","door-leaf","door-swing",
 "hatch-pattern","centerline","centreline","grid","leader","fastener"
];
function roleOf(item){
 const raw=item?.semanticRole??item?.semantic?.role??item?.role??item?.sourceType??item?.sourceGeometry?.semanticRole??item?.sourceGeometry?.semantic?.role??"";
 return String(raw).trim().toLowerCase().replace(/[\s_]+/g,"-");
}
export function isNonBoundarySemanticItem(item){
 const role=roleOf(item);
 if(!role||role==="unclassified"||role==="unknown"||role==="wall"||role==="partition"||role==="boundary"||role==="structural")return false;
 return NON_BOUNDARY_ROLE_PREFIXES.some(prefix=>role===prefix||role.startsWith(prefix+".")||role.startsWith(prefix+"-"));
}
