/* tslint:disable */
/* eslint-disable */
/**
 * Version of the `uplc` crate doing the evaluating (kept in step with Cargo.toml).
 */
export function engine_version(): string;
/**
 * Parse, apply `args_json` (a JSON array of UPLC term strings) and evaluate.
 *
 * Returns JSON: `{ ok, stage, result, error, cpu, mem, logs, size }`. `stage` names where a
 * failure happened: `args`, `parse`, `version`, `scope` or `eval`. `size` is the flat-encoded
 * size in bytes of the program as written, before arguments are applied.
 */
export function evaluate(source: string, args_json: string, cpu: number, mem: number): string;
/**
 * Parse a term and pretty-print it, so expected answers can be compared in canonical form.
 * Returns JSON: `{ ok, text, error }`.
 */
export function normalize(term: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly engine_version: () => [number, number];
  readonly evaluate: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly normalize: (a: number, b: number) => [number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
