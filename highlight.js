// UPLC syntax highlighting, shared by the quiz (game.js) and the practice page.
const KEYWORDS = new Set(["program", "lam", "delay", "force", "builtin", "con", "error", "constr", "case"]);
const TYPES = new Set(["integer", "bytestring", "string", "bool", "unit", "data", "list", "pair"]);
const CONSTS = new Set(["True", "False", "I", "B", "Constr", "Map", "List"]);
const TOKEN = /(--[^\n]*)|("(?:[^"\\]|\\.)*")|(#[0-9a-fA-F]*)|(-?\d+(?:\.\d+)*)|([A-Za-z_][\w']*)|([\[\]()])|(\s+|.)/g;

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function highlight(src) {
  let out = "";
  let prev = "";
  for (const m of src.matchAll(TOKEN)) {
    const [t, cm, str, bytes, num, ident, br] = m;
    const span = (cls) => `<span class="${cls}">${esc(t)}</span>`;
    if (cm) out += span("cm");
    else if (str) out += span("str");
    else if (bytes) out += span("bytes");
    else if (num) out += span("num");
    else if (ident) {
      if (KEYWORDS.has(ident)) out += span("kw");
      else if (prev === "builtin") out += span("bi");
      else if (TYPES.has(ident) || CONSTS.has(ident)) out += span("ty");
      else out += esc(t);
    } else if (br) out += span("br");
    else out += esc(t);
    if (ident) prev = ident;
    else if (!/^\s+$/.test(t)) prev = t;
  }
  return out;
}
