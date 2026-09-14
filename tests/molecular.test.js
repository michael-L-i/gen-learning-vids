import test from "node:test";
import assert from "node:assert/strict";
import { MVSData } from "molstar/lib/extensions/mvs/mvs-data.js";
import {
  molecularSelection,
  molecularSpec,
  molecularCameraBetween,
} from "../server/molecular/index.js";
test("molecular scene is genuine valid MolViewSpec with copied selectors and stable identities", () => {
  const selector = {
    auth_asym_id: "A",
    beg_auth_seq_id: 3,
    end_auth_seq_id: 8,
  };
  const options = {
    url: "/source/model.cif",
    components: [
      {
        id: "chain",
        selector,
        representation: "cartoon",
        color: "#abcd12",
        colorLayers: [{ selector: { atom_id: 8 }, color: "#001122" }],
      },
    ],
  };
  const spec = molecularSpec(options);
  assert.equal(
    MVSData.isValid(spec, { noExtra: true }),
    true,
    JSON.stringify(MVSData.validationIssues(spec)),
  );
  assert.deepEqual(molecularSpec(options), spec);
  selector.auth_asym_id = "B";
  assert(JSON.stringify(spec).includes('"auth_asym_id":"A"'));
  for (const representation of [
    "cartoon",
    "ball_and_stick",
    "spacefill",
    "surface",
  ])
    assert(
      MVSData.isValid(
        molecularSpec({
          url: "file.cif",
          components: [{ id: "x", selector: "all", representation }],
        }),
        { noExtra: true },
      ),
    );
});
test("selectors reject accidental broad selections and malformed component models", () => {
  for (const s of [
    {},
    [],
    { chain: "A" },
    { label_seq_id: 1.5 },
    { beg_auth_seq_id: 9, end_auth_seq_id: 1 },
    "anything",
  ])
    assert.throws(() => molecularSelection(s));
  for (const changes of [
    { format: "xyz" },
    { modelIndex: -1 },
    { components: [] },
    {
      components: [
        { id: "a", selector: "all" },
        { id: "a", selector: "all" },
      ],
    },
    { components: [{ id: "a", selector: "all", opacity: NaN }] },
    { components: [{ id: "a", selector: "all", sizeFactor: 0 }] },
  ])
    assert.throws(() =>
      molecularSpec({
        url: "a.cif",
        components: [{ id: "a", selector: "all" }],
        ...changes,
      }),
    );
});
test("camera interpolation is finite, endpoint-exact and independent of call order", () => {
  const a = {
      position: [0, 0, 20],
      target: [0, 0, 0],
      up: [0, 1, 0],
      radius: 10,
      radiusMax: 20,
    },
    b = { ...a, position: [10, 0, 10], target: [2, 0, 0], radius: 5 };
  assert.deepEqual(molecularCameraBetween(a, b, 0), a);
  assert.deepEqual(molecularCameraBetween(a, b, 1), b);
  const mid = molecularCameraBetween(a, b, 0.5);
  assert.deepEqual(mid.position, [5, 0, 15]);
  assert.equal(mid.radius, 7.5);
  molecularCameraBetween(a, b, 1);
  assert.deepEqual(molecularCameraBetween(a, b, 0.5), mid);
  for (const fn of [
    () => molecularCameraBetween(a, b, 2),
    () =>
      molecularCameraBetween(
        a,
        { ...b, position: [0, 0, -20], target: [0, 0, 0] },
        0.5,
      ),
    () => molecularCameraBetween(a, { ...b, up: [0, 0, 0] }, 1),
    () => molecularCameraBetween({ ...a, fov: NaN }, b, 0),
  ])
    assert.throws(fn);
});
