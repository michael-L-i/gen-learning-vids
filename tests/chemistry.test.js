import test from "node:test";
import assert from "node:assert/strict";
import init from "@rdkit/rdkit";
import {
  moleculeDiagram,
  chemicalChanges,
  chemicalAnchor,
  electronArrow,
} from "../server/chemistry/diagram.js";
const rd = await init();
const draw = (structure, atomIds) =>
  moleculeDiagram(rd, { structure, atomIds });

test("molecular artwork retains stereochemistry and supplies anchors for labeled atoms", () => {
  const d = draw("C[C@H](O)C(=O)O", [
    "methyl",
    "center",
    "alcohol",
    "carbonyl",
    "oxygen",
    "hydroxyl",
  ]);
  assert.match(d.smiles, /@/);
  assert.equal(Object.keys(d.anchors).length, 6);
  assert.doesNotMatch(d.svg, /<ellipse/);
  assert.match(d.svg, /bond-/);
  for (const p of Object.values(d.anchors))
    assert.ok(p.x > 0 && p.x < 600 && p.y > 0 && p.y < 400);
  assert.throws(() => draw("C(C)(C)(C)(C)C", ["a"]), /molecular structure/);
  assert.throws(() => draw("CO", ["same", "same"]), /unique stable atom/);
});

test("mapped reaction accounting detects carbonyl addition and atom identity errors", () => {
  const before = draw("C=O.[CH3-]", ["carbon", "oxygen", "donor"]);
  const after = draw("C([O-])C", ["carbon", "oxygen", "donor"]);
  const delta = chemicalChanges(before, after);
  assert.deepEqual(delta.addedAtoms, []);
  assert.deepEqual(delta.removedAtoms, []);
  assert.deepEqual(
    delta.formed.map((b) => b.atoms),
    [["carbon", "donor"]],
  );
  assert.deepEqual(delta.orderChanged, [
    { atoms: ["carbon", "oxygen"], before: 2, after: 1 },
  ]);
  assert.equal(
    before.atoms.reduce((s, a) => s + a.chg, 0),
    after.atoms.reduce((s, a) => s + a.chg, 0),
  );
  assert.throws(
    () =>
      chemicalChanges(before, draw("C([NH-])C", ["carbon", "oxygen", "donor"])),
    /element or isotope/,
  );
});

test("electron arrows resolve atoms and existing bonds, distinguish electron counts, and seek deterministically", () => {
  const d = draw("CC=O", ["methyl", "carbon", "oxygen"]);
  const spec = {
    from: { bond: ["carbon", "oxygen"] },
    to: { atom: "oxygen", offset: [20, 0] },
  };
  const full = electronArrow(d, spec);
  assert.notEqual(full, electronArrow(d, { ...spec, electrons: 1 }));
  assert.equal(electronArrow(d, { ...spec, progress: 0 }), "");
  electronArrow(d, { ...spec, progress: 0.4 });
  assert.equal(full, electronArrow(d, spec));
  assert.throws(
    () => chemicalAnchor(d, { bond: ["methyl", "oxygen"] }),
    /Unknown bond/,
  );
  assert.throws(
    () => chemicalAnchor(d, { atom: "missing" }),
    /Unknown chemical/,
  );
  assert.deepEqual(chemicalAnchor(d, { formingBond: ["methyl", "oxygen"] }), {
    x: (d.anchors.methyl.x + d.anchors.oxygen.x) / 2,
    y: (d.anchors.methyl.y + d.anchors.oxygen.y) / 2,
  });
  assert.throws(
    () => chemicalAnchor(d, { formingBond: ["carbon", "oxygen"] }),
    /unbonded atoms/,
  );
});
