import { useEffect, useRef } from "react";
import { CircleHelp, X } from "lucide-react";

export function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
export function ErrorMessage({ message }) {
  return message ? (
    <div className="error-message" role="alert">
      <CircleHelp size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Modal({ title, eyebrow, close, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        );
        const focusable = [...nodes].filter((n) => !n.disabled);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-top">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={close}>
            <X size={21} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
const presentationOptions = [
  ["auto", "Auto — adapt to the lesson"],
  ["worked", "Worked example — diagrams, equations, checks"],
  ["diagram", "Visual explanation — structures and processes"],
  ["code", "Code walkthrough — code, traces, output"],
  ["slides", "Slides — concepts and comparisons"],
];
export function PresentationSelect({
  value,
  onChange,
  label = "Presentation",
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {presentationOptions.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
