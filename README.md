# UPLC Bug Hunt

Two ways to practise Untyped Plutus Core:

- **Quiz** (`index.html`): each round shows a UPLC snippet and what it was meant to do, and you pick what's wrong with it. After each answer you get an explanation and a fixed version of the code.
- **Coding challenges** (`practice.html`): leetcode-style problems. You write the UPLC; it runs in your browser against each problem's tests, and a passing solution is ranked by its CPU and memory costs and its script size against a reference solution.

Programs are evaluated by Aiken's `uplc` crate (1.1.21), compiled to WebAssembly and run in a Web Worker. No server is involved.

Serve the folder to try it locally (module workers don't load from `file://`):

```
python -m http.server 5178
```

## The evaluator

`evaluator/` is a small Rust crate around `uplc`. Its build output, `pkg/`, is committed, so the site itself has no build step. Rebuild only when the crate changes:

```
evaluator/build.sh
```

That needs the Rust toolchain (the pinned 1.86 is picked up from `rust-toolchain.toml`), the `wasm-bindgen` CLI at the version pinned in `Cargo.toml`, and a C compiler that targets wasm32, because `blst` is C. With no clang installed, `pip install ziglang` is enough: the script falls back to Zig through `evaluator/tools/zcc.py`. On Windows without Visual Studio it builds with the GNU toolchain instead, since that one bundles its own linker. The script prints the exact `wasm-bindgen` install command if it's missing.

Things the wrapper adds on top of `uplc`:

- **Version check.** `uplc`'s parser accepts `constr` and `case` in a 1.0.0 program; the reference Plutus parser rejects them, so the wrapper does too.
- **Budget cap.** Each test gets a tenth of a mainnet transaction's budget (1B CPU, 1.4M memory). When a run stops, `uplc` frees its continuation stack recursively, and in a browser worker deep recursion under the full mainnet budget overflows the native stack (measured in Chromium: fine up to 3M memory, crashing from 5M). The cap keeps runaway programs ending as "out of budget". See `SITE_BUDGET` in `evaluator.js`.
- **Crash isolation.** If the wasm traps anyway, or a run passes 15 seconds, the page discards the worker and starts a fresh one.

## Checking puzzles and problems

```
node scripts/verify.mjs
```

This runs every quiz puzzle (its buggy code and its fix) and every practice problem (the reference must pass all tests, and the starter must not) through the same wasm build and budget the site uses. The deploy workflow runs it first and stops if anything fails. When you add a puzzle, add its expected outcomes to the `EXPECT` table in that script.

## Deploying

`.github/workflows/pages.yml` publishes to GitHub Pages on every push to `main` (or by hand from the Actions tab). It runs the checks above, then copies only the site files. All paths are relative, so the site works under `https://<user>.github.io/<repo>/`.

If the first run fails on permissions, set **Settings → Pages → Source** to **GitHub Actions** once and re-run the workflow.

## Files

- `puzzles.js`: the quiz's puzzle bank. In each entry the first option is the correct one; options are shuffled when shown.
- `problems.js`: practice problems, each with a statement, starter code, tests and a reference solution.
- `game.js`: the quiz's game loop and scoring.
- `practice.js`: the practice page.
- `evaluator.js`, `evaluator-worker.js`: the main-thread client and the worker that runs the wasm.
- `highlight.js`: UPLC syntax highlighting, shared by both pages.
- `style.css`: styles, with light and dark themes.
- `social-preview.png`: the link-preview image both pages point to in their `og:image` tags. Its source is `scripts/social-preview.html`; re-render with headless Edge or Chrome: `msedge --headless=new --hide-scrollbars --window-size=1280,640 --screenshot=social-preview.png scripts/social-preview.html`. The tags use the absolute GitHub Pages URL, so update them if the site moves.

To add a puzzle, append an object to `PUZZLES` with `id`, `name` (shown while answering, so it must not hint at the bug), `title` (the bug's name, shown after answering), `difficulty` (`easy`/`medium`/`hard`), `context`, `code`, `options`, `explain` and `fix`.

To add a problem, append to `PROBLEMS` with `id`, `title`, `difficulty`, `statement`, `starter`, `tests` (each `{ args, expect }` or `{ args, fails: true }`, where `args` and `expect` are UPLC terms) and `reference`.
