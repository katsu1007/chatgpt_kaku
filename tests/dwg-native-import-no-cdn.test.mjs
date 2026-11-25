import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../original/origin.js",import.meta.url),"utf8");
test("native R2000 and R2004 DWG imports do not depend on external CAD CDN",()=>{
 const start=source.indexOf("const bytes=new Uint8Array(await file.arrayBuffer())");
 const end=source.indexOf("state.drawing=drawing",start);
 assert.ok(start>=0&&end>start);
 const load=source.slice(start,end);
 assert.match(load,/readR2000DrawingEntities/);
 assert.match(load,/readR2004DrawingEntities/);
 assert.match(source,/prepareNativeDwgSheet/);
 assert.match(source,/renderNativeDwgSvg/);
 assert.match(load,/await ensureCadLibrary\(\);drawing=await openCad/);
 assert.doesNotMatch(load,/\}await ensureCadLibrary\(\);if\(drawing\.kind/);
});
