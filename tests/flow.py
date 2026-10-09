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
  const dn = ev(10); town().__props.onGamepadDirection(dn); await sleep(400); log.push(['▼ on street: no switch', !!dn.p, box.style.left]);
  const up = ev(9); town().__props.onGamepadDirection(up); log.push(['▲ on street consumed, no nav', !!up.p, window.__nav ?? 'none', box.style.left]);
  await sleep(600);
  const r1 = ev(6); town().__props.onButtonDown(r1); await sleep(400); log.push(['R1 does nothing now', box.style.left]);
  town().__props.onButtonDown(ev(8)); await sleep(500); log.push(['R2 → sections slide in from the right', box.style.left, 'top stays', box.style.top]);
  await sleep(900);
  const row2b = [...document.querySelectorAll('button')].find((b) => b.textContent === 'row2'); row2b.focus();
  const b1 = ev(2); sec.__props.onButtonDown(b1); await sleep(50); log.push(['Ⓑ deep → to top', document.activeElement?.textContent, 'consumed', !!b1.p, box.style.left]);
  const b2 = ev(2); sec.__props.onButtonDown(b2); log.push(['Ⓑ at top → Steam (not consumed)', !b2.p, box.style.left]);
  const ups = ev(9); sec.__props.onGamepadDirection(ups); await sleep(500); log.push(['▲ at top of sections: stays', box.style.left, 'consumed', !!ups.p]);
  const l2 = ev(7); sec.__props.onButtonDown(l2); await sleep(500); log.push(['L2 → back to street', box.style.left, 'consumed', !!l2.p]);
  await sleep(700);
  await sleep(700);
  document.activeElement?.blur?.();
  town().__props.onButtonDown(ev(7)); await sleep(50); log.push(['L2 → search focused', document.activeElement?.tagName]);
  // Ⓐ: the penguin walks in, then the game's page opens (nothing starts by itself)
  window.__nav = null;
  town().__props.onOKButton(); await sleep(4500);
  log.push(['Ⓐ → game page, no RunGame', window.__nav, JSON.stringify(window.__runs)]);
  // the page covers the home (hidden), then Ⓑ back: the penguin steps out, same game selected
  const root = document.querySelector('[data-minimi-root]'); root.style.display = 'none'; await sleep(300);
  root.style.display = ''; await sleep(2200);
  log.push(['back from page → HUD', hud()]);
  return log;
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        for theme in ["town", "neon", "skew"]:
            pg = await b.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append(str(e)))
            if theme == "skew":
                await pg.add_init_script("{const pn=performance.now.bind(performance);performance.now=()=>pn()+5e6}")
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
