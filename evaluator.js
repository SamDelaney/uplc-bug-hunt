// Main-thread client for evaluator-worker.js. Calls are queued one at a time; a crash or a
// timeout terminates the worker and the next call starts a fresh one.
// Per-test budget: a tenth of a mainnet transaction's (10B CPU, 14M memory). The machine's
// continuation stack is a linked list that Rust frees recursively when a run stops, and in a
// browser worker that overflows the native stack somewhere between 3M and 5M memory of deep
// recursion (measured in Chromium, 2026-09-29). Depth is bounded by memory spent, so this cap
// keeps runaway programs ending as "out of budget" instead of a crash.
const SITE_BUDGET = { cpu: 1_000_000_000, mem: 1_400_000 };
const TIMEOUT_MS = 15_000;

class Evaluator {
  constructor() {
    this.worker = null;
    this.nextId = 1;
    this.queue = Promise.resolve();
  }

  spawn() {
    this.worker = new Worker(new URL("./evaluator-worker.js", import.meta.url), { type: "module" });
  }

  reset() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }

  call(message) {
    const run = () =>
      new Promise((resolve) => {
        if (!this.worker) this.spawn();
        const id = this.nextId++;
        const worker = this.worker;
        const done = (value) => {
          clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          resolve(value);
        };
        const onMessage = ({ data }) => {
          if (data.id !== id) return;
          if (data.crash !== undefined) {
            this.reset();
            done({ ok: false, stage: "crash", error: `evaluator crashed: ${data.crash}` });
          } else done(data.out);
        };
        const onError = (e) => {
          this.reset();
          done({ ok: false, stage: "crash", error: `evaluator failed to load: ${e.message || "unknown error"}` });
        };
        const timer = setTimeout(() => {
          this.reset();
          done({ ok: false, stage: "timeout", error: `no result after ${TIMEOUT_MS / 1000}s` });
        }, TIMEOUT_MS);
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.postMessage({ id, ...message });
      });
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  evaluate(source, args = [], budget = SITE_BUDGET) {
    return this.call({ op: "evaluate", source, args, cpu: budget.cpu, mem: budget.mem });
  }

  normalize(term) {
    return this.call({ op: "normalize", term });
  }

  version() {
    return this.call({ op: "version" });
  }
}

export const evaluator = new Evaluator();
export { SITE_BUDGET };

// Runs every test of a problem against `source`. Returns per-test results plus totals.
export async function judge(problem, source) {
  const results = [];
  for (const test of problem.tests) {
    const run = await evaluator.evaluate(source, test.args);
    let pass;
    let expected;
    if (test.fails) {
      expected = "evaluation fails";
      pass = !run.ok && run.stage === "eval";
    } else {
      const norm = await evaluator.normalize(test.expect);
      expected = norm.ok ? norm.text : test.expect;
      pass = run.ok && run.result === expected;
    }
    results.push({ test, run, expected, pass });
    // Parse, scope and version errors are the same for every test; no point repeating them.
    if (["parse", "scope", "version", "crash"].includes(run.stage)) break;
  }
  const passed = results.filter((r) => r.pass).length;
  const all = passed === problem.tests.length;
  const sum = (k) => results.reduce((n, r) => n + (r.run[k] || 0), 0);
  return { results, passed, all, cpu: sum("cpu"), mem: sum("mem"), size: results[0]?.run.size ?? null };
}
