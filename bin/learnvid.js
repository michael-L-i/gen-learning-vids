#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { Library } from "../server/store.js";
import {
  createLesson,
  runJob,
  startWorker,
  askLesson,
  retryLesson,
} from "../server/engine.js";
import { doctor } from "../server/providers.js";
import { speak } from "../server/speech.js";
import { kokoroVoices, speechPreviewText } from "../server/speech-options.js";
import { textFromExport, scanNotes, importNotes } from "../server/imports.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    library: { type: "string" },
    port: { type: "string" },
    output: { type: "string" },
    dev: { type: "boolean" },
    open: { type: "boolean" },
    wait: { type: "boolean" },
    source: { type: "string", multiple: true },
    goal: { type: "string" },
    brief: { type: "string" },
    style: { type: "string" },
    presentation: { type: "string" },
    "visual-brief": { type: "string" },
    plan: { type: "string" },
    python: { type: "string" },
    blender: { type: "string" },
    help: { type: "boolean" },
  },
});
const [command, ...args] = positionals;
const print = (value) => console.log(JSON.stringify(value, null, 2));
const openUrl = (url) => {
  const bin =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  const child = spawn(bin, [url], { stdio: "ignore" });
  child.on("error", () => console.log(`Open ${url}`));
  child.unref();
};
async function main() {
  if (!command || values.help || command === "help") {
    console.log(`Lesson Library — one library, any entry point

learnvid serve [--open] [--dev] [--port 4317]
learnvid create "Topic" [--goal "What to understand"] [--source FILE] [--brief FILE] [--style auto|paper|midnight|sage] [--wait]
learnvid create "Topic" --plan FILE [--wait]   Render an agent-authored lesson JSON
learnvid render-blender DIRECTORY [--blender PATH]  Render trusted local 3D scene.py + lesson.json
learnvid render-browser DIRECTORY          Render trusted scene.js with 2D / Three.js animation
learnvid setup-browser                     Download the managed browser runtime
learnvid capabilities                      List available visual capabilities
learnvid capability enable|disable blender Enable or disable the external Blender tool
learnvid render-scientific DIRECTORY [--python PATH]  Run trusted local scene.py + lesson.json
learnvid image-search "QUERY"               Find images with source and license metadata
learnvid image-info "File:COMMONS TITLE"    Resolve one Wikimedia Commons image
learnvid create "Topic" --presentation auto|worked|diagram|code|slides --visual-brief "Visual directions"
learnvid list
learnvid show ID
learnvid ask ID "Question about the lesson"
learnvid retry ID [--wait]
learnvid import FILE
learnvid scan DIRECTORY
learnvid import-notes DIRECTORY RELATIVE_PATH...
learnvid profile [FILE]                      Read profile, or replace with FILE
learnvid settings [FILE]                     Read settings, or replace with JSON FILE
learnvid doctor
learnvid voices
learnvid speech-preview [--output FILE]
learnvid open

All commands accept --library PATH (or LEARNVID_HOME). Default: ~/Lesson Library.
Creation runs in the background unless --wait is provided. Source files are copied into the private library.
`);
    return;
  }
  const library = await new Library(values.library).init();
  switch (command) {
    case "capabilities": {
      const { visualCapabilities } = await import("../server/capabilities.js");
      print(await visualCapabilities(library));
      break;
    }
    case "capability": {
      if (!["enable", "disable"].includes(args[0]) || args[1] !== "blender")
        throw new Error("Use learnvid capability enable|disable blender");
      print(
        await library.saveSettings({
          ...(await library.settings()),
          blenderEnabled: args[0] === "enable",
        }),
      );
      break;
    }
    case "setup-browser": {
      const { ensureBrowser } = await import("../server/browser/render.js");
      print({ executable: await ensureBrowser(console.error) });
      break;
    }
    case "render-browser": {
      if (!args[0])
        throw new Error(
          "Provide a folder containing lesson.json and trusted scene.js code.",
        );
      const { renderBrowser } = await import("../server/browser/render.js");
      print(
        await renderBrowser(library, args[0], {
          progress: (stage) => console.error(stage),
        }),
      );
      break;
    }
    case "image-search":
    case "image-info": {
      const { commonsImages } = await import("../server/assets.js");
      print(
        await commonsImages(args.join(" "), {
          exact: command === "image-info",
        }),
      );
      break;
    }
    case "render-blender": {
      if (!args[0])
        throw new Error(
          "Provide a folder containing lesson.json and trusted scene.py code.",
        );
      const { renderBlender } = await import("../server/blender/render.js");
      print(
        await renderBlender(library, args[0], {
          blender: values.blender,
          progress: (stage) => console.error(stage),
        }),
      );
      break;
    }
    case "render-scientific": {
      if (!args[0])
        throw new Error(
          "Provide a folder containing lesson.json and trusted scene.py code.",
        );
      const { renderScientific } = await import(
        "../server/scientific/render.js"
      );
      print(
        await renderScientific(library, args[0], {
          python: values.python,
          progress: (stage) => console.error(stage),
        }),
      );
      break;
    }
    case "serve": {
      const { startServer } = await import("../server/app.js");
      const instance = await startServer({
        root: library.root,
        port: values.port === undefined ? 4317 : Number(values.port),
        dev: values.dev,
      });
      console.log(
        `Lesson Library → ${instance.url}\nLibrary → ${library.root}`,
      );
      if (values.open) openUrl(instance.url);
      const stop = async () => {
        await instance.close();
        process.exit(0);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      break;
    }
    case "create": {
      const sourceIds = [];
      for (const file of values.source || []) {
        const content = textFromExport(await fs.readFile(file, "utf8"), file);
        const s = await library.addSource({
          title: path.basename(file),
          content,
          origin: path.resolve(file),
        });
        sourceIds.push(s.id);
      }
      const plan = values.plan
        ? JSON.parse(await fs.readFile(values.plan, "utf8"))
        : undefined;
      const lesson = await createLesson(
        library,
        {
          topic: args.join(" ") || plan?.title,
          goal: values.goal,
          style: values.style,
          presentation: values.presentation,
          visualBrief: values["visual-brief"],
          sourceIds,
          brief: values.brief ? await fs.readFile(values.brief, "utf8") : "",
        },
        plan,
      );
      if (values.wait) print(await runJob(library, lesson.id));
      else {
        startWorker(library, lesson.id);
        print({ id: lesson.id, status: "queued", library: library.root });
      }
      break;
    }
    case "run-job":
      await runJob(library, args[0]);
      break;
    case "list":
      print(
        (await library.lessons()).map(
          ({ id, title, status, duration, stage }) => ({
            id,
            title,
            status,
            duration,
            stage,
          }),
        ),
      );
      break;
    case "show":
      print(await library.lesson(args[0]));
      break;
    case "ask":
      print(await askLesson(library, args[0], args.slice(1).join(" ")));
      break;
    case "retry":
      await retryLesson(library, args[0]);
      if (values.wait) print(await runJob(library, args[0]));
      else {
        startWorker(library, args[0]);
        print({ status: "queued" });
      }
      break;
    case "voices":
      print(kokoroVoices);
      break;
    case "speech-preview": {
      const output = path.resolve(
        values.output || path.join(library.root, ".previews", "sample.wav"),
      );
      await fs.mkdir(path.dirname(output), { recursive: true });
      await speak(speechPreviewText, output, await library.settings(), {
        cacheDir: path.join(library.root, ".models", "kokoro"),
      });
      print({ file: output });
      break;
    }
    case "doctor":
      print({
        library: library.root,
        tools: await doctor(),
        settings: await library.settings(),
      });
      break;
    case "import": {
      const file = args[0];
      print(
        await library.addSource({
          title: path.basename(file),
          content: textFromExport(await fs.readFile(file, "utf8"), file),
          origin: path.resolve(file),
        }),
      );
      break;
    }
    case "scan":
      print(await scanNotes(args[0]));
      break;
    case "import-notes":
      print(await importNotes(library, args[0], args.slice(1)));
      break;
    case "profile":
      if (args[0]) {
        await library.saveProfile(await fs.readFile(args[0], "utf8"));
        print({ saved: true });
      } else console.log(await library.profile());
      break;
    case "settings":
      if (args[0])
        print(
          await library.saveSettings(
            JSON.parse(await fs.readFile(args[0], "utf8")),
          ),
        );
      else print(await library.settings());
      break;
    case "open": {
      let url = "http://127.0.0.1:4317";
      try {
        url = JSON.parse(
          await fs.readFile(path.join(library.root, ".server.json"), "utf8"),
        ).url;
      } catch {}
      openUrl(url);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}. Run learnvid help.`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
