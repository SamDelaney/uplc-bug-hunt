# The evaluator

A small Rust crate (`uplc-eval`) around Aiken's `uplc` crate, compiled to WebAssembly. Its build output is `../pkg/`, which is committed, so the site has no build step. Rebuild only when something in this folder changes.

The [root README](../README.md) explains how the pages use the result.

## Building

```
evaluator/build.sh
```

The script does two things:

1. `cargo build --release --target wasm32-unknown-unknown`, which writes `target/wasm32-unknown-unknown/release/uplc_eval.wasm`.
2. `wasm-bindgen --target web --out-dir ../pkg --out-name uplc_eval`, which turns that file into the bundle the browser loads.

Afterwards, run `node scripts/verify.mjs` from the repo root and commit `pkg/` with the source change. The deploy publishes the committed `pkg/` and never builds it.

## What you need

- **Rust, through rustup.** `rust-toolchain.toml` pins 1.86 and the `wasm32-unknown-unknown` target, so rustup installs both the first time cargo runs here.
- **The `wasm-bindgen` CLI at 0.2.100.** The CLI and the `wasm-bindgen` crate in `Cargo.toml` have to be the same version. If the CLI is missing or a different version, `build.sh` stops and prints the install command.
- **A C compiler that targets wasm32.** `uplc` depends on `blst`, which is C. clang works. With no clang installed, `pip install ziglang` is enough: the script points `CC_wasm32_unknown_unknown` and `AR_wasm32_unknown_unknown` at the shims in `tools/`.

On Windows, run the script from Git Bash. Without Visual Studio Build Tools (no `cl.exe` on the path) it builds with the `1.86-x86_64-pc-windows-gnu` toolchain, because that one bundles its own linker for the host build scripts. Installing the `wasm-bindgen` CLI on such a machine also needs a host C compiler, and the command the script prints uses the same Zig shims for it.

## Files

- `src/lib.rs`: the whole wrapper. It exports `evaluate`, `normalize` and `engine_version`.
- `Cargo.toml`: `uplc` and `wasm-bindgen` are pinned exactly. The evaluator is the judge, so an upgrade is a deliberate change: re-run `scripts/verify.mjs` against the new version first, and update the string in `engine_version()`. The release profile optimises for size (`opt-level = "s"`, LTO, one codegen unit); the wasm comes out a little under 1 MB.
- `Cargo.lock`: committed, so a rebuild resolves the same dependency versions.
- `rust-toolchain.toml`: the pinned compiler and target.
- `.cargo/config.toml`: two settings. The resolver falls back to dependency versions that still build on 1.86. The wasm stack is raised from the 1 MB default to 16 MB, because freeing a long environment chain recurses.
- `build.sh`: the build described above.
- `tools/zcc.py`, with `zcc.sh`/`zcc.cmd` and `zar.sh`/`zar.cmd`: the Zig stand-ins for `cc` and `ar`. The `cc` crate passes LLVM target triples and `zig cc` wants its own names, so `zcc.py` translates them and forwards everything else.
- `target/`: cargo's build output, hundreds of MB, ignored by git.

## What ends up in `pkg/`

- `uplc_eval_bg.wasm`: the compiled evaluator.
- `uplc_eval.js`: the generated ES module that loads the wasm and exports the three functions.
- `uplc_eval.d.ts`, `uplc_eval_bg.wasm.d.ts`: generated type declarations. Nothing uses them and the deploy leaves them out.

## The interface

Every function takes and returns strings, so the JavaScript side needs no serde glue and a failure never escapes as an exception.

- `evaluate(source, args_json, cpu, mem)`: parses `source`, applies each term in `args_json` (a JSON array of UPLC term strings) in order, and evaluates under the given budget. Returns JSON `{ ok, stage, result, error, cpu, mem, logs, size }`. `stage` says where a failure happened: `args`, `parse`, `version`, `scope` or `eval`. `size` is the flat-encoded size in bytes of the program as written, before the arguments are applied.
- `normalize(term)`: parses a term and pretty-prints it, so an expected answer can be compared with a result in the same form. Returns JSON `{ ok, text, error }`.
- `engine_version()`: the `uplc` version string shown on the challenges page.

`getrandom` is listed with its `js` feature only because `uplc`'s dependencies pull it in and the browser build needs that backend. Evaluation never asks for randomness.
