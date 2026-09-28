# UPLC Bug Hunt

A quiz game: each round shows an Untyped Plutus Core snippet and what it was meant to do, and you pick what's wrong with it. After each answer you get an explanation and a fixed version of the code.

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5178
```

## Deploying

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main` (or by hand from the Actions tab). It copies only the four site files, so the README and workflow aren't published. All paths are relative, so the game works under `https://<user>.github.io/<repo>/`.

First time, from this folder:

```
gh repo create uplc-bug-hunt --public --source . --push
```

The workflow turns Pages on for the repo itself (`enablement: true`). If that step fails on permissions, set **Settings → Pages → Source** to **GitHub Actions** once and re-run the workflow.

## Files

- `puzzles.js`: the puzzle bank. In each entry the first option is the correct one; options are shuffled when shown.
- `game.js`: game loop, scoring and a small UPLC syntax highlighter.
- `style.css`: styles, with light and dark themes.

To add a puzzle, append an object to `PUZZLES` with `id`, `name` (shown while answering, so it must not hint at the bug), `title` (the bug's name, shown after answering), `difficulty` (`easy`/`medium`/`hard`), `context`, `code`, `options`, `explain` and `fix`.
