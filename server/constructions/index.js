// JSXGraph is loaded only when a browser board is requested. Numeric validation
// and samples remain usable in Node, without a DOM or global JXG dependency.
const finite = (x, name) => {
  if (!Number.isFinite(x)) throw new Error(`${name} must be finite`);
  return x;
};
const point = (p, name) => {
  if (!Array.isArray(p) || p.length !== 2)
    throw new Error(`${name} must be [x, y]`);
  return p.map((v) => finite(v, name));
};
const interval = (a, b) => {
  finite(a, "a");
  finite(b, "b");
  if (!(b > a) || !Number.isFinite(b - a))
    throw new Error("Interval must have finite positive width");
};
const callable = (f) => {
  if (typeof f !== "function") throw new Error("f must be a function");
};

export function secantSample({ f, x, h }) {
  callable(f);
  finite(x, "x");
  finite(h, "h");
  const end = finite(x + h, "x + h");
  if (h === 0 || end === x)
    throw new Error("h must separate two representable x coordinates");
  const y = finite(f(x), "f(x)"),
    endY = finite(f(end), "f(x + h)");
  const rise = finite(endY - y, "rise");
  return {
    x,
    h,
    start: [x, y],
    end: [end, endY],
    rise,
    slope: finite(rise / (end - x), "secant slope"),
  };
}

export function riemannSample({ f, a, b, n, method = "left" }) {
  callable(f);
  interval(a, b);
  if (!Number.isInteger(n) || n < 1 || n > 1000)
    throw new Error("n must be an integer from 1 to 1000");
  if (!["left", "right", "middle", "trapezoidal"].includes(method))
    throw new Error("Use left, right, middle, or trapezoidal approximation");
  const width = (b - a) / n;
  if (a + width === a || b - width === b)
    throw new Error("Partition is too fine for these coordinates");
  const cells = Array.from({ length: n }, (_, i) => {
    const left = a + i * width,
      right = i === n - 1 ? b : a + (i + 1) * width;
    const sampleX =
      method === "left"
        ? left
        : method === "right"
          ? right
          : left + (right - left) / 2;
    const height =
      method === "trapezoidal"
        ? finite(f(left), "f(left)") / 2 + finite(f(right), "f(right)") / 2
        : finite(f(sampleX), "f(sampleX)");
    return {
      left,
      right,
      sampleX,
      height,
      area: finite((right - left) * height, "cell area"),
    };
  });
  return {
    a,
    b,
    n,
    method,
    width,
    cells,
    value: finite(
      cells.reduce((sum, cell) => sum + cell.area, 0),
      "sum",
    ),
  };
}

let boardId = 0;
export async function constructionBoard(
  container,
  { boundingBox = [-1, 5, 5, -1], axis = true, ...options } = {},
) {
  if (
    !container?.isConnected ||
    container.clientWidth <= 0 ||
    container.clientHeight <= 0
  )
    throw new Error(
      "Board needs a connected container with explicit positive dimensions",
    );
  if (!Array.isArray(boundingBox) || boundingBox.length !== 4)
    throw new Error("boundingBox must be [left, top, right, bottom]");
  boundingBox.forEach((x) => finite(x, "boundingBox"));
  interval(boundingBox[0], boundingBox[2]);
  interval(boundingBox[3], boundingBox[1]);
  const { default: JXG } = await import("jsxgraph");
  if (!container.id) {
    do {
      container.id = `lesson-construction-${++boardId}`;
    } while (
      container.ownerDocument.querySelectorAll(`#${container.id}`).length > 1
    );
  }
  const board = JXG.JSXGraph.initBoard(container.id, {
    ...options,
    boundingbox: boundingBox,
    axis,
    renderer: "svg",
    showCopyright: false,
    showNavigation: false,
    showInfobox: false,
    resize: { enabled: false },
    pan: { enabled: false },
    zoom: { enabled: false },
    keyboard: { enabled: false },
    registerEvents: false,
  });
  // Internal SVG labels avoid requiring JSXGraph's optional HTML/CSS stylesheet.
  const create = (type, parents, attrs = {}) =>
    board.create(type, parents, {
      fixed: true,
      highlight: false,
      transitionDuration: 0,
      label: { display: "internal", fontSize: 19 },
      ...attrs,
    });
  let disposed = false;
  return {
    board,
    create,
    update() {
      if (disposed) throw new Error("Board has been disposed");
      board.fullUpdate();
    },
    dispose() {
      if (!disposed) {
        JXG.JSXGraph.freeBoard(board);
        disposed = true;
      }
    },
  };
}

// A base midpoint and altitude remain dependent on the same moving vertices.
export function triangleConstruction(surface, { vertices, styles = {} }) {
  const validate = (v) => {
    if (!Array.isArray(v) || v.length !== 3)
      throw new Error("vertices must contain three [x, y] points");
    const next = v.map((p, i) => point(p, `vertex ${i}`));
    const dx = finite(next[1][0] - next[0][0], "base dx"),
      dy = finite(next[1][1] - next[0][1], "base dy");
    if (Math.hypot(dx, dy) < 1e-10)
      throw new Error(
        "Base vertices must be distinct (distance at least 1e-10)",
      );
    return next;
  };
  let state = validate(vertices);
  const points = state.map((_, i) =>
    surface.create("point", [() => state[i][0], () => state[i][1]], {
      name: ["A", "B", "C"][i],
      ...styles.point,
    }),
  );
  const base = surface.create("line", points.slice(0, 2), {
    straightFirst: false,
    straightLast: false,
    ...styles.base,
  });
  const sides = [
    surface.create("segment", [points[0], points[2]], styles.side),
    surface.create("segment", [points[1], points[2]], styles.side),
  ];
  const midpoint = surface.create("midpoint", points.slice(0, 2), {
    name: "M",
    ...styles.midpoint,
  });
  const foot = surface.create("orthogonalprojection", [points[2], base], {
    name: "H",
    ...styles.foot,
  });
  const altitude = surface.create("segment", [points[2], foot], {
    dash: 2,
    ...styles.altitude,
  });
  return {
    points,
    base,
    sides,
    midpoint,
    foot,
    altitude,
    setVertices(vertices) {
      state = validate(vertices);
      surface.update();
    },
  };
}

export function secantTangent(
  surface,
  { f, domain = [-1, 3], x = 1, h = 1, styles = {} },
) {
  interval(...domain);
  let state = secantSample({ f, x, h });
  const checkedF = (x) => finite(f(x), "f(x)");
  const graph = surface.create("functiongraph", [checkedF, ...domain], {
    strokeWidth: 3,
    ...styles.graph,
  });
  const start = surface.create(
    "point",
    [() => state.start[0], () => state.start[1]],
    { name: "P", ...styles.start },
  );
  const end = surface.create(
    "point",
    [() => state.end[0], () => state.end[1]],
    { name: "Q", ...styles.end },
  );
  const secant = surface.create("line", [start, end], {
    strokeWidth: 3,
    ...styles.secant,
  });
  // JSXGraph computes the numerical derivative at start's vertical projection.
  const tangent = surface.create("tangent", [start, graph], {
    strokeWidth: 3,
    dash: 2,
    ...styles.tangent,
  });
  return {
    graph,
    start,
    end,
    secant,
    tangent,
    set({ x, h }) {
      const next = secantSample({ f, x, h });
      state = next;
      surface.update();
      return secantSample({ f, x, h });
    },
    sample() {
      return secantSample({ f, x: state.x, h: state.h });
    },
  };
}

export function integralApproximation(
  surface,
  { f, a, b, n = 4, method = "left", styles = {} },
) {
  let state = riemannSample({ f, a, b, n, method });
  const checkedF = (x) => finite(f(x), "f(x)");
  const graph = surface.create(
    "functiongraph",
    [checkedF, () => state.a, () => state.b],
    { strokeWidth: 3, ...styles.graph },
  );
  const rectangles = surface.create(
    "riemannsum",
    [checkedF, () => state.n, () => state.method, () => state.a, () => state.b],
    { fillOpacity: 0.25, strokeWidth: 1, ...styles.rectangles },
  );
  return {
    graph,
    rectangles,
    set({ a, b, n, method = "left" }) {
      state = riemannSample({ f, a, b, n, method });
      surface.update();
      return this.sample();
    },
    sample() {
      return {
        ...riemannSample({
          f,
          a: state.a,
          b: state.b,
          n: state.n,
          method: state.method,
        }),
        renderedValue: finite(rectangles.Value(), "JSXGraph sum"),
      };
    },
  };
}
