import { evaluator, judge, SITE_BUDGET } from "./evaluator.js";

const $ = (id) => document.getElementById(id);
const STAGE = {
  parse: "Parse error",
  scope: "Unbound variable",
  version: "Version error",
  args: "Bad test input",
  eval: "Evaluation failed",
  crash: "Evaluator crashed",
  timeout: "Timed out",
};

// localStorage can be missing or throw (private windows, blocked storage); everything still works without it.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`uplc-practice:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`uplc-practice:${key}`, JSON.stringify(value));
    } catch {}
  },
};

const fmt = (n) => (n == null ? "n/a" : Number(n).toLocaleString("en-US"));
const costLine = (c) => `${fmt(c.cpu)} CPU, ${fmt(c.mem)} memory, ${fmt(c.size)} bytes`;
const refCosts = {};
let current = null;
let saveTimer = null;

// The list is grouped by difficulty; each group is a <details> the user can collapse.
const LEVELS = ["easy", "medium", "hard"];
const collapsed = new Set(store.get("collapsed", []));

function renderList() {
  $("problemList").innerHTML = LEVELS.map((level) => {
    const group = PROBLEMS.filter((p) => p.difficulty === level);
    if (!group.length) return "";
    const done = group.filter((p) => store.get(`best:${p.id}`, null)).length;
    const items = group.map((p) => {
      const solved = store.get(`best:${p.id}`, null) ? '<span class="ok">✓</span>' : "";
      return `<li><button data-id="${p.id}" class="${p === current ? "active" : ""}">` +
        `<span class="name">${esc(p.title)}</span>${solved}</button></li>`;
    }).join("");
    return `<details data-level="${level}"${collapsed.has(level) ? "" : " open"}>` +
      `<summary><span class="badge ${level}">${level}</span><span class="count">${done}/${group.length}</span></summary>` +
      `<ol>${items}</ol></details>`;
  }).join("");
}

function showBest() {
  const best = store.get(`best:${current.id}`, null);
  const ref = refCosts[current.id];
  const parts = [];
  if (ref) parts.push(`Reference: ${costLine(ref)}.`);
  if (best) parts.push(`Best: ${costLine(best)}.`);
  $("refLine").textContent = parts.join(" ");
}

async function open(id) {
  current = PROBLEMS.find((p) => p.id === id) || PROBLEMS[0];
  const p = current;
  store.set("last", p.id);
  renderList();
  $("diff").textContent = p.difficulty;
  $("diff").className = `badge ${p.difficulty}`;
  $("title").textContent = p.title;
  $("statement").textContent = p.statement;
  $("editor").value = store.get(`draft:${p.id}`, p.starter);
  $("summary").hidden = $("results").hidden = $("reference").hidden = true;
  $("status").textContent = "";
  showBest();

  if (!refCosts[p.id]) {
    const verdict = await judge(p, p.reference);
    if (verdict.all) refCosts[p.id] = { cpu: verdict.cpu, mem: verdict.mem, size: verdict.size };
    if (current === p) showBest();
  }
}

// The engine's own wording for a few common failures is internal ("Free Unique 1", remaining budget).
function describeError(run) {
  const err = run.error || "";
  if (run.stage === "eval" && err.includes("over budget")) {
    return `Out of budget (cap: ${fmt(SITE_BUDGET.cpu)} CPU, ${fmt(SITE_BUDGET.mem)} memory).`;
  }
  const free = run.stage === "scope" && err.match(/with name (\S+)/);
  if (free) return `${STAGE.scope}: ${free[1]} is not bound by any enclosing lam.`;
  return `${STAGE[run.stage] || run.stage}: ${err}`;
}

function renderResults(verdict) {
  const rows = verdict.results.map(({ test, run, expected, pass }, i) => {
    const got = run.ok ? run.result : describeError(run);
    const logs = run.logs && run.logs.length ? `<div class="logs">trace: ${esc(run.logs.join(" | "))}</div>` : "";
    return `<tr class="${pass ? "pass" : "fail"}">
      <td class="mark">${pass ? "✓" : "✗"}</td>
      <td><div class="label">Test ${i + 1}</div><code>${esc(test.args.join(" "))}</code></td>
      <td><div class="label">Expected</div><code>${esc(expected)}</code></td>
      <td><div class="label">Got</div><code class="got">${esc(got)}</code>${logs}</td>
      <td class="cost">${run.cpu != null ? `${fmt(run.cpu)} cpu<br>${fmt(run.mem)} mem` : ""}</td>
    </tr>`;
  });
  const skipped = verdict.results.length < current.tests.length
    ? `<p class="muted">Remaining tests skipped.</p>` : "";
  $("results").innerHTML = `<table>${rows.join("")}</table>${skipped}`;
  $("results").hidden = false;
}

function renderSummary(verdict) {
  const total = current.tests.length;
  const box = $("summary");
  if (!verdict.all) {
    box.innerHTML = `<p class="verdict wrong">${verdict.passed}/${total} tests pass.</p>`;
    box.hidden = false;
    return;
  }
  const mine = { cpu: verdict.cpu, mem: verdict.mem, size: verdict.size };
  const ref = refCosts[current.id];
  const best = store.get(`best:${current.id}`, null);
  const isBest = !best || mine.cpu < best.cpu || (mine.cpu === best.cpu && mine.size < best.size);
  if (isBest) store.set(`best:${current.id}`, mine);

  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
  box.innerHTML = `<p class="verdict right">All ${total} tests pass.${isBest && best ? " New best." : ""}</p>
    <div class="times">
      <div><span>CPU</span><b>${fmt(mine.cpu)}</b></div>
      <div><span>Memory</span><b>${fmt(mine.mem)}</b></div>
      <div><span>Size</span><b>${fmt(mine.size)} B</b></div>
      ${ref ? `<div><span>vs reference</span><b>${pct(mine.cpu, ref.cpu)}</b></div>` : ""}
    </div>`;
  box.hidden = false;
  $("refCode").innerHTML = highlight(current.reference);
  $("reference").hidden = false;
  renderList();
  showBest();
}

async function run() {
  const p = current;
  const source = $("editor").value;
  $("run").disabled = true;
  $("status").textContent = "Running...";
  const verdict = await judge(p, source);
  $("run").disabled = false;
  $("status").textContent = "";
  if (current !== p) return;
  renderResults(verdict);
  renderSummary(verdict);
}

// ---------- wiring ----------
$("problemList").addEventListener("click", (e) => {
  const id = e.target.closest("button")?.dataset.id;
  if (id) open(id);
});
// "toggle" doesn't bubble, so listen in the capture phase to remember which groups are collapsed.
$("problemList").addEventListener("toggle", (e) => {
  const level = e.target.dataset?.level;
  if (!level) return;
  if (e.target.open) collapsed.delete(level);
  else collapsed.add(level);
  store.set("collapsed", [...collapsed]);
}, true);
$("run").addEventListener("click", run);
$("reset").addEventListener("click", () => {
  $("editor").value = current.starter;
  store.set(`draft:${current.id}`, current.starter);
});
$("editor").addEventListener("input", () => {
  clearTimeout(saveTimer);
  const p = current;
  saveTimer = setTimeout(() => store.set(`draft:${p.id}`, $("editor").value), 300);
});
$("editor").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (!$("run").disabled) run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const t = e.target;
    const at = t.selectionStart;
    t.setRangeText("  ", at, t.selectionEnd, "end");
    t.dispatchEvent(new Event("input"));
  }
});

// The draft goes along only when it differs from the starter; otherwise it says nothing new.
bindReport($("report"), () => {
  const p = current;
  if (!p) return { title: "", where: "Coding challenges" };
  const code = $("editor").value;
  return {
    title: `Challenge "${p.title}": `,
    where: `Coding challenge \`${p.id}\` (${p.title}), ${$("engine").textContent}`,
    code: code.trim() === p.starter.trim() ? "" : code,
  };
});

evaluator.version().then((v) => {
  $("engine").textContent = typeof v === "string"
    ? `Aiken ${v}`
    : `Evaluator unavailable: ${v.error}`;
});
open(store.get("last", PROBLEMS[0].id));
