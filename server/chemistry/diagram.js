// Browser-compatible chemistry primitives. RDKit validates and depicts the
// supplied graph; the author remains responsible for source/mechanism accuracy.
export function moleculeDiagram(
  rdkit,
  { structure, atomIds, width = 600, height = 400, drawOptions = {} },
) {
  const mol = rdkit.get_mol(structure);
  if (!mol?.is_valid()) {
    mol?.delete();
    throw new Error(
      "Cannot draw this molecular structure: check bonds, charges and stereochemistry.",
    );
  }
  try {
    const data = JSON.parse(mol.get_json()),
      graph = data.molecules[0];
    if (
      !Array.isArray(atomIds) ||
      atomIds.length !== graph.atoms.length ||
      new Set(atomIds).size !== atomIds.length ||
      atomIds.some(
        (id) => typeof id !== "string" || !/^[a-zA-Z][\w-]*$/.test(id),
      )
    )
      throw new Error(
        "Provide one unique stable atom ID per atom, in input atom order.",
      );
    // Circular highlights locate atom centers in the *same* SVG coordinate
    // system, including label offsets, scaling and optional fixed coordinates.
    // Remove only these temporary highlights, keeping RDKit's chemical artwork.
    let svg = mol.get_svg_with_highlights(
      JSON.stringify({
        bondLineWidth: 2.5,
        fixedFontSize: 24,
        padding: 0.12,
        ...drawOptions,
        width,
        height,
        clearBackground: false,
        atoms: graph.atoms.map((_, i) => i),
        bonds: [],
        atomHighlightsAreCircles: true,
        highlightRadius: 0.12,
      }),
    );
    const anchors = {};
    svg = svg
      .replace(/<ellipse\b[^>]*\/>/g, (tag) => {
        const index = tag.match(/class=['"]atom-(\d+)['"]/);
        if (!index) return tag;
        const x = Number(tag.match(/\bcx=['"]([^'"]+)/)?.[1]),
          y = Number(tag.match(/\bcy=['"]([^'"]+)/)?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new Error("RDKit drawing coordinates are unavailable.");
        anchors[atomIds[Number(index[1])]] = { x, y };
        return "";
      })
      .replace(/<\?xml[^>]*\?>/, "");
    if (Object.keys(anchors).length !== atomIds.length)
      throw new Error(
        "RDKit did not supply every atom anchor; update the chemistry drawing adapter.",
      );
    const atoms = graph.atoms.map((atom, i) => ({
      ...data.defaults.atom,
      ...atom,
      id: atomIds[i],
    }));
    const bonds = graph.bonds.map((bond) => ({
      ...data.defaults.bond,
      ...bond,
      atoms: bond.atoms.map((i) => atomIds[i]),
    }));
    return {
      svg,
      anchors,
      atoms,
      bonds,
      width,
      height,
      smiles: mol.get_smiles(),
      stereo: JSON.parse(mol.get_stereo_tags()),
    };
  } finally {
    mol.delete();
  }
}

export function chemicalChanges(before, after) {
  const a = new Map(before.atoms.map((x) => [x.id, x])),
    b = new Map(after.atoms.map((x) => [x.id, x]));
  for (const [id, atom] of a)
    if (
      b.has(id) &&
      (atom.z !== b.get(id).z || atom.isotope !== b.get(id).isotope)
    )
      throw new Error(
        `Atom ${id} changes element or isotope across the reaction.`,
      );
  const key = (atoms) => [...atoms].sort().join(":"),
    bonds = (graph) => new Map(graph.bonds.map((x) => [key(x.atoms), x]));
  const ab = bonds(before),
    bb = bonds(after);
  return {
    addedAtoms: [...b.keys()].filter((id) => !a.has(id)),
    removedAtoms: [...a.keys()].filter((id) => !b.has(id)),
    formed: [...bb].filter(([k]) => !ab.has(k)).map(([, v]) => v),
    broken: [...ab].filter(([k]) => !bb.has(k)).map(([, v]) => v),
    orderChanged: [...bb]
      .filter(([k, v]) => ab.has(k) && ab.get(k).bo !== v.bo)
      .map(([k, v]) => ({ atoms: v.atoms, before: ab.get(k).bo, after: v.bo })),
    chargeChanges: [...b]
      .filter(([id, atom]) => a.has(id) && a.get(id).chg !== atom.chg)
      .map(([id, atom]) => ({ id, before: a.get(id).chg, after: atom.chg })),
  };
}

export function chemicalAnchor(diagram, reference) {
  let point;
  if (reference.atom) point = diagram.anchors[reference.atom];
  else if ((reference.bond || reference.formingBond)?.length === 2) {
    const [a, b] = reference.bond || reference.formingBond;
    const exists = diagram.bonds.some(
      (x) => x.atoms.includes(a) && x.atoms.includes(b),
    );
    if (reference.bond && !exists)
      throw new Error(`Unknown bond anchor: ${a}-${b}`);
    if (
      reference.formingBond &&
      (exists || a === b || !diagram.anchors[a] || !diagram.anchors[b])
    )
      throw new Error(
        "A forming-bond anchor requires two distinct, unbonded atoms.",
      );
    const p = diagram.anchors[a],
      q = diagram.anchors[b];
    point = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }
  if (!point) throw new Error("Unknown chemical arrow anchor.");
  const [dx, dy] = reference.offset || [0, 0];
  if (![dx, dy].every(Number.isFinite))
    throw new Error("Invalid chemical arrow offset.");
  return { x: point.x + dx, y: point.y + dy };
}

// Geometry only: anchoring an arrow does not establish mechanistic validity.
// One-electron mechanisms must explicitly request a fishhook head.
export function electronArrow(
  diagram,
  { from, to, bend = 55, electrons = 2, progress = 1, color = "#7a3db8" },
) {
  if (
    ![1, 2].includes(electrons) ||
    ![bend, progress].every(Number.isFinite) ||
    !/^#[0-9a-f]{6}$/i.test(color)
  )
    throw new Error("Invalid electron arrow style.");
  const a = chemicalAnchor(diagram, from),
    b = chemicalAnchor(diagram, to);
  const dx = b.x - a.x,
    dy = b.y - a.y,
    distance = Math.hypot(dx, dy);
  if (distance < 1)
    throw new Error("Electron arrow endpoints must be distinct.");
  const c = {
    x: (a.x + b.x) / 2 - (dy / distance) * bend,
    y: (a.y + b.y) / 2 + (dx / distance) * bend,
  };
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return "";
  const q = { x: (1 - t) * a.x + t * c.x, y: (1 - t) * a.y + t * c.y };
  const tip = {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  };
  const angle = Math.atan2(tip.y - q.y, tip.x - q.x),
    size = 11;
  const wing = (sign) =>
    `${tip.x - size * Math.cos(angle) + sign * size * 0.45 * Math.sin(angle)},${tip.y - size * Math.sin(angle) - sign * size * 0.45 * Math.cos(angle)}`;
  const head =
    electrons === 2
      ? `M ${wing(1)} L ${tip.x},${tip.y} L ${wing(-1)}`
      : `M ${wing(1)} L ${tip.x},${tip.y}`;
  return `<g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M ${a.x},${a.y} Q ${q.x},${q.y} ${tip.x},${tip.y}"/><path d="${head}"/></g>`;
}
