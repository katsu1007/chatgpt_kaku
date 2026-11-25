// KAKU independent CAD document model (v0.1).
// This module deliberately preserves source data and does not infer wall/room roles.
// Coordinates are sheet coordinates in millimetres unless a caller declares otherwise.

const KIND_MAP = new Map([
  ["line", "line"], ["sen", "line"], ["polyline", "polyline"],
  ["arc", "arc"], ["enko", "arc"], ["circle", "circle"],
  ["fill", "fill"], ["solid", "fill"], ["hatch", "hatch"],
  ["text", "text"], ["moji", "text"], ["dimension", "dimension"],
  ["sunpou", "dimension"], ["block", "block"], ["insert", "block"],
  ["point", "point"]
]);

const finite = Number.isFinite;
const clone = value => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = clone(item);
  return out;
};
const first = (...values) => values.find(value => value !== undefined && value !== null);

function normalizeKind(entity) {
  const raw = String(first(entity?.kind, entity?.type, entity?.entityType, "unknown")).toLowerCase();
  return KIND_MAP.get(raw) || raw;
}
function sourceSemantics(source, rawType) {
  const explicitRole = first(source?.semanticRole, source?.semantic?.role, source?.role, null);
  const kind = String(rawType || "").toLowerCase();
  const dimensionFlag = source?.dimensionGraphic === true || source?.dimensionLine === true ||
    source?.dimensionExtension === true || source?.dimensionArrow === true ||
    source?.dimensionBoundary === true || source?.isDimension === true ||
    source?.dimensionEntity === true;
  const role = explicitRole != null ? String(explicitRole) :
    (kind === "dimension" || kind === "sunpou" || dimensionFlag ? "dimension" :
      (kind === "block" || kind === "insert" ? "block-instance" : "unclassified"));
  const layer = first(source?.layer, source?.layerName, source?.base?.layerName, null);
  const match = String(layer ?? "").match(/^\s*([0-9a-f]+)-([0-9a-f]+)(?:\\s|$)/i);
  const groupIndex = first(source?.groupIndex, source?.group, match ? parseInt(match[1], 16) : null);
  const layerIndex = first(source?.layerIndex, match ? parseInt(match[2], 16) : null);
  return {
    role,
    explicit: explicitRole != null || dimensionFlag || kind === "dimension" || kind === "sunpou" || kind === "block" || kind === "insert",
    dimensionGraphic: role === "dimension",
    blockInstance: role === "block-instance",
    groupIndex: Number.isInteger(groupIndex) ? groupIndex : null,
    layerIndex: Number.isInteger(layerIndex) ? layerIndex : null,
    entityIndex: Number.isInteger(source?.sourceIndex) ? source.sourceIndex :
      Number.isInteger(source?.entityIndex) ? source.entityIndex : null
  };
}

function pointPairs(points) {
  if (!Array.isArray(points)) return [];
  if (points.length && typeof points[0] === "object") {
    return points.filter(p => finite(p?.x) && finite(p?.y)).map(p => [p.x, p.y]);
  }
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (finite(points[i]) && finite(points[i + 1])) out.push([points[i], points[i + 1]]);
  }
  return out;
}
function geometryOf(entity, kind) {
  const pts = pointPairs(first(entity?.pts, entity?.points, entity?.vertices));
  if (kind === "line" || kind === "polyline" || kind === "fill" || kind === "hatch") {
    return { points: pts };
  }
  if (kind === "arc" || kind === "circle") {
    const center = first(entity?.center, entity?.centre);
    const cx = first(center?.x, entity?.cx, entity?.x);
    const cy = first(center?.y, entity?.cy, entity?.y);
    return {
      center: finite(cx) && finite(cy) ? { x: cx, y: cy } : null,
      radius: finite(entity?.radius) ? entity.radius : finite(entity?.r) ? entity.r : null,
      startAngle: first(entity?.startAngle, entity?.start, null),
      endAngle: first(entity?.endAngle, entity?.end, null),
      points: pts
    };
  }
  if (kind === "text" || kind === "dimension") {
    return {
      anchor: finite(entity?.x) && finite(entity?.y) ? { x: entity.x, y: entity.y } : null,
      text: typeof entity?.text === "string" ? entity.text : null,
      height: finite(entity?.size) ? entity.size : finite(entity?.height) ? entity.height : null,
      rotation: finite(entity?.rot) ? entity.rot : finite(entity?.rotation) ? entity.rotation : 0
    };
  }
  return { points: pts };
}
function boundsOf(geometry) {
  const points = geometry.points || [];
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  if (geometry.center && finite(geometry.radius) && geometry.radius >= 0) {
    xs.push(geometry.center.x - geometry.radius, geometry.center.x + geometry.radius);
    ys.push(geometry.center.y - geometry.radius, geometry.center.y + geometry.radius);
  }
  if (geometry.anchor) {
    xs.push(geometry.anchor.x); ys.push(geometry.anchor.y);
  }
  if (!xs.length) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Normalize parser output without discarding unknown source fields or guessing semantics. */
export function normalizeCadEntity(entity, index, options = {}) {
  const source = entity && typeof entity === "object" ? entity : {};
  const kind = normalizeKind(source);
  const geometry = geometryOf(source, kind);
  const layer = first(source.layer, source.layerName, source.base?.layerName, null);
  const layerGroup = first(source.layerGroup, source.layer_group, source.base?.layer_group, null);
  const sourceType = first(source.sourceType, source.entityType, source.type, source.kind, "unknown");
  const semantics = sourceSemantics(source, sourceType);
  const handle = first(source.handle, source.id, source.objectId, null);
  const blockPath = Array.isArray(source.blockPath) ? [...source.blockPath] :
    source.blockName != null ? [String(source.blockName)] : [];
  return {
    id: String(first(source.kakuId, handle, options.idPrefix ? options.idPrefix + ":" + index : "entity:" + index)),
    index,
    kind,
    source: {
      format: options.sourceFormat || null,
      type: String(sourceType),
      handle: handle == null ? null : String(handle),
      layer: layer == null ? null : String(layer),
      layerGroup: layerGroup == null ? null : String(layerGroup),
      blockPath,
      sourceIndex: semantics.entityIndex,
      groupIndex: semantics.groupIndex,
      layerIndex: semantics.layerIndex,
      semantics,
      raw: clone(source)
    },
    semantic: semantics,
    geometry,
    bounds: boundsOf(geometry),
    coordinateSpace: options.coordinateSpace || "sheet-mm"
  };
}

/** Build a stable, loss-aware document envelope around parser entities. */
export function createCadDocument(input = {}, options = {}) {
  const entities = Array.isArray(input.entities) ? input.entities :
    Array.isArray(input.items) ? input.items : [];
  const normalized = entities.map((entity, index) => normalizeCadEntity(entity, index, options));
  const ids = new Set();
  const duplicateIds = [];
  for (const entity of normalized) {
    if (ids.has(entity.id)) duplicateIds.push(entity.id);
    ids.add(entity.id);
  }
  const counts = {};
  const layers = new Map();
  let missingGeometry = 0;
  const semanticCounts = {};
  for (const entity of normalized) {
    counts[entity.kind] = (counts[entity.kind] || 0) + 1;
    const role = entity.semantic?.role || "unclassified";
    semanticCounts[role] = (semanticCounts[role] || 0) + 1;
    if (!entity.bounds) missingGeometry++;
    const name = entity.source.layer ?? "(レイヤーなし)";
    layers.set(name, (layers.get(name) || 0) + 1);
  }
  const size = input.size || input.sheet?.size || {};
  return {
    schema: "kaku.cad-document",
    schemaVersion: 1,
    source: {
      format: options.sourceFormat || input.format || input.meta?.format || null,
      version: input.version || input.meta?.info?.version || null,
      coordinateSpace: options.coordinateSpace || "sheet-mm",
      units: options.units || "mm"
    },
    sheets: [{
      id: "sheet:0",
      name: input.name || input.sheet?.name || "Sheet 1",
      width: finite(size.w) ? size.w : finite(size.width) ? size.width : null,
      height: finite(size.h) ? size.h : finite(size.height) ? size.height : null,
      entities: normalized
    }],
    diagnostics: {
      entityCount: normalized.length,
      kindCounts: counts,
      layerCounts: Object.fromEntries([...layers.entries()].sort((a,b) => a[0].localeCompare(b[0]))),
      semanticCounts,
      dimensionGraphics: semanticCounts.dimension || 0,
      blockInstances: semanticCounts["block-instance"] || 0,
      missingGeometry,
      duplicateIds,
      unknownKinds: [...new Set(normalized.filter(e => !KIND_MAP.has(String(e.source.type).toLowerCase())).map(e => e.kind))]
    }
  };
}

/** Apply a 2D affine transform [a,b,c,d,e,f] to a point. */
export function transformCadPoint(point, matrix) {
  if (!Array.isArray(point) || point.length < 2 || !matrix || matrix.length !== 6 ||
      !point.slice(0,2).every(finite) || !matrix.every(finite)) {
    throw new TypeError("有効な座標と6要素の変換行列が必要です");
  }
  const [a,b,c,d,e,f] = matrix;
  return [a * point[0] + c * point[1] + e, b * point[0] + d * point[1] + f];
}
