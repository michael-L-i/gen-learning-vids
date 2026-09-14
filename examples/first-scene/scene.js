// A small authored browser scene: no remote assets or model-provider calls.
export async function buildScene(root, context) {
  const widening = context.beats.find((beat) => beat.id === "widen");
  if (!widening) throw new Error('The lesson needs a beat named "widen".');

  root.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"
      width="1280" height="720" style="font-family:system-ui,sans-serif"
      role="img" aria-label="A rectangle doubles in width at a fixed height">
      <rect width="1280" height="720" fill="#f5f7f8"/>
      <g fill="#203743">
        <text x="70" y="85" font-size="36" font-weight="600">Double the width, double the area</text>
        <text x="70" y="140" font-size="25">Keep the height fixed. What changes?</text>
      </g>
      <rect x="220" y="280" width="240" height="160" fill="#187c91"/>
      <rect id="added" x="460" y="280" width="0" height="160" fill="#a9dbe2"/>
      <rect id="outline" x="220" y="280" width="240" height="160" fill="none" stroke="#203743" stroke-width="3"/>
      <path d="M460 280V440" stroke="#203743" stroke-width="2" stroke-dasharray="6 6"/>
      <g fill="#203743" font-size="25">
        <text x="70" y="365">h = 2 cm</text>
        <text id="width-label" x="220" y="490">w = 3 cm</text>
        <text x="850" y="300" font-size="30">A = w × h</text>
        <text id="area-label" x="850" y="350">3 × 2 = 6 cm²</text>
        <text id="focus" x="70" y="610">Start with a 3 cm × 2 cm rectangle.</text>
        <text x="70" y="662" font-size="20">Dark strip: original area · Light strip: added area</text>
      </g>
    </svg>`;

  const added = root.querySelector("#added");
  const outline = root.querySelector("#outline");
  const widthLabel = root.querySelector("#width-label");
  const areaLabel = root.querySelector("#area-label");
  const focus = root.querySelector("#focus");
  const format = (value) => Number(value.toFixed(1)).toString();

  return {
    update(seconds) {
      // Derive state from measured speech time; seeking backward also works.
      // The last part of this beat holds the completed comparison.
      const progress = Math.max(
        0,
        Math.min(1, (seconds - widening.start) / (widening.spoken * 0.7)),
      );
      const width = 3 + 3 * progress;
      added.setAttribute("width", String(240 * progress));
      outline.setAttribute("width", String(80 * width));
      widthLabel.textContent = `w ${progress > 0 && progress < 1 ? "≈" : "="} ${format(width)} cm`;
      areaLabel.textContent =
        progress > 0 && progress < 1
          ? `A ≈ ${format(width * 2)} cm²`
          : `${format(width)} × 2 = ${format(width * 2)} cm²`;
      focus.textContent =
        progress === 0
          ? "Start with a 3 cm × 2 cm rectangle."
          : progress < 1
            ? "The width increases; the height stays at 2 cm."
            : "Two equal strips: 6 cm² + 6 cm² = 12 cm².";
    },
  };
}
