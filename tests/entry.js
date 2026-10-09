import * as React from "/opt/npm-tools/node_modules/react/index.js";
import * as ReactDOMClient from "/opt/npm-tools/node_modules/react-dom/client.js";
let patchFn;
window.SP_REACT = React;
const h = React.createElement;
const B = { OK: 1, CANCEL: 2, SECONDARY: 3, OPTIONS: 4, BUMPER_LEFT: 5, BUMPER_RIGHT: 6, TRIGGER_LEFT: 7, TRIGGER_RIGHT: 8, DIR_UP: 9, DIR_DOWN: 10, DIR_LEFT: 11, DIR_RIGHT: 12, START: 14, LPAD_TOUCH: 19, LPAD_CLICK: 20, RPAD_TOUCH: 21, RPAD_CLICK: 22 };
window.__focusables = [];
function Focusable(props) {
  if (location.hash === "#crash" && props.onOptionsButton) throw new Error("simulated Steam change");
  const { children, style, onGamepadDirection, onButtonDown, onButtonUp, onOKButton, onOptionsButton, onMenuButton, onCancelButton, onGamepadFocus, onGamepadBlur, autoFocus, noFocusRing, "flow-children": fc, ...rest } = props;
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current.__props = props; });
  return h("div", { ref, style, tabIndex: 0, "data-focusable": "", ...rest }, children);
}
const comp = (n) => (p) => h("div", { "data-c": n, "data-label": typeof p.label === "string" ? p.label : undefined, "data-desc": typeof p.description === "string" ? p.description : undefined }, p.children);
window.DFL = { Focusable, GamepadButton: B, Navigation: { Navigate: (p) => (window.__nav = p), NavigateBack() {}, CloseSideMenus() {} },
  ButtonItem: comp("ButtonItem"), DialogButton: comp("DialogButton"), DropdownItem: comp("DropdownItem"), PanelSection: comp("PanelSection"), PanelSectionRow: comp("PanelSectionRow"),
  SliderField: comp("SliderField"), TextField: comp("TextField"), ToggleField: comp("ToggleField"), ModalRoot: comp("ModalRoot"), staticClasses: {}, showContextMenu() {}, showModal() {} };
// Decky's RouterHook: patches per path in a Set (run in registration order),
// add/remove re-render the router (DeckyRouterState.notifyUpdate).
const routerState = { _routePatches: new Map(), bus: new EventTarget(), version: 0 };
window.__routerHook = {
  routerState,
  addRoute: (p, c) => (window.__routeComp = c),
  removeRoute() {},
  addPatch(p, f) { if (!routerState._routePatches.has(p)) routerState._routePatches.set(p, new Set()); routerState._routePatches.get(p).add(f); patchFn = f; routerState.version++; routerState.bus.dispatchEvent(new Event("update")); return f; },
  removePatch(p, f) { routerState._routePatches.get(p)?.delete(f); routerState.version++; routerState.bus.dispatchEvent(new Event("update")); },
};
window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit = { connect: () => ({ call: async (m) => (m === "get_settings" ? { ...(location.hash.endsWith("-off") ? { homeEnabled: false } : {}), ...(location.hash.startsWith("#bottom") ? { layout: "bottom", subtitleText: "Steam Deck OLED · 1TB" } : {}), ...(location.hash.includes("legacy") ? { heroV130: true } : {}), ...(location.hash.includes("qam-bottom") ? { layout: "bottom" } : {}), theme: location.hash.includes("neon") ? "neon" : "town", infoStyle: location.hash.includes("sign") ? "sign" : location.hash.includes("tag") ? "tag" : "top", sky: "day", soundEnabled: false, funSounds: false, language: "ko" } : true), routerHook: window.__routerHook } ) };
const now = Math.floor(Date.now() / 1000), D = 86400;
const names = ["Hades", "스타듀 밸리", "Celeste", "Elden Ring", "Hollow Knight", "Balatro", "디아블로 IV", "Vampire Survivors", "Portal 2", "Dead Cells", "Slay the Spire", "하데스 II"];
const apps = Array.from({ length: 30 }, (_, i) => ({ appid: 100 + i, app_type: 1, display_name: names[i % 12] + (i >= 12 ? " " + i : ""),
  installed: i % 6 !== 4, rt_last_time_played: [now - 2 * D, 0, now - 300 * D, now - 20 * D, now - 3 * D, now - 40 * D][i % 6], minutes_playtime_forever: [142 * 60, 0, 236 * 60, 5 * 60, 30, 527 * 60][i % 6],
  local_per_client_data: i === 3 ? { status_percentage: 42, bytes_to_download: 1000, bytes_downloaded: 420 } : {} }));
window.collectionStore = { GetCollection: () => ({ allApps: apps }), userCollections: [] };
window.appStore = { GetCustomLandcapeImageURLs: (a) => ["/head" + (a.appid % 3) + ".png?" + a.appid], GetCustomHeroImageURLs: (a) => ["/hero" + (a.appid % 3) + ".png?" + a.appid] };
window.__runs = [];
window.appAchievementProgressCache = { mapCache: new Map(apps.map((a, i) => [a.appid, { total: 40, unlocked: (i * 7 + 23) % 41 }])) };
window.friendStore = { allFriends: [{ persona: { m_unGamePlayedAppID: 100 } }, { persona: { m_unGamePlayedAppID: 100 } }, { persona: { m_unGamePlayedAppID: 112 } }] };
window.__ks = [];
window.__pulses = [];
const hapticModule = function () { return "PlaySteamDeckHaptic Playing legacy haptics"; };
const fakeReq = (id) => ({ svc: { PlaySteamDeckHaptic: (...a) => window.__pulses.push(a) } });
fakeReq.m = { 1: hapticModule };
window.webpackChunksteamui = { push: ([, , cb]) => cb(fakeReq) };
window.SteamClient = { Input: { TriggerHapticPulse: (...a) => window.__pulses.push(a), RegisterForControllerAnalogInputMessages: (cb) => { window.__analog = cb; return { unregister() { window.__ks.push("unreg"); } }; }, EnableControllerAnalogInputMessages: (v) => window.__ks.push("analog:" + v), SetKeyboardActionset: (a, b) => window.__ks.push("kb:" + a) }, Apps: { RegisterForAppDetails: () => ({ unregister() {} }), RunGame: (...a) => window.__runs.push(a) }, GameSessions: { RegisterForAppLifetimeNotifications: (cb) => { window.__life = cb; return { unregister() { window.__life = null; } }; } }, Settings: { GetCurrentLanguage: async () => "english" } };
window.__start = async () => {
  const mod = await import(/* @vite-ignore */ ["", "plugin.js"].join("/"));
  // #decky-sgdb-first: SteamGridDB registers its home patch before Spindeck loads.
  if (!location.hash.startsWith("#decky-sgdb-first")) window.__plugin = mod.default();
  await new Promise((r) => setTimeout(r, 50));
  const Recents = React.memo(() => h("button", null, "recent")); // Steam's recent-games row (memo)
  const Orig = () => h("div", { style: { height: "100%", overflowY: "auto", backgroundImage: "repeating-linear-gradient(90deg, #c33 0 40px, #36c 40px 80px)", backgroundAttachment: "local" }, id: "orighome" },
    h("div", { style: { position: "absolute", height: 0 } }),
    h("div", { style: { height: 561, background: "#333" } }, h(Recents, { autoFocus: true, showBackground: true })),
    h("div", { id: "sec" }, h("div", null, h("div", { id: "tabs", style: { height: 58, background: "#2a2f38" } }, h("button", { style: { background: "transparent" } }, "tab"), h("button", { id: "friends", style: { background: "transparent" } }, "friends"), h("button", { style: { background: "transparent" } }, "recommended")), h("div", { style: { height: 1500 } }, h("button", null, "row1"), h("div", { style: { height: 300 } }), h("button", null, "row2")))));
  // Another plugin patching the same route like SteamGridDB's "uniform featured" (#2):
  // Decky's afterPatch on the element's type, then wrapReactType (`{ ...type }`) on its output.
  const WRAPPED = Symbol("wrapped");
  const wrapReactType = (node) => (node.type?.[WRAPPED] ? node.type : (node.type = { ...node.type, [WRAPPED]: true }));
  const afterPatch = (obj, prop, handler) => { const orig = obj[prop]; obj[prop] = Object.assign(function (...a) { const ret = orig.apply(this, a); return handler(a, ret) ?? ret; }, orig); };
  const sgdb = (props) => { afterPatch(props.children, "type", (_, ret) => { wrapReactType(ret); afterPatch(ret.type, "type", (_, ret2) => ret2); return ret; }); return props; };
  const OrigMemo = React.memo(Orig);
  const SteamHome = () => h(OrigMemo); // Steam's home renders a memo element, so the copy stays valid
  // Decky's real route patching (router-hook processList): every patch gets a fresh
  // clone of the route child; a child not yet patched gets a wrapper type; patches run
  // in registration order, each on the previous one's output, marked isPatched.
  const IS_PATCHED = Symbol("isPatched");
  const deckyRoute = (child, patches) => {
    for (const patch of patches) {
      const oType = child.type;
      const next = patch({ path: "/library/home", children: { ...React.cloneElement(child), type: child[IS_PATCHED] ? oType : (props) => h(oType, props) } }).children;
      next[IS_PATCHED] = true;
      (window.__passes ||= []).push(Math.round(performance.now()) + " " + (patch.name || "?") + ">" + (next.type?.name || typeof next.type));
      child = next;
    }
    return child;
  };
  const findInTree = (node, filter) => {
    if (!node || typeof node !== "object") return undefined;
    if (filter(node)) return node;
    if (Array.isArray(node)) { for (const x of node) { const r = findInTree(x, filter); if (r) return r; } return null; }
    for (const k of ["props", "children", "child", "sibling"]) { const r = findInTree(node[k], filter); if (r) return r; }
    return undefined;
  };
  // SteamGridDB 1.7.x home patch, its first levels as in src/patches/homePatch.tsx.
  const sgdbReal = (props) => {
    afterPatch(props.children, "type", (_, ret) => {
      let cache2 = null;
      wrapReactType(ret);
      afterPatch(ret.type, "type", (_, ret2) => {
        if (cache2) return cache2;
        const recents = findInTree(ret2, (x) => x?.props && "autoFocus" in x.props && "showBackground" in x.props);
        wrapReactType(recents); // unguarded, as in SteamGridDB: throws when there's no recents row
        afterPatch(recents.type, "type", (_, ret3) => { cache2 = ret2; window.__sgdbHit = (window.__sgdbHit || 0) + 1; return ret3; });
        return ret2;
      });
      return ret;
    });
    return props;
  };
  // Steam's home route child: a memo component whose output holds the recents row.
  const SteamHomeRoute = React.memo(Orig);
  let deckyTree = null;
  if (location.hash.startsWith("#decky-")) {
    // Plugins load in either order; Decky re-renders the router when patches change.
    if (location.hash.startsWith("#decky-sgdb-first")) { window.__routerHook.addPatch("/library/home", sgdbReal); window.__plugin = mod.default(); }
    else window.__routerHook.addPatch("/library/home", sgdbReal);
    if (location.hash.startsWith("#decky-pingpong")) {
      // A rival that also always moves itself last: we must give up, not loop forever.
      const rival = (props) => { const set = routerState._routePatches.get("/library/home"); let last; set.forEach((x) => (last = x)); if (last !== rival) setTimeout(() => { window.__rivalMoves = (window.__rivalMoves || 0) + 1; window.__routerHook.removePatch("/library/home", rival); window.__routerHook.addPatch("/library/home", rival); }, 0); return props; };
      window.__routerHook.addPatch("/library/home", rival);
    }
    const DeckyRouter = () => {
      const [, force] = React.useState(0);
      const seen = routerState.version;
      // Like Decky's state provider (subscribed long before any plugin loads): never miss an update.
      React.useLayoutEffect(() => { const l = () => force((n) => n + 1); routerState.bus.addEventListener("update", l); if (routerState.version !== seen) l(); return () => routerState.bus.removeEventListener("update", l); }, []);
      return deckyRoute(h(SteamHomeRoute), [...(routerState._routePatches.get("/library/home") ?? [])]);
    };
    deckyTree = h(DeckyRouter);
  }
  const sgdbTree = deckyTree ? deckyTree : location.hash.startsWith("#sgdb-after") ? sgdb(patchFn({ children: h(SteamHome) })).children : location.hash.startsWith("#sgdb-before") ? patchFn(sgdb({ children: h(SteamHome) })).children : null;
  const Flat = () => h("div", { id: "orighome" }, "unrecognised home layout", h("button", null, "only"));
  const tree = sgdbTree ? sgdbTree : location.hash.startsWith("#qam") ? window.__plugin.content : location.hash === "#flat" ? patchFn({ children: h(Flat) }).children : location.hash === "#page" ? h(window.__routeComp) : patchFn({ children: h(Orig) }).children;
  const hdr = document.createElement("div"); hdr.id = "steamhdr"; hdr.style.cssText = "position:fixed;top:0;left:0;right:0;height:40px;background:rgba(0,0,0,0.5);backdrop-filter:blur(20px);z-index:6001"; hdr.innerHTML = '<input style="height:30px">'; document.body.appendChild(hdr);
  ReactDOMClient.createRoot(document.getElementById("root")).render(tree);
};
