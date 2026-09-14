import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { renderBrowser } from "../server/browser/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";
test("spatial and Rapier aliases render actual Three.js motion with embedded WASM offline", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for real browser integration");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spatial-browser-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "lesson.json"),
    JSON.stringify({
      title: "Spatial integration",
      summary: "Cutaway and collision playback",
      learningObjective: "Inspect a simulated moving object",
      assumedKnowledge: [],
      tags: [],
      sources: [],
      check: { question: "Moves?", answer: "Yes" },
      scenes: [{ title: "Motion", narration: "The object falls.", seconds: 1 }],
    }),
  );
  await fs.writeFile(
    path.join(source, "scene.js"),
    `import * as THREE from 'three';import {cutawaySolid} from '@lesson-library/spatial';import {rigidBodyPlayback,applyRigidSample} from '@lesson-library/rigid-body';
 export async function buildScene(root){const playback=await rigidBodyPlayback({duration:1,bodies:[{id:'box',position:[0,2,0],shape:{kind:'cuboid',halfExtents:[.5,.5,.5]}}]});const part=cutawaySolid({size:[1,1,1]});const section=part.setSection({normal:[1,0,1],offset:0});if(section.points.length<3)throw Error('Missing section');const scene=new THREE.Scene();scene.background=new THREE.Color('white');scene.add(part.group,new THREE.AmbientLight(0xffffff,3));const camera=new THREE.PerspectiveCamera(40,1280/720,.1,100);camera.position.set(4,3,8);camera.lookAt(0,0,0);const renderer=new THREE.WebGLRenderer();renderer.setSize(1280,720);root.append(renderer.domElement);return{update(t){applyRigidSample(playback.at(t),{box:part.group});renderer.render(scene,camera);}};}`,
  );
  const lib = await new Library(path.join(dir, "library")).init();
  const result = await renderBrowser(lib, source, {
    install: false,
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(2400))),
  });
  assert.equal(result.status, "ready");
  const work = path.join(lib.lessonDir(result.id), "browser");
  assert.notDeepEqual(
    await fs.readFile(path.join(work, "scene-0-0.05.png")),
    await fs.readFile(path.join(work, "scene-0-0.95.png")),
  );
});
