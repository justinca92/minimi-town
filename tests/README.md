# Dev tests (not shipped)

Runs the built plugin with real React in headless Chromium against stubbed Decky/Steam globals (`entry.js`).

    bun build tests/entry.js --outdir tests/out --format esm --define 'process.env.NODE_ENV="production"'
    bun build/build.ts && cp dist/index.js tests/out/plugin.js
    python3 tests/flow.py   # ◀▶, ▲ ignored, R1 → sections, ▲ back, L1 → search, Ⓐ → RunGame → game ends → back; unload cleanup; panel

`tests/out/` also needs `index.html` and some `head*.png` / `hero*.png` art (see flow.py).
