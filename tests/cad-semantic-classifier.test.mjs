import test from "node:test";
import assert from "node:assert/strict";
import { isNonBoundarySemanticItem } from "../original/cad-semantic-classifier.js";

test("excludes explicit furniture fixture equipment and floor roles",()=>{
 for(const semanticRole of ["furniture","fixture.toilet","equipment.urinal","floor","floor-fill","lighting","electrical","plumbing","door-swing"])
  assert.equal(isNonBoundarySemanticItem({semanticRole}),true,semanticRole);
});

test("preserves explicit wall partition boundary and structural roles",()=>{
 for(const semanticRole of ["wall","partition","boundary","structural"])
  assert.equal(isNonBoundarySemanticItem({semanticRole}),false,semanticRole);
});

test("uses nested source semantics and source type metadata",()=>{
 assert.equal(isNonBoundarySemanticItem({semantic:{role:"fixture.sink"}}),true);
 assert.equal(isNonBoundarySemanticItem({sourceGeometry:{semantic:{role:"furniture.chair"}}}),true);
 assert.equal(isNonBoundarySemanticItem({sourceType:"equipment"}),true);
});

test("does not discard unknown or unclassified entities by guesswork",()=>{
 assert.equal(isNonBoundarySemanticItem({semanticRole:"unclassified"}),false);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"unknown"}),false);
 assert.equal(isNonBoundarySemanticItem({kind:"line"}),false);
});

test("explicit semantic role wins over generic source entity type",()=>{
 assert.equal(isNonBoundarySemanticItem({sourceType:"line",sourceGeometry:{semantic:{role:"fixture.sink"}}}),true);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"unclassified",sourceType:"equipment"}),true);
});


test("excludes generic block instances from room boundaries",()=>{
 assert.equal(isNonBoundarySemanticItem({semanticRole:"block-instance"}),true);
 assert.equal(isNonBoundarySemanticItem({blockInstance:true}),true);
 assert.equal(isNonBoundarySemanticItem({semantic:{role:"block-instance"}}),true);
});

test("explicit wall semantics override generic block ancestry",()=>{
 assert.equal(isNonBoundarySemanticItem({semanticRole:"wall",semantic:{role:"block-instance"},blockInstance:true}),false);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"partition",blockInstance:true}),false);
});


test("allows generic block ancestry on explicitly selected wall layers",()=>{
 assert.equal(isNonBoundarySemanticItem({semanticRole:"block-instance"},{allowBlockInstance:true}),false);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"block-instance",semanticRole2:"fixture"},{allowBlockInstance:true}),false);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"fixture",semantic:{role:"block-instance"}},{allowBlockInstance:true}),true);
 assert.equal(isNonBoundarySemanticItem({semanticRole:"block-instance"}),true);
});
