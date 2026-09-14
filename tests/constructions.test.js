import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { secantSample, riemannSample } from "../server/constructions/index.js";
import { renderBrowserScenes } from "../server/browser/host.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("secants approach the derivative from either side and preserve independent state", () => {
  for (const h of [1, 0.25, 0.01, -0.01, -0.5]) {
    const s = secantSample({ f: (x) => x * x, x: 1, h });
    close(s.slope, 2 + h);
    close(s.end[1], (1 + h) ** 2);
  }
  const original = secantSample({ f: (x) => x * x, x: 1, h: 1 });
  original.start[0] = 5;
  assert.equal(secantSample({ f: (x) => x * x, x: 1, h: 1 }).start[0], 1);
});
test("signed quadrature respects endpoint rules and convergence", () => {
  for (const n of [1, 4, 20]) {
    close(
      riemannSample({ f: (x) => x * x, a: 0, b: 1, n }).value,
      ((n - 1) * (2 * n - 1)) / (6 * n * n),
    );
    close(
      riemannSample({ f: (x) => x * x, a: 0, b: 1, n, method: "right" }).value,
      ((n + 1) * (2 * n + 1)) / (6 * n * n),
    );
    close(
      riemannSample({ f: (x) => -2 * x, a: 0, b: 3, n, method: "trapezoidal" })
        .value,
      -9,
    );
    close(
      riemannSample({ f: (x) => x * x, a: 0, b: 1, n, method: "middle" }).value,
      1 / 3 - 1 / (12 * n * n),
    );
  }
});
test("invalid, collapsed, nonfinite and excessive numeric inputs fail actionably", () => {
  for (const h of [0, NaN, Infinity, 1e-30])
    assert.throws(() => secantSample({ f: (x) => x * x, x: 1, h }));
  for (const n of [0, -1, 1.5, 1001, NaN])
    assert.throws(() => riemannSample({ f: (x) => x, a: 0, b: 1, n }));
  assert.throws(() => riemannSample({ f: (x) => x, a: 1, b: 0, n: 4 }));
  assert.throws(() => riemannSample({ f: () => Infinity, a: 0, b: 1, n: 4 }));
  assert.throws(() =>
    riemannSample({ f: (x) => x, a: 0, b: 1, n: 4, method: "random" }),
  );
});
test("actual JSXGraph dependencies, quadrature, tangent and backward seeking render in browser", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for JSXGraph integration");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "construction-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(dir, "timeline.json"),
    JSON.stringify([{ title: "Construction", narration: "", duration: 1 }]),
  );
  await fs.writeFile(
    path.join(dir, "scene.js"),
    `
import {constructionBoard,triangleConstruction,secantTangent,integralApproximation} from '@lesson-library/constructions';
export async function buildScene(root){
 root.innerHTML='<div id="board" style="width:900px;height:650px"></div>';
 const s=await constructionBoard(root.firstChild);
 const tri=triangleConstruction(s,{vertices:[[0,0],[4,0],[1,3]]});
 const calc=secantTangent(s,{f:x=>x*x, x:1,h:.5});
 const sum=integralApproximation(s,{f:x=>x*x,a:0,b:1,n:4});
 const eq=(a,b)=>{if(Math.abs(a-b)>1e-6)throw Error(a+' != '+b)};
 eq(tri.midpoint.X(),2);eq(tri.foot.X(),1);eq(tri.foot.Y(),0);
 tri.setVertices([[1,1],[3,3],[1,3]]);eq(tri.midpoint.Y(),2);eq(tri.foot.X(),2);eq(tri.foot.Y(),2);
 tri.setVertices([[0,0],[4,0],[1,3]]);eq(tri.foot.X(),1);
 calc.set({x:2,h:-.25});eq(calc.secant.getSlope(),3.75);eq(calc.tangent.getSlope(),4);
 calc.set({x:1,h:.5});eq(calc.secant.getSlope(),2.5);eq(calc.tangent.getSlope(),2);
 for(const method of ['left','right','middle','trapezoidal']) {sum.set({a:0,b:1,n:8,method});const v=sum.sample();eq(v.value,v.renderedValue);}
 sum.set({a:0,b:1,n:4,method:'left'});eq(sum.sample().renderedValue,0.21875);
 return {frameKey:t=>Math.round(t*30)%2,update(t){calc.set({x:1,h:Math.round(t*30)%2?.25:1});}};
}`,
  );
  await renderBrowserScenes({
    module: path.join(dir, "scene.js"),
    timeline: path.join(dir, "timeline.json"),
    output: dir,
  });
  const report = JSON.parse(
    await fs.readFile(path.join(dir, "render-report.json")),
  );
  assert.equal(report.scenes[0].rendered, 2);
  assert.equal(report.scenes[0].reused, 28);
  assert.notDeepEqual(
    await fs.readFile(path.join(dir, "scene-0-0.05.png")),
    await fs.readFile(path.join(dir, "scene-0-0.95.png")),
  );
});
