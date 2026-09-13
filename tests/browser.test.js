import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { renderBrowser, ensureBrowser } from "../server/browser/render.js";
import { renderBlender } from "../server/blender/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";
import { probeVideo } from "../server/authored/render.js";

test("Blender is opt-in even when an executable is supplied", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "disabled-blender-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const lib = await new Library(root).init();
  await assert.rejects(
    renderBlender(lib, "unused", { blender: "/unused" }),
    /Blender is disabled/,
  );
  assert.equal((await lib.lessons()).length, 0);
});
test("browser renders SVG, Anime.js, RDKit WASM and Three.js into shared, timed media", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for real browser integration");
  await ensureBrowser(() => {}, { install: false });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "browser-lesson-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "lesson.json"),
    JSON.stringify({
      title: "Browser integration",
      summary: "SVG and spatial scenes",
      learningObjective: "Observe motion",
      assumedKnowledge: [],
      tags: [],
      sources: [{ title: "Source", url: "https://example.com/ref" }],
      check: { question: "Moves?", answer: "Yes" },
      scenes: [
        {
          title: "SVG",
          narration: "A molecular diagram and a moving marker.",
          seconds: 1,
        },
        {
          title: "Three",
          narration: "The spatial object rotates.",
          seconds: 1,
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(source, "scene.js"),
    `
 import * as THREE from 'three';import {createTimeline} from 'animejs';
 export async function buildScene(root,ctx){
  const key=t=>Math.round(t*30)%2;
  if(ctx.index===0){
   const rd=await window.initRDKitModule({locateFile:n=>ctx.rdkitUrl+n});const mol=rd.get_mol('CC(=O)O');
   root.innerHTML='<div style="position:absolute;left:600px">'+mol.get_svg()+'</div><div id="marker" style="position:absolute;width:100px;height:100px;background:red"></div>';mol.delete();
   const tl=createTimeline({autoplay:false}).add('#marker',{x:[0,300],duration:1000,ease:'linear'});
   return {frameKey:key,update(t){tl.seek(key(t)*1000);}};
  }
  const scene=new THREE.Scene();scene.background=new THREE.Color('#102030');const camera=new THREE.PerspectiveCamera(40,1280/720,.1,100);camera.position.z=7;
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,720);root.append(renderer.domElement);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshNormalMaterial());scene.add(mesh);
  return {frameKey:key,update(t){mesh.rotation.y=key(t)*.8;renderer.render(scene,camera);}};
 }
 `,
  );
  const lib = await new Library(path.join(root, "library")).init();
  const result = await renderBrowser(lib, source, {
    install: false,
    progress: () => {},
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(2400))),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.renderer, "browser");
  assert.equal(result.scenes[1].start, 1);
  const work = path.join(lib.lessonDir(result.id), "browser");
  const report = JSON.parse(
    await fs.readFile(path.join(work, "render-report.json")),
  );
  for (const scene of report.scenes) {
    assert.equal(scene.frames, 30);
    assert.equal(scene.rendered, 2);
    assert.equal(scene.reused, 28);
  }
  const a = await sharp(path.join(work, "scene-0-0.05.png"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(path.join(work, "scene-0-0.5.png")).raw().toBuffer();
  // The odd key moves the red marker to x=300. It should have red pixels there.
  const pos = (20 * a.info.width + 320) * a.info.channels;
  assert.ok(a.data[pos] > 200 && a.data[pos + 1] < 50);
  assert.ok(b.length > 0);
  assert.notDeepEqual(
    await fs.readFile(path.join(work, "scene-1-0.05.png")),
    await fs.readFile(path.join(work, "scene-1-0.95.png")),
  );
  const info = await probeVideo(path.join(lib.root, "videos", result.video));
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.1);
  assert.match(
    await fs.readFile(
      path.join(lib.lessonDir(result.id), "transcript.md"),
      "utf8",
    ),
    /example.com\/ref/,
  );
  assert.ok((await fs.stat(path.join(work, "source", "scene.js"))).size > 0);
});
