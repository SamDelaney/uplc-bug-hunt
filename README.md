# UPLC Bug Hunt

Two ways to practise Untyped Plutus Core:

- **Quiz** (`index.html`): each round shows a UPLC snippet and what it was meant to do, and you pick what's wrong with it. After each answer you get an explanation and a fixed version of the code.
- **Coding challenges** (`practice.html`): leetcode-style problems. You write the UPLC; it runs in your browser against each problem's tests, and a passing solution is ranked by its CPU and memory costs and its script size against a reference solution.

Programs are evaluated by Aiken's `uplc` crate (1.1.21), compiled to WebAssembly and run in a Web Worker. No server is involved.

Serve the folder to try it locally (module workers don't load from `file://`):

```
python -m http.server 5178
```

## Layout

```
index.html, practice.html   the two pages
style.css                   styles, with light and dark themes
social-preview.png          link-preview image (og:image)
js/                         hand-written browser code
data/                       quiz puzzles and practice problems
pkg/                        the built evaluator (generated, committed)
evaluator/                  Rust source for pkg/, with its build script
scripts/                    checks and tooling that run under Node, not in the browser
.github/workflows/          the GitHub Pages deploy
```

The pages, `style.css` and `social-preview.png` stay at the root because their URLs are public: the pages are what people link to, and the `og:image` tags point at the image by absolute URL.

`js/`:

- `game.js`: the quiz's game loop, timers and scoring.
- `practice.js`: the challenges page (problem list, editor, results, best scores).
- `evaluator.js`: the main-thread client for the worker. Also holds `judge()`, which runs a problem's tests, and `SITE_BUDGET`.
- `evaluator-worker.js`: the Web Worker that loads `pkg/` and runs the wasm.
- `highlight.js`: UPLC syntax highlighting, shared by both pages.
- `report.js`: the "Report an issue" links. They open a new GitHub issue with the puzzle or problem (and, on the challenges page, your code) filled in; nothing is sent until you submit it on GitHub. The repo URL is the constant at the top of the file.

`data/`:

- `puzzles.js`: the quiz's puzzle bank. In each entry the first option is the correct one; options are shuffled when shown.
- `problems.js`: practice problems, each with a statement, starter code, tests and a reference solution.

## Toolchain

There is no bundler, no `package.json` and no npm dependency. The browser loads the files in `js/` and `data/` exactly as they are written.

| Tool | Version | Used for | Needed when |
| --- | --- | --- | --- |
| Any static file server | | Serving the folder locally | Running the site |
| Node | 22 in CI | `scripts/verify.mjs` | Changing puzzles, problems or the evaluator |
| Rust | 1.86, pinned in `evaluator/rust-toolchain.toml` | Compiling the evaluator to `wasm32-unknown-unknown` | Changing `evaluator/` |
| `wasm-bindgen` CLI | 0.2.100, must match the crate in `Cargo.toml` | Turning the compiled `.wasm` into the `pkg/` bundle | Changing `evaluator/` |
| clang, or Zig through `pip install ziglang` | | Compiling `blst` (C) for wasm32 | Changing `evaluator/` |
| Headless Edge or Chrome | | Rendering `social-preview.png` | Changing the preview image |
| GitHub Actions | | Running the checks and publishing to Pages | Every push to `main` |

Most changes (a new puzzle, a style fix, page logic) need only a file server and Node. The Rust half is needed only to change the evaluator itself, because its output is committed. [`evaluator/README.md`](evaluator/README.md) covers that build.

## How it fits together

### From Rust to the browser

```
evaluator/src/lib.rs
   │  cargo build --release --target wasm32-unknown-unknown
   ▼
evaluator/target/wasm32-unknown-unknown/release/uplc_eval.wasm
   │  wasm-bindgen --target web
   ▼
pkg/uplc_eval.js + pkg/uplc_eval_bg.wasm        (committed)
   │  import
   ▼
js/evaluator-worker.js                           (Web Worker)
   ▲  postMessage
   │
js/evaluator.js                                  (main thread)
   ▲  import
   │
js/practice.js
```

`evaluator/build.sh` runs the first two steps. `pkg/uplc_eval.js` is the glue `wasm-bindgen` generates: it fetches `uplc_eval_bg.wasm` from next to itself and exports three functions, `evaluate`, `normalize` and `engine_version`. All three take and return plain strings (JSON for structured results), so a failed evaluation comes back as a value and not as an exception.

### On the challenges page

1. `practice.html` loads `highlight.js`, `report.js` and `data/problems.js` as classic scripts, then `practice.js` as a module.
2. `practice.js` imports `evaluator.js`. The first call creates the worker, which imports `pkg/uplc_eval.js` and loads the wasm.
3. Pressing Run calls `judge(problem, source)`. For each test it sends the worker an `evaluate` message with the source, the test's arguments and the budget. The wasm parses the program, applies the arguments, evaluates it and returns the result, the CPU and memory spent, any trace logs and the script's flat-encoded size.
4. `judge()` sends the expected term through `normalize` so both sides are compared in the same pretty-printed form. A test marked `fails: true` passes only if evaluation fails.
5. The problem's reference solution goes through the same `judge()` when the problem is opened. Its totals are what a passing submission is compared with.

Calls to the worker are queued one at a time. If the wasm traps, or a call passes 15 seconds, `evaluator.js` terminates the worker and the next call starts a fresh one.

### On the quiz page

The quiz does not run the evaluator in the browser. `index.html` loads `highlight.js`, `report.js`, `data/puzzles.js`, `data/problems.js` and `game.js` as classic scripts, and `game.js` checks an answer by position: the first option in each puzzle is the right one. (`problems.js` is loaded only to show how many challenges you've solved.) What keeps the puzzles honest is `scripts/verify.mjs`, below.

### Classic scripts and modules

`highlight.js`, `report.js`, `game.js` and the two `data/` files are classic scripts that share globals (`PUZZLES`, `PROBLEMS`, `highlight`, `esc`, `bindReport`), so the order of the `<script>` tags in the HTML matters. `practice.js`, `evaluator.js` and `evaluator-worker.js` are ES modules. `practice.js` reads the same globals, which works because module scripts run after the classic ones.

### Stored in the browser

Everything a player keeps lives in `localStorage` and nowhere else: the quiz's best score (`uplc-bug-hunt-best`), and under the `uplc-practice:` prefix the drafts, best costs per problem, the last problem opened and which difficulty groups are collapsed. Both pages work without storage.

## What the evaluator adds on top of `uplc`

- **Version check.** `uplc`'s parser accepts `constr` and `case` in a 1.0.0 program; the reference Plutus parser rejects them, so the wrapper does too.
- **Budget cap.** Each test gets a tenth of a mainnet transaction's budget (1B CPU, 1.4M memory). When a run stops, `uplc` frees its continuation stack recursively, and in a browser worker deep recursion under the full mainnet budget overflows the native stack (measured in Chromium: fine up to 3M memory, crashing from 5M). The cap keeps runaway programs ending as "out of budget". See `SITE_BUDGET` in `js/evaluator.js`.
- **Crash isolation.** If the wasm traps anyway, or a run passes 15 seconds, the page discards the worker and starts a fresh one.

## Checking puzzles and problems

```
node scripts/verify.mjs
```

This runs every quiz puzzle (its buggy code and its fix) and every practice problem (the reference must pass all tests, and the starter must not) through the same wasm build and budget the site uses. It imports `pkg/uplc_eval.js` directly, with no worker, and takes `SITE_BUDGET` from `js/evaluator.js`. The `data/` files are classic scripts with no exports, so it reads them with `node:vm`.

Each puzzle has a row in the script's `EXPECT` table: the arguments to apply, what the buggy code must do and what the fix must do. A puzzle with no row fails the check, and so does a row with no puzzle.

## Deploying

`.github/workflows/pages.yml` publishes to GitHub Pages on every push to `main` (or by hand from the Actions tab). It runs `scripts/verify.mjs` first and stops if anything fails. Then it copies only what the pages load: the two HTML files, `style.css`, `social-preview.png`, `js/`, `data/` and the two runtime files from `pkg/`. CI doesn't install Rust; it publishes the committed `pkg/`. So a change to `evaluator/` reaches the site only once `pkg/` has been rebuilt and committed.

All paths are relative, so the site works under `https://<user>.github.io/<repo>/`.

If the first run fails on permissions, set **Settings → Pages → Source** to **GitHub Actions** once and re-run the workflow.

## Adding content

To add a puzzle, append an object to `PUZZLES` in `data/puzzles.js` with `id`, `name` (shown while answering, so it must not hint at the bug), `title` (the bug's name, shown after answering), `difficulty` (`easy`/`medium`/`hard`), `context`, `code`, `options`, `explain` and `fix`. Then add its row to `EXPECT` in `scripts/verify.mjs`.

To add a problem, append to `PROBLEMS` in `data/problems.js` with `id`, `title`, `difficulty`, `statement`, `starter`, `tests` (each `{ args, expect }` or `{ args, fails: true }`, where `args` and `expect` are UPLC terms) and `reference`. Problems need no `EXPECT` row; their own tests are the check.

## The preview image

`social-preview.png` is the image both pages point to in their `og:image` tags. Its source is `scripts/social-preview.html`. Re-render it with headless Edge or Chrome:

```
msedge --headless=new --hide-scrollbars --window-size=1280,640 --screenshot=social-preview.png scripts/social-preview.html
```

The tags use the absolute GitHub Pages URL, so update them if the site moves.
