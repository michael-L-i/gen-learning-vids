"""Render an explicitly selected, trusted local Python scene module.

Module contract: build_scene(index, context) -> (matplotlib Figure, update(seconds)).
This host owns timing, encoding, previews and layout reports, not scene geometry.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FFMpegWriter
from matplotlib.text import Text


def audit(fig):
    """Advisory visible-text bounds; excludes ticks, which Matplotlib lays out."""
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    warnings, boxes = [], []
    texts = list(fig.texts)
    for ax in fig.axes:
        if ax.get_visible():
            texts.extend(ax.texts)
            texts.extend([ax.title, ax.xaxis.label, ax.yaxis.label])
    width, height = fig.canvas.get_width_height()
    for text in texts:
        if not isinstance(text, Text) or not text.get_visible() or not text.get_text():
            continue
        if text.get_alpha() is not None and text.get_alpha() < .1:
            continue
        b = text.get_window_extent(renderer)
        label = text.get_text()[:100]
        if b.x0 < 0 or b.y0 < 0 or b.x1 > width or b.y1 > height:
            warnings.append({"issue": "Text leaves canvas", "text": label})
        for other, name in boxes:
            if min(b.x1, other.x1)-max(b.x0, other.x0) > 4 and min(b.y1, other.y1)-max(b.y0, other.y0) > 4:
                warnings.append({"issue": "Text overlaps text", "text": label, "other": name})
        boxes.append((b, label))
    return warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", required=True)
    parser.add_argument("--timeline", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--scene", type=int, help="Render one chapter by its zero-based index")
    args = parser.parse_args()
    source = Path(args.module).resolve()
    sys.path.insert(0, str(source.parent))
    spec = importlib.util.spec_from_file_location("lesson_scene", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    timeline = json.loads(Path(args.timeline).read_text())
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    reports = []
    if args.scene is not None:
        if not 0 <= args.scene < len(timeline):
            parser.error("Scene index is outside the timeline")
        report_file = out / "layout-report.json"
        if report_file.exists():
            reports = [r for r in json.loads(report_file.read_text())["scenes"] if r["scene"] != args.scene]
    for i, beat in enumerate(timeline):
        if args.scene is not None and i != args.scene:
            continue
        context = {**beat, "width": 1280, "height": 720, "fps": 30}
        fig, update = module.build_scene(i, context)
        fig.set_size_inches(12.8, 7.2)
        fig.set_dpi(100)
        warnings = []
        for sample in [.05, .25, .5, .75, .95]:
            seconds = beat["duration"] * sample
            update(seconds)
            warnings.extend({**w, "seconds": round(seconds, 3)} for w in audit(fig))
            fig.savefig(out / f"scene-{i}-{sample}.png", dpi=100)
        reports.append({"scene": i, "warnings": warnings})
        if not args.preview_only:
            writer = FFMpegWriter(fps=30, codec="libx264", extra_args=["-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
            with writer.saving(fig, str(out / f"visual-{i}.mp4"), dpi=100):
                for frame in range(round(beat["duration"] * 30)):
                    update(frame / 30)
                    writer.grab_frame()
            print(f"Rendered chapter {i+1}/{len(timeline)}", flush=True)
        plt.close(fig)
    (out / "layout-report.json").write_text(json.dumps({"backend": "matplotlib", "matplotlib": matplotlib.__version__, "scenes": sorted(reports, key=lambda r: r["scene"]), "limitations": ["Sampled text checks are advisory; visual and scientific review still required."]}, indent=2))


if __name__ == "__main__":
    main()
