import { tessellateCadCurve } from "./cad-curve-tessellation.js";
// KAKU independent CAD document model (v0.1).
// This module deliberately preserves source data and does not infer wall/room roles.
// Coordinates are sheet coordinates in millimetres unless a caller declares otherwise.

const KIND_MAP = new Map([
  ["line", "line"], ["sen", "line"], ["polyline", "polyline"],
  ["arc", "arc"], ["enko", "arc"], ["circle", "circle"],
  ["ellipse", "ellipse"], ["spline", "spline"],
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
function sourceSemantics(source, rawType, layerScaleDenominator = null) {
  const explicitRoleValue = first(source?.semanticRole, source?.semantic?.role, source?.role, source?.base?.semanticRole, source?.base?.semantic?.role, source?.base?.role, null);
  const explicitRole = explicitRoleValue != null && !["unclassified","unknown"].includes(String(explicitRoleValue).trim().toLowerCase()) ? explicitRoleValue : null;
  const kind = String(rawType || "").toLowerCase();
  const dimensionType = kind === "dimension" || kind === "sunpou" || /(?:^|\.)cdatasunpou$/i.test(kind);
  const blockType = kind === "block" || kind === "insert" || /(?:^|\.)cdatablock$/i.test(kind);
  const dimensionFlag = source?.dimensionGraphic === true || source?.dimensionLine === true ||
    source?.dimensionExtension === true || source?.dimensionArrow === true ||
    source?.dimensionBoundary === true || source?.isDimension === true ||
    source?.dimensionEntity === true || source?.base?.dimensionGraphic === true ||
    source?.base?.dimensionLine === true || source?.base?.isDimension === true;
  const blockFlag = source?.blockInstance === true ||
    (Array.isArray(source?.blockPath) && source.blockPath.length > 0) ||
    (Array.isArray(source?.base?.blockPath) && source.base.blockPath.length > 0) ||
    source?.sourceInsertHandle != null || source?.sourceBlockHandle != null;
  const role = explicitRole != null ? String(explicitRole) :
    (dimensionType || dimensionFlag ? "dimension" :
      (blockType || blockFlag ? "block-instance" : "unclassified"));
  const layer = first(source?.layer, source?.layerName, source?.base?.layerName, null);
  const match = String(layer ?? "").match(/^\s*([0-9a-f]+)-([0-9a-f]+)(?:\s|$)/i);
  const groupIndex = first(source?.groupIndex, source?.group, match ? parseInt(match[1], 16) : null);
  const layerIndex = first(source?.layerIndex, match ? parseInt(match[2], 16) : null);
  return {
    role,
    explicit: explicitRole != null || dimensionFlag || blockFlag || dimensionType || blockType,
    dimensionGraphic: role === "dimension",
    blockInstance: role === "block-instance",
    groupIndex: Number.isInteger(groupIndex) ? groupIndex : null,
    layerIndex: Number.isInteger(layerIndex) ? layerIndex : null,
    layerScaleDenominator: finite(layerScaleDenominator) && layerScaleDenominator > 0 ? layerScaleDenominator : null,
    entityIndex: Number.isInteger(source?.sourceIndex) ? source.sourceIndex :
      Number.isInteger(source?.entityIndex) ? source.entityIndex :
      Number.isInteger(source?.base?.sourceIndex) ? source.base.sourceIndex :
      Number.isInteger(source?.base?.entityIndex) ? source.base.entityIndex : null
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
    const closed = kind === "polyline" && (entity?.closed === true || entity?.isClosed === true || entity?.closedFlag === true || entity?.flags?.closed === true);
    const hasBulges = kind === "polyline" && (Array.isArray(entity?.bulges) || Array.isArray(entity?.vertices) && entity.vertices.some(vertex => finite(vertex?.bulge) && vertex.bulge !== 0));
    const curve = hasBulges ? tessellateCadCurve({ ...entity, kind }) : null;
    return {
      points: curve?.points?.length ? curve.points : pts,
      closed: curve ? curve.closed : closed,
      curveDiagnostics: curve?.diagnostics ?? null,
      bulges: kind === "polyline" && Array.isArray(entity?.bulges) ? [...entity.bulges] : null,
      widths: kind === "polyline" ? {
        start: finite(entity?.startWidth) ? entity.startWidth : null,
        end: finite(entity?.endWidth) ? entity.endWidth : null,
        constant: finite(entity?.constantWidth) ? entity.constantWidth : null
      } : kind === "line" && ((finite(entity?.widthStart) && entity.widthStart > 0) || (finite(entity?.widthEnd) && entity.widthEnd > 0)) ? {
        start: finite(entity?.widthStart) && entity.widthStart > 0 ? entity.widthStart : null,
        end: finite(entity?.widthEnd) && entity.widthEnd > 0 ? entity.widthEnd : null,
        unit: entity?.widthUnit ?? null,
        source: entity?.widthSource ?? null
      } : null
    };
  }
  if (kind === "ellipse" || kind === "spline") {
    const curve = tessellateCadCurve({ ...entity, kind });
    return {
      points: curve.points,
      closed: curve.closed,
      curveDiagnostics: curve.diagnostics,
      ...(kind === "ellipse" ? {
        center: first(entity?.center, entity?.centre, null),
        majorAxis: first(entity?.majorAxis, entity?.major_axis, null),
        axisRatio: first(entity?.axisRatio, entity?.minorMajorRatio, entity?.ratio, null),
        startParameter: first(entity?.startParameter, entity?.startAngle, 0),
        endParameter: first(entity?.endParameter, entity?.endAngle, Math.PI * 2)
      } : {
        degree: entity?.degree ?? null,
        knots: Array.isArray(entity?.knots) ? [...entity.knots] : [],
        controlPoints: clone(entity?.controlPoints || []),
        fitPoints: clone(entity?.fitPoints || []),
        weights: Array.isArray(entity?.weights) ? [...entity.weights] : []
      })
    };
  }
  if (kind === "arc" || kind === "circle") {
    const center = first(entity?.center, entity?.centre);
    const cx = first(center?.x, center?.[0], entity?.cx, entity?.x);
    const cy = first(center?.y, center?.[1], entity?.cy, entity?.y);
    return {
      center: finite(cx) && finite(cy) ? { x: cx, y: cy } : null,
      radius: finite(entity?.radius) ? entity.radius : finite(entity?.r) ? entity.r : null,
      startAngle: first(entity?.startAngle, entity?.start, null),
      endAngle: first(entity?.endAngle, entity?.end, null),
      points: pts,
      widths: ((finite(entity?.widthStart) && entity.widthStart > 0) || (finite(entity?.widthEnd) && entity.widthEnd > 0)) ? {
        start: finite(entity?.widthStart) && entity.widthStart > 0 ? entity.widthStart : null,
        end: finite(entity?.widthEnd) && entity.widthEnd > 0 ? entity.widthEnd : null,
        unit: entity?.widthUnit ?? null,
        source: entity?.widthSource ?? null
      } : null
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
  const layerGroup = first(source.layerGroup, source.layer_group, source.base?.layerGroup, source.base?.layer_group, null);
  // Expanded parser geometry may retain its original CAD object only under `base`.
  // Prefer explicit top-level provenance, then recover the nested original type.
  const sourceType = first(source.sourceType, source.entityType, source.originalType, source.type,
    source.sourceGeometry?.kind, source.base?.sourceType, source.base?.entityType,
    source.base?.originalType, source.base?.type, source.base?.sourceGeometry?.kind, source.base?.kind,
    source.kind, "unknown");
  const layerInfo = (options.layers || []).find(entry => String(entry?.name ?? "") === String(layer ?? ""));
  const layerScaleDenominator = finite(layerInfo?.scale) && layerInfo.scale > 0 ? layerInfo.scale : null;
  const semantics = sourceSemantics(source, sourceType, layerScaleDenominator);
  const handle = first(source.handle, source.id, source.objectId, source.base?.handle, source.base?.id, source.base?.objectId, null);
  const blockPath = Array.isArray(source.blockPath) && source.blockPath.length ? [...source.blockPath] :
    Array.isArray(source.base?.blockPath) && source.base.blockPath.length ? [...source.base.blockPath] :
    Array.isArray(source.blockPath) ? [...source.blockPath] :
    Array.isArray(source.base?.blockPath) ? [...source.base.blockPath] :
    source.blockName != null ? [String(source.blockName)] :
    source.base?.blockName != null ? [String(source.base.blockName)] : [];
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
      blockTransform: clone(first(source.blockTransform, source.base?.blockTransform, null)),
      sourceInsertHandle: first(source.sourceInsertHandle, source.base?.sourceInsertHandle, null) == null ? null : String(first(source.sourceInsertHandle, source.base?.sourceInsertHandle)),
      sourceBlockHandle: first(source.sourceBlockHandle, source.base?.sourceBlockHandle, null) == null ? null : String(first(source.sourceBlockHandle, source.base?.sourceBlockHandle)),
      sourceEntityHandle: first(source.sourceEntityHandle, source.base?.sourceEntityHandle, null) == null ? null : String(first(source.sourceEntityHandle, source.base?.sourceEntityHandle)),
      blockInstanceIndex: Number.isInteger(source.blockInstanceIndex) ? source.blockInstanceIndex :
         Number.isInteger(source.base?.blockInstanceIndex) ? source.base.blockInstanceIndex : null,
      sourceIndex: semantics.entityIndex,
      groupIndex: semantics.groupIndex,
      layerIndex: semantics.layerIndex,
      layerScaleDenominator,
      semantics,
      raw: clone(source)
    },
    semantic: semantics,
    geometry,
    bounds: boundsOf(geometry),
    coordinateSpace: options.coordinateSpace || "sheet-mm"
  };
}

/** Attach normalized provenance to parser geometry without changing coordinates or mutating inputs. */
export function attachCadEntityMetadata(items = [], normalizedEntities = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const normalized = normalizedEntities[index];
    if (!normalized) return item;
    const source = normalized.source || {};
    const semantic = normalized.semantic || {};
    const existingRole = item?.semanticRole ?? item?.semantic?.role ?? null;
    const hasMeaningfulRole = existingRole != null && !["unclassified","unknown"].includes(String(existingRole).trim().toLowerCase());
    const role = hasMeaningfulRole ? existingRole : (semantic.role ?? null);
    const mergedSemantic = { ...semantic, ...(item?.semantic || {}), role };
    return {
      ...item,
      sourceType: item?.sourceType ?? source.type ?? null,
      semanticRole: role,
      semantic: mergedSemantic,
      dimensionGraphic: item?.dimensionGraphic === true || semantic.dimensionGraphic === true,
      blockInstance: item?.blockInstance === true || semantic.blockInstance === true,
      layerScaleDenominator: item?.layerScaleDenominator ?? source.layerScaleDenominator ?? null,
      sourceGroupIndex: item?.sourceGroupIndex ?? source.groupIndex ?? null,
      sourceLayerIndex: item?.sourceLayerIndex ?? source.layerIndex ?? null,
      sourceEntityIndex: item?.sourceEntityIndex ?? source.sourceIndex ?? null,
      blockPath: Array.isArray(item?.blockPath) && item.blockPath.length ? item.blockPath : (source.blockPath ?? []),
      blockTransform: item?.blockTransform ?? source.blockTransform ?? null,
      sourceInsertHandle: item?.sourceInsertHandle ?? source.sourceInsertHandle ?? null,
      sourceBlockHandle: item?.sourceBlockHandle ?? source.sourceBlockHandle ?? null,
      sourceEntityHandle: item?.sourceEntityHandle ?? source.sourceEntityHandle ?? null,
      blockInstanceIndex: item?.blockInstanceIndex ?? source.blockInstanceIndex ?? null
    };
  });
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
  let widthMetadataEntities = 0;
  const semanticCounts = {};
  const scaleCounts = {};
  for (const entity of normalized) {
    counts[entity.kind] = (counts[entity.kind] || 0) + 1;
    const role = entity.semantic?.role || "unclassified";
    semanticCounts[role] = (semanticCounts[role] || 0) + 1;
    const scaleKey = entity.source.layerScaleDenominator == null ? "unknown" : String(entity.source.layerScaleDenominator);
    scaleCounts[scaleKey] = (scaleCounts[scaleKey] || 0) + 1;
    if (!entity.bounds) missingGeometry++;
    if (entity.geometry?.widths && Object.values(entity.geometry.widths).some(value => finite(value) && value > 0)) widthMetadataEntities++;
    const name = entity.source.layer ?? "(レイヤーなし)";
    layers.set(name, (layers.get(name) || 0) + 1);
  }
  const sourceTypeCounts = options.sourceTypeCounts || {};
  const sourceWarnings = [];
  const rawDimensionObjects = Number(sourceTypeCounts["count.CDataSunpou"] || 0);
  const rawBlockInstances = Number(sourceTypeCounts["count.CDataBlock"] || 0);
  const preservedDimensionObjects = semanticCounts.dimension || 0;
  const preservedBlockInstances = semanticCounts["block-instance"] || 0;
  if (options.sourceCountsComparable !== false && rawDimensionObjects > preservedDimensionObjects) {
    sourceWarnings.push(`JWW元データの寸法オブジェクト ${rawDimensionObjects}件に対し、寸法として識別できた要素は ${preservedDimensionObjects}件です。一部または全部の寸法情報が通常図形へ展開されている可能性があります。寸法線を区画境界から確実に除外するには、元オブジェクトとの対応情報が必要です。`);
  }
  if (options.sourceCountsComparable !== false && rawBlockInstances > preservedBlockInstances) {
    sourceWarnings.push(`JWW元データのブロック参照 ${rawBlockInstances}件に対し、ブロック由来として識別できた要素は ${preservedBlockInstances}件です。一部または全部のブロック情報が通常図形へ展開されている可能性があります。記号・什器の誤判定を避けるには、展開後の図形にブロック経路を引き継ぐ必要があります。`);
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
      layerScaleCounts: scaleCounts,
      unscaledEntities: scaleCounts.unknown || 0,
      sourceWarnings,
      rawSourceTypeCounts: clone(sourceTypeCounts),
      sourceCountsComparable: options.sourceCountsComparable !== false,
      dimensionGraphics: semanticCounts.dimension || 0,
      blockInstances: semanticCounts["block-instance"] || 0,
      missingGeometry,
      widthMetadataEntities,
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
