// Runs the wasm evaluator off the main thread. A wasm trap (panic, stack overflow) leaves the
// module unusable, so on any thrown error the worker reports a crash and the page replaces it.
import init, { evaluate, normalize, engine_version } from "./pkg/uplc_eval.js";

const ready = init();

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    await ready;
    let out;
    if (op === "evaluate") out = JSON.parse(evaluate(data.source, JSON.stringify(data.args), data.cpu, data.mem));
    else if (op === "normalize") out = JSON.parse(normalize(data.term));
    else if (op === "version") out = engine_version();
    else throw new Error(`unknown op ${op}`);
    self.postMessage({ id, out });
  } catch (e) {
    self.postMessage({ id, crash: String(e && e.message ? e.message : e) });
  }
};
