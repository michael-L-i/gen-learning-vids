import test from "node:test";
import assert from "node:assert/strict";
import {
  geographicMap,
  utcTimeline,
  flowLayout,
} from "../server/maps-flows/index.js";
const data = (value) => ({
  unit: "tonnes/month",
  nodes: [{ id: "source" }, { id: "a" }, { id: "b" }],
  links: [
    { id: "sa", source: "source", target: "a", value: value * 0.6 },
    { id: "sb", source: "source", target: "b", value: value * 0.4 },
  ],
});
test("actual Sankey preserves identities, amounts, balance and a fixed scale across totals", () => {
  const original = data(100),
    before = structuredClone(original),
    options = { width: 400, height: 500, pixelsPerUnit: 2 };
  const a = flowLayout(original, options),
    b = flowLayout(data(200), options);
  assert.deepEqual(original, before);
  assert.deepEqual(
    a.links.map((l) => l.id),
    ["sa", "sb"],
  );
  assert.equal(a.nodes[0].outgoing, 100);
  assert.equal(a.nodes[0].balance, 100);
  assert.equal(a.nodes[1].balance, -60);
  assert.equal(a.links[0].width, 120);
  assert.equal(b.links[0].width, 240);
  assert.match(a.links[0].path, /^M.*C/);
  assert.deepEqual(flowLayout(original, options), a);
  assert.equal(a.nodes[1].y1 - a.nodes[1].y0, 120);
});
test("Sankey rejects cycles, unknown endpoints, invalid amounts/units and impossible fixed extents", () => {
  for (const value of [-1, NaN, Infinity, 0])
    assert.throws(() => flowLayout(data(value), { width: 400, height: 400 }));
  const cycle = data(10);
  cycle.links.push({ id: "back", source: "a", target: "source", value: 1 });
  assert.throws(
    () => flowLayout(cycle, { width: 400, height: 400 }),
    /acyclic/,
  );
  const wrong = data(10);
  wrong.links[0].target = "absent";
  assert.throws(
    () => flowLayout(wrong, { width: 400, height: 400 }),
    /existing/,
  );
  const mixed = data(10);
  mixed.links[0].unit = "kilograms";
  assert.throws(() => flowLayout(mixed, { width: 400, height: 400 }), /Mixed/);
  assert.throws(
    () => flowLayout(data(100), { width: 400, height: 100, pixelsPerUnit: 2 }),
    /exceeds/,
  );
  assert.throws(
    () =>
      flowLayout(data(Number.MAX_VALUE), {
        width: 400,
        height: 400,
        pixelsPerUnit: 10,
      }),
    /exceeds/,
  );
});
test("zero links and isolated nodes remain finite; intermediate balances are explicit", () => {
  const d = data(100);
  d.nodes.push({ id: "isolated" }, { id: "final" });
  d.links.push(
    { id: "zero", source: "source", target: "isolated", value: 0 },
    { id: "af", source: "a", target: "final", value: 20 },
  );
  const out = flowLayout(d, { width: 600, height: 400, pixelsPerUnit: 2 });
  assert.equal(out.nodes.find((n) => n.id === "a").balance, -40);
  assert.equal(out.links.find((l) => l.id === "zero").width, 0);
  assert.ok(!JSON.stringify(out).includes("null"));
});
test("UTC timeline uses calendar months, clamps endpoints, supports leap day and rejects rollover", () => {
  const timeline = utcTimeline({
    domain: ["2024-01-01", "2024-04-01"],
    duration: 91,
    range: [10, 920],
  });
  assert.equal(timeline.at(31).iso, "2024-02-01T00:00:00.000Z");
  assert.equal(timeline.at(59).iso, "2024-02-29T00:00:00.000Z");
  assert.equal(timeline.at(-1).x, 10);
  assert.equal(timeline.at(100).x, 920);
  assert.deepEqual(
    timeline.ticks().map((t) => t.iso.slice(0, 10)),
    ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
  );
  assert.throws(() => timeline.atTime("2024-02-30"), /Invalid/);
  assert.throws(() => timeline.atTime("2024-01-01T24:00:00Z"), /Invalid/);
  assert.throws(() => timeline.atTime("2024-01-01T00:00:00"), /UTC/);
  assert.equal(
    timeline.atTime("2024-02-01T00:00:00Z").iso,
    "2024-02-01T00:00:00.000Z",
  );
  assert.throws(
    () =>
      utcTimeline({ domain: ["1900-01-01", "2024-01-01"], duration: 10 }).ticks(
        { unit: "day" },
      ),
    /Too many/,
  );
});
test("D3 map projects north upward, produces real paths and deterministic great-circle reveals", () => {
  const map = geographicMap({
    bounds: [-10, 40, 20, 60],
    width: 500,
    height: 400,
    features: [
      {
        id: "land",
        properties: { name: "Test land" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 45],
              [0, 55],
              [10, 55],
              [10, 45],
              [0, 45],
            ],
          ],
        },
      },
    ],
  });
  assert.match(map.paths[0].path, /^M/);
  assert.ok(map.point([0, 55])[1] < map.point([0, 45])[1]);
  assert.equal(map.point([40, 50]), null);
  const opts = { id: "route", from: [0, 50], to: [10, 50], progress: 0.5 };
  const a = map.route(opts);
  map.route({ ...opts, progress: 1 });
  assert.deepEqual(map.route(opts), a);
  assert.ok(a.angularDistance > 0);
  assert.notEqual(a.path, a.revealedPath);
  assert.ok(a.point[1] < map.point([5, 50])[1]);
  assert.equal(map.route({ ...opts, progress: 0 }).revealedPath, "");
  assert.throws(() => map.route({ ...opts, to: [180, -50] }), /Antipodal/);
  assert.throws(() => map.point([0, Infinity]), /Coordinates/);
});

test("geographic clipping agrees with point bounds for wide and tall viewports", () => {
  for (const [width, height] of [
    [800, 200],
    [200, 800],
  ]) {
    const map = geographicMap({
      width,
      height,
      bounds: [-5, 45, 10, 60],
      features: [
        {
          id: "outside",
          geometry: {
            type: "LineString",
            coordinates: [
              [30, 50],
              [35, 55],
            ],
          },
        },
      ],
    });
    assert.equal(map.point([30, 50]), null);
    assert.equal(map.paths[0].path, "");
    assert.equal(
      map.route({ id: "outside", from: [30, 50], to: [35, 55] }).path,
      "",
    );
  }
});
