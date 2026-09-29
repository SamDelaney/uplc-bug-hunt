const POINTS = { easy: 100, medium: 200, hard: 300 };
const ROUND_SIZE = 10;
const $ = (id) => document.getElementById(id);

// ---------- state ----------
let state = null;
let ticker = null;

// Timers count only time spent on questions: each question's clock stops when it's answered,
// so reading the explanation doesn't count against you.
function fmtSec(ms) { return `${(ms / 1000).toFixed(1)}s`; }
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function questionMs() {
  return state.answered ? state.lastMs : performance.now() - state.qStart;
}
function tick() {
  const q = questionMs();
  $("qtime").textContent = fmtSec(q);
  $("ttime").textContent = fmtClock(state.totalMs + (state.answered ? 0 : q));
}
function stopTicker() { clearInterval(ticker); ticker = null; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadBest() {
  try { return Number(localStorage.getItem("uplc-bug-hunt-best")) || 0; } catch { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem("uplc-bug-hunt-best", String(n)); } catch {}
}

function show(id) {
  for (const s of ["start", "play", "end"]) $(s).hidden = s !== id;
  $("hud").hidden = id !== "play";
}

function start(filter) {
  const pool = PUZZLES.filter((p) => filter === "all" || p.difficulty === filter);
  state = {
    queue: shuffle(pool).slice(0, ROUND_SIZE),
    i: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    results: [],
    answered: false,
    totalMs: 0,
    qStart: 0,
    lastMs: 0,
  };
  show("play");
  renderPuzzle();
}

function renderPuzzle() {
  const p = state.queue[state.i];
  state.answered = false;
  state.order = shuffle(p.options.map((text, idx) => ({ text, correct: idx === 0 })));

  $("round").textContent = `${state.i + 1}/${state.queue.length}`;
  $("score").textContent = state.score;
  $("streak").textContent = state.streak;
  $("diff").textContent = p.difficulty;
  $("diff").className = `badge ${p.difficulty}`;
  $("title").textContent = p.name;
  $("context").textContent = p.context;
  $("code").innerHTML = highlight(p.code);
  $("reveal").hidden = true;

  const list = $("options");
  list.innerHTML = "";
  state.order.forEach((opt, n) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.innerHTML = `<span class="key">${n + 1}</span><span>${esc(opt.text)}</span>`;
    b.addEventListener("click", () => answer(n));
    li.appendChild(b);
    list.appendChild(li);
  });
  window.scrollTo({ top: 0 });

  state.qStart = performance.now();
  stopTicker();
  tick();
  ticker = setInterval(tick, 100);
}

function answer(n) {
  if (state.answered) return;
  const ms = performance.now() - state.qStart;
  state.answered = true;
  state.lastMs = ms;
  state.totalMs += ms;
  stopTicker();
  tick();
  const p = state.queue[state.i];
  const picked = state.order[n];
  const buttons = $("options").querySelectorAll("button");

  let gained = 0;
  if (picked.correct) {
    gained = Math.round(POINTS[p.difficulty] * (1 + Math.min(state.streak, 4) * 0.25));
    state.score += gained;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }
  state.results.push({ title: `${p.name}: ${p.title}`, difficulty: p.difficulty, correct: picked.correct, ms });

  buttons.forEach((b, k) => {
    b.disabled = true;
    if (state.order[k].correct) b.classList.add("right");
    else if (k === n) b.classList.add("wrong");
  });

  const v = $("verdict");
  v.textContent = picked.correct ? `Correct. +${gained}` : "Not quite.";
  v.className = `verdict ${picked.correct ? "right" : "wrong"}`;
  $("bug").textContent = p.title;
  $("explain").textContent = p.explain;
  $("fix").innerHTML = highlight(p.fix);
  $("next").textContent = state.i + 1 < state.queue.length ? "Next" : "See results";
  $("reveal").hidden = false;
  $("score").textContent = state.score;
  $("streak").textContent = state.streak;
  $("reveal").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function next() {
  if (!state.answered) return;
  state.i += 1;
  if (state.i < state.queue.length) renderPuzzle();
  else finish();
}

function finish() {
  const right = state.results.filter((r) => r.correct).length;
  const best = loadBest();
  const isBest = state.score > best;
  if (isBest) saveBest(state.score);

  $("final").textContent = `${state.score} points`;
  $("summary").textContent =
    `${right} of ${state.results.length} correct, best streak ${state.bestStreak}.` +
    (isBest ? " New personal best." : best ? ` Personal best: ${best}.` : "");
  const times = state.results.map((r) => r.ms);
  $("endTotal").textContent = fmtClock(state.totalMs);
  $("endAvg").textContent = fmtSec(state.totalMs / times.length);
  $("endFast").textContent = fmtSec(Math.min(...times));
  $("endSlow").textContent = fmtSec(Math.max(...times));
  $("review").innerHTML = state.results
    .map((r) => `<li><span class="mark ${r.correct ? "ok" : "no"}">${r.correct ? "✓" : "✗"}</span>` +
      `<span>${esc(r.title)} <span class="muted">(${r.difficulty})</span></span>` +
      `<span class="time">${fmtSec(r.ms)}</span></li>`)
    .join("");
  show("end");
  window.scrollTo({ top: 0 });
}

function renderStart() {
  const best = loadBest();
  $("best").textContent = `${PUZZLES.length} puzzles, ${ROUND_SIZE} per round.` + (best ? ` Personal best: ${best}.` : "");
  show("start");
}

// ---------- wiring ----------
$("filters").addEventListener("click", (e) => {
  const f = e.target.closest("button")?.dataset.filter;
  if (f) start(f);
});
$("next").addEventListener("click", next);
$("again").addEventListener("click", renderStart);
document.addEventListener("keydown", (e) => {
  if (!$("end").hidden) {
    if (e.key === "Enter" && !e.repeat) { e.preventDefault(); renderStart(); }
    return;
  }
  if ($("play").hidden) return;
  if (!state.answered && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
  else if (state.answered && e.key === "Enter") { e.preventDefault(); next(); }
});

renderStart();
