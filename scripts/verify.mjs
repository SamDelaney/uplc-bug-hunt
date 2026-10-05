// Checks the puzzle bank and practice problems against the same wasm evaluator the site uses.
// Run from the repo root after building pkg/:  node scripts/verify.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import init, { evaluate, normalize, engine_version } from "../pkg/uplc_eval.js";
import { SITE_BUDGET } from "../js/evaluator.js";

const root = new URL("../", import.meta.url);
await init({ module_or_path: readFileSync(new URL("pkg/uplc_eval_bg.wasm", root)) });

const load = (file, name) => vm.runInThisContext(`${readFileSync(new URL(file, root), "utf8")}\n;${name}`);
const PUZZLES = load("data/puzzles.js", "PUZZLES");
const PROBLEMS = load("data/problems.js", "PROBLEMS");

const BUDGET = [SITE_BUDGET.cpu, SITE_BUDGET.mem]; // same cap the site applies per test
function run(source, args = []) {
  try {
    return JSON.parse(evaluate(source, JSON.stringify(args), ...BUDGET));
  } catch (e) {
    return { ok: false, stage: "crash", error: String(e) };
  }
}
const canon = (term) => {
  const n = JSON.parse(normalize(term));
  if (!n.ok) throw new Error(`bad expected term ${term}: ${n.error}`);
  return n.text;
};
// The pretty-printer wraps long values, so pull the hex out rather than slicing the text.
const hashOf = (fn, hex) => run(`(program 1.1.0 [ (builtin ${fn}) (con bytestring #${hex}) ])`).result.match(/#[0-9a-f]+/)[0];

// Expected outcome: "FAIL" (evaluation fails), "FAIL:<stage>", "NOT:<term>" (succeeds with
// anything else), or a term the result must equal.
function check(outcome, expect) {
  if (outcome.stage === "crash" || outcome.stage === "timeout") return false;
  if (expect === "FAIL") return !outcome.ok && outcome.stage === "eval";
  if (expect.startsWith("FAIL:")) return !outcome.ok && outcome.stage === expect.slice(5);
  if (expect.startsWith("NOT:")) return outcome.ok && outcome.result !== canon(expect.slice(4));
  return outcome.ok && outcome.result === canon(expect);
}

const H256 = hashOf("blake2b_256", "01"); // blake2b_256 of the CBOR for (I 1)
const H224 = hashOf("blake2b_224", "01");
const B28 = "#" + "ab".repeat(28);
const I = (n) => `(con integer ${n})`;
const BS = (h) => `(con bytestring ${h})`;
const T = "(con bool True)", F = "(con bool False)", U = "(con unit ())";

// id: [args, buggy code expectation, fix expectation]
const EXPECT = {
  "missing-force": [[I(5)], "FAIL", '(con string "small")'],
  "strict-branches": [[T], "FAIL", U],
  "free-variable": [[], "FAIL:scope", I(42)],
  "too-many-forces": [["(con (list integer) [1, 2])"], "FAIL", I(1)],
  "fstpair-one-force": [["(con (pair integer bytestring) (1, #00))"], "FAIL", I(1)],
  "string-not-bytes": [[BS("#a1b2c3")], "FAIL", T],
  "v2-returns-false": [["(con data (I 0))", "(con data (I 7))", "(con data (I 0))"], F, "FAIL"],
  "v3-returns-bool": [["(con data (I 0))"], T, U],
  "chooselist-strict": [["(con (list integer) [])"], "FAIL", I(0)],
  "y-combinator": [[], "FAIL", I(120)],
  "rem-vs-mod": [[I(-7)], F, T],
  "deadline-reversed": [[I(100), I(200)], F, T],
  "version-too-old": [[], "FAIL:version", I(8)],
  "case-missing-branch": [[], "FAIL", '(con string "Blue")'],
  "wrong-undata": [[], "FAIL", I(1000000)],
  "shadowed-owner": [[BS("#00"), BS("#0102")], T, F],
  "delayed-error-fine": [[], I(1), I(1)],
  "last-byte": [[BS("#0102")], "FAIL", I(2)],
  "divide-by-zero": [[I(10), I(0)], "FAIL", I(0)],
  "append-order": [[BS("#cafe")], BS("#cafe000643b0"), BS("#000643b0cafe")],
  "key-hash-length": [[BS(B28)], "FAIL", U],
  "datum-hash-algo": [["(con data (I 1))", BS(H256)], F, T],
  "missing-unidata": [["(con data (I 5))"], "FAIL", U],
  "mkcons-type": [[BS("#00")], "FAIL", "(con (list bytestring) [#00])"],
  "trace-partial": [["(con data (I 0))"], `NOT:${U}`, U],
  "choosedata-order": [["(con data (I 5))"], I(0), I(1)],
  "swapped-branches": [[T], "FAIL", U],
  "fence-post": [[I(2000000)], F, T],
  "ada-units": [[I(5)], T, F],
  "unconstr-pair": [["(con data (Constr 0 [I 1, I 2]))"], "FAIL", "(con data (I 1))"],
  "map-vs-list": [["(con data (Map []))"], "FAIL", T],
  "case-fields-fine": [[], I(7), I(7)],
  "missing-outer-force": [["(con data (I 0))"], `NOT:${U}`, U],
  "trace-order": [[], "FAIL", U],
  "exact-threshold": [[I(3)], "FAIL", U],
  "int-as-bool": [[I(1)], "FAIL", '(con string "on")'],
  "key-vs-hash": [[BS(H224), BS("#01")], F, T],
  "subtract-order": [[I(10), I(3)], I(-7), I(7)],
  "slice-args": [[BS("#000643b0cafe")], BS("#"), BS("#000643b0")],
  "validator-arg-order": [["(con data (I 42))", "(con data (I 7))", "(con data (I 0))"], U, "FAIL"],
  "endianness": [[I(1)], BS("#0100"), BS("#0001")],
  "lexicographic-compare": [[BS("#0100"), BS("#02")], T, F],
  "fee-rounding": [[I(150)], I(1), I(2)],
  "bool-constr-tag": [["(con data (Constr 1 []))"], F, T],
  "lam-two-params": [[I(2), I(3)], "FAIL:parse", I(5)],
  "paren-application": [[I(4)], "FAIL:parse", I(5)],
  "force-a-lam": [[T], "FAIL", I(1)],
  "partial-builtin-fine": [[], I(3), I(3)],
  "string-length": [['(con string "sundae")'], "FAIL", I(6)],
};

let failures = 0;
const report = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       ${detail}`}`);
};
const show = (o) => (o.ok ? o.result : `${o.stage}: ${o.error}`);

console.log(`engine: ${engine_version()}\n\n# puzzles`);
for (const p of PUZZLES) {
  const e = EXPECT[p.id];
  if (!e) { report(false, p.id, "no expectation in scripts/verify.mjs"); continue; }
  const [args, bugExp, fixExp] = e;
  const bug = run(p.code, args), fix = run(p.fix, args);
  report(check(bug, bugExp) && check(fix, fixExp), p.id,
    `bug: expected ${bugExp}, got ${show(bug)} | fix: expected ${fixExp}, got ${show(fix)}`);
}
for (const id of Object.keys(EXPECT)) if (!PUZZLES.some((p) => p.id === id)) report(false, id, "expectation for a puzzle that no longer exists");

console.log("\n# problems");
for (const p of PROBLEMS) {
  const outcomes = (src) => p.tests.map((t) => check(run(src, t.args), t.fails ? "FAIL" : t.expect));
  const ref = outcomes(p.reference), starter = outcomes(p.starter);
  report(ref.every(Boolean), `${p.id}: reference passes`, `tests passing: ${ref.map((b) => (b ? "y" : "n")).join("")}`);
  report(!starter.every(Boolean), `${p.id}: starter does not already pass`, "the starter code solves the problem");
}

console.log("\n# runaway programs end as out-of-budget, not a crash");
const omega = run("(program 1.1.0 [ (lam x [ x x ]) (lam x [ x x ]) ])");
report(omega.stage === "eval" && !omega.ok, "omega loop", show(omega));

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
