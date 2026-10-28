# Vacancy

*A Topanga Tycoon.* A browser isometric mall tycoon based on Westfield Topanga and Topanga Village. The whole game is one self-contained file, `index.html`. Fan project, no logos.

## Play it locally

```
git checkout integration && git pull
npm start          # http://localhost:8000  (PORT=9000 npm start to change it)
```

No install step. Without Node, `python3 -m http.server 8000` works too. Opening `index.html` directly also works. Add `?debug` to the URL for the `window.__tt` test hook.

## Branch workflow

- `main` is the stable branch. Nothing merges into it automatically.
- `integration` is where all development lands. Every Claude PR targets `integration`.
- When the CI check passes, the PR is squash-merged into `integration` automatically (`.github/workflows/auto-merge-integration.yml`).
- To try the latest work, pull `integration` and run it locally.
- When a round of development is done, open a PR from `integration` into `main` and merge it yourself.

The `create-integration` workflow creates `integration` from `main` the first time `main` is pushed.

## Layout

- `index.html` the game (v0.5)
- `scripts/serve.js` local static server
- `scripts/check.js` CI check (file loads, inline scripts parse)
