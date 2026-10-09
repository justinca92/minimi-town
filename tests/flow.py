# Dev test (not shipped): runs the built plugin with real React against
# stubbed Decky/Steam globals (tests/entry.js) and checks the home flow.
#   bun build tests/entry.js --outdir tests/out --format esm --define 'process.env.NODE_ENV="production"'
#   bun build/build.ts && cp dist/index.js tests/out/plugin.js && python3 tests/flow.py
import asyncio, functools, http.server, os, sys, threading
from playwright.async_api import async_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
H = functools.partial(Q, directory=OUT)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8771), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

FLOW = """async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fsx = () => [...document.querySelectorAll('[data-focusable]')];
  const town = () => fsx().find((e) => e.__props?.onOptionsButton);
  const sec = fsx().find((e) => e.__props?.onButtonDown && e.__props?.onGamepadDirection && !e.__props?.onOptionsButton);
  const box = town().closest('[data-minimi-town]').parentElement.parentElement;
  const ev = (button, extra = {}) => ({ detail: { button, ...extra }, preventDefault() { this.p = true; }, stopPropagation() {} });
  const log = [];
  const hud = () => document.querySelector('[data-minimi-town]').innerText.split('\\n').slice(0, 4).join(' / ');
  log.push(['HUD at start', hud()]);
  town().__props.onGamepadDirection(ev(12)); town().__props.onGamepadDirection(ev(12)); await sleep(300);
  log.push(['▶▶ HUD', hud()]);
  const up = ev(9); town().__props.onGamepadDirection(up); log.push(['▲ on street consumed, no nav', !!up.p, window.__nav ?? 'none', box.style.top]);
  await sleep(600);
  town().__props.onButtonDown(ev(6)); await sleep(500); log.push(['R1 → sections', box.style.top]);
  await sleep(900);
  sec.__props.onGamepadDirection(ev(9)); await sleep(500); log.push(['▲ at top → town', box.style.top]);
  await sleep(700);
  document.activeElement?.blur?.();
  town().__props.onButtonDown(ev(5)); await sleep(50); log.push(['L1 → search focused', document.activeElement?.tagName]);
  // Ⓐ: the penguin walks in, then RunGame
  town().__props.onOKButton(); await sleep(4500);
  log.push(['Ⓐ → RunGame', JSON.stringify(window.__runs)]);
  log.push(['lifetime registered', typeof window.__life]);
  window.__life?.({ unAppID: Number(window.__runs[0]?.[0]), bRunning: true }); await sleep(300);
  window.__life?.({ unAppID: Number(window.__runs[0]?.[0]), bRunning: false }); await sleep(2800);
  log.push(['game ended → HUD back', hud()]);
  return log;
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        for theme in ["town", "neon"]:
            pg = await b.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(f"http://127.0.0.1:8771/#{theme}")
            await pg.wait_for_function("window.__start")
            await pg.evaluate("window.__start()")
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=os.path.join(OUT, f"home_{theme}.png"))
            if theme == "town":
                for row in await pg.evaluate(FLOW):
                    print(" | ".join(str(x) for x in row))
                await pg.screenshot(path=os.path.join(OUT, "after_flow.png"))
                # unload: nothing of ours may stay in Steam's DOM
                left = await pg.evaluate("""() => { window.__plugin.onDismount(); return [document.querySelectorAll('[data-minimi-spacer]').length, document.getElementById('minimi-clear-header-style') ? 1 : 0] }""")
                print("after unload: spacers, injected style =", left)
            await pg.close()
        # Quick Access panel renders
        pg = await b.new_page(viewport={"width": 400, "height": 900})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://127.0.0.1:8771/#qam")
        await pg.wait_for_function("window.__start")
        await pg.evaluate("window.__start()")
        await pg.wait_for_timeout(800)
        labels = await pg.evaluate("[...document.querySelectorAll('[data-label]')].map(e=>e.dataset.label)")
        print("panel:", labels)
        print("pageerrors:", errs)
        await b.close()
    srv.shutdown()

asyncio.run(main())
