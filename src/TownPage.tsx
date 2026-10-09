import { Focusable, GamepadButton, Navigation } from "@decky/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createTown, TownGame, TownStatus } from "./town/engine";
import { AppExtra, cachedAchievements, downloadProgress, GameEntry, loadLibrary, openGamePage, overviewMinutes, subscribeAppExtra } from "./games";
import { friendsPlayingMap } from "./friends";
import { noteDir, padButton, padDiag, padRecentlyTouched, subscribeLeftPad } from "./padInput";
import { openNativeGameMenu } from "./nativeMenu";
import { findHeaderSearch, focusFirstIn } from "./steamDom";
import { getSettings, updateSettings, useSettings } from "./settings";
import { funSound, playUiSound } from "./sound";
import { wheelTick } from "./haptics";
import { Strings, useT } from "./i18n";
import { useLang } from "./locale";
import { onTeardown } from "./safety";
import { ARRIVAL_IGNORE_MS, LIBRARY_POLL_MS, WINDOW_REFOCUS_DELAY_MS } from "./constants";

// Remembered across remounts (Steam unmounts the home while a game page is open),
// runtime only: the selected game, and a penguin that went in and should step out.
let lastAppid: number | null = null;
// App details seen this session (achievements, and the playtime non-Steam shortcuts only have there).
const extraSeen = new Map<number, AppExtra>();
const APP_TYPE_SHORTCUT = 1073741824;
let pendingEmerge: number | null = null;

const DAY = 86400;
const STEAM_EPOCH = 1104537600; // anything older than 2005 means "never"

/** Which kind of building a game gets. */
function statusOf(g: GameEntry): { status: TownStatus; progress: number } {
  const p = downloadProgress(g.overview);
  if (p !== null) return { status: "downloading", progress: p };
  if (!g.installed) return { status: "closed", progress: 0 };
  const minutes = overviewMinutes(g.overview);
  if (g.lastPlayed < STEAM_EPOCH && minutes === 0) return { status: "new", progress: 0 };
  const days = (Date.now() / 1000 - g.lastPlayed) / DAY;
  if (g.lastPlayed > STEAM_EPOCH && days <= 7) return { status: "recent", progress: 0 };
  if (g.lastPlayed > STEAM_EPOCH && days > 180) return { status: "dusty", progress: 0 };
  return { status: "ready", progress: 0 };
}

function toTown(list: GameEntry[], t: Strings): TownGame[] {
  const friends = friendsPlayingMap();
  const now = Date.now() / 1000;
  return list.map((g) => {
    const { status, progress } = statusOf(g);
    const ex = extraSeen.get(g.appid);
    const minutes = Math.max(overviewMinutes(g.overview), ex?.minutes ?? 0);
    const hours = Math.floor(minutes / 60);
    // A non-Steam shortcut's playtime only comes with its details: until then show none rather than "not played".
    const pending = !ex && g.overview?.app_type === APP_TYPE_SHORTCUT && minutes === 0;
    const lastAt = Math.max(g.lastPlayed, ex?.lastPlayed ?? 0);
    const ach = ex ? ex.ach : cachedAchievements(g.appid) ?? null;
    const fr = friends?.get(g.appid) ?? 0;
    const label: Record<TownStatus, string> = { recent: t.stRecent, new: t.stNew, dusty: t.stDusty, closed: t.stClosed, downloading: t.stDownloading, ready: t.stReady };
    return {
      appid: g.appid,
      name: g.name,
      status,
      progress,
      hours,
      sign: hours > 0 ? `${hours}h` : label[status],
      art: g.header,
      capsule: g.capsule,
      icon: g.icon,
      // the back of the storefront screen (it turns round when you rest on a shop)
      info: {
        play: pending ? "" : t.playtimeShort(minutes),
        last: lastAt > STEAM_EPOCH ? t.ago(Math.floor((now - lastAt) / DAY)) : null,
        ach: ach ? [ach.achieved, ach.total] : null,
        friends: fr ? t.friendsPlaying(fr) : null,
      },
    };
  });
}


interface Props {
  active: boolean;                // false while Steam's sections are shown
  onTownFocus?: () => void;
  onRequestSections?: () => void; // R2 → What's New / Friends / Recommended
}

/** Trackpad diagnostic (Quick Access → Minimi Town): what each input channel reports, live. */
function PadDebug() {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(iv);
  }, []);
  const d = padDiag;
  return (
    <div style={{ position: "absolute", left: 12, top: 50, zIndex: 5, pointerEvents: "none", padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,.72)", color: "#9fffb0", font: "13px/1.45 monospace", whiteSpace: "pre" }}>
      {`analog mode  ${d.on ? "on" : "off"}   types seen ${d.types || "-"}\nleft pad     ${d.analog}  ${d.analogLast}\npad buttons  ${d.ui}  ${d.uiLast}\nlast d-pad   ${d.dirLast}\nmerged       ${d.merged}`}
    </div>
  );
}

export function TownPage({ active, onTownFocus, onRequestSections }: Props) {
  const s = useSettings();
  const t = useT();
  const lang = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createTown> | null>(null);
  const [libKey, setLibKey] = useState(0);
  const entries = useMemo(() => loadLibrary(s.library, s.sortMode), [s.library, s.sortMode, libKey]);
  const [exVer, setExVer] = useState(0); // bumps when a game's details arrive (its sign updates)
  const games = useMemo(() => toTown(entries, t), [entries, t, exVer]);
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState("browse");
  const live = useRef({ entries, games, s, t });
  live.current = { entries, games, s, t };

  // ── The street itself ──
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const view: any = cv.ownerDocument?.defaultView ?? globalThis;
    const e = createTown(cv, {
      lang,
      tiers: t.tiers,
      theme: s.theme,
      sky: s.sky,
      cardStyle: s.cardStyle,
      mood: s.mood,
      sound: (kind) => {
        const st = getSettings();
        if (kind === "tick") return st.soundEnabled && playUiSound("step");
        if (kind === "door") return st.soundEnabled && playUiSound("detail");
        if (st.funSounds) funSound(kind, view);
      },
      haptic: (ms) => {
        if (getSettings().hapticEnabled && ms >= 25) wheelTick(ms >= 45 ? "right" : "left", false, ms >= 45 ? 7 : 5);
      },
      saveMood: (mood) => updateSettings({ mood }),
      onSelect: (i) => {
        setSel(i);
        const g = live.current.games[i];
        if (g) lastAppid = g.appid;
        setMode(engine.current?.mode ?? "browse");
      },
      onInstall: (i) => {
        const g = live.current.entries[i];
        if (g) setTimeout(() => openGamePage(g), 500);
      },
      // The penguin went in: open the game's page (Play is there; nothing starts by itself).
      onEntered: (i) => {
        setMode("playing");
        const g = live.current.entries[i];
        if (!g) return e.emerge();
        pendingEmerge = g.appid;
        leftPage.current = false;
        openGamePage(g);
      },
    });
    engine.current = e;
    e.setGames(live.current.games, lastAppid);
    // Back from the game page with a fresh home: the penguin steps out of that door.
    if (pendingEmerge !== null && live.current.games[e.selected]?.appid === pendingEmerge) e.emerge();
    pendingEmerge = null;
    const fit = () => {
      const box = boxRef.current;
      if (box) e.fit(box.clientWidth, box.clientHeight);
    };
    fit();
    // Steam lays the route out late at boot: measure again a few times.
    const refits = [100, 400, 1200, 3000].map((ms) => setTimeout(fit, ms));
    const RO = view.ResizeObserver;
    const ro = RO ? new RO(fit) : null;
    if (boxRef.current) ro?.observe(boxRef.current);
    const unregister = onTeardown(() => e.destroy());
    return () => {
      unregister();
      refits.forEach(clearTimeout);
      ro?.disconnect();
      e.destroy();
      engine.current = null;
    };
  }, []);

  // New list (library / sort changed): rebuild the street, keep the selected game.
  const builtFrom = useRef(games);
  useEffect(() => {
    if (builtFrom.current === games) return;
    const prev = builtFrom.current;
    builtFrom.current = games;
    const e = engine.current;
    if (!e) return;
    const same = prev.length === games.length && prev.every((g, i) => g.appid === games[i].appid);
    if (same) e.patchGames(games);
    else e.setGames(games, prev[e.selected]?.appid ?? null);
  }, [games]);
  useEffect(() => engine.current?.setTheme(s.theme, true), [s.theme]);
  useEffect(() => engine.current?.setSky(s.sky), [s.sky]);
  useEffect(() => engine.current?.setCardStyle(s.cardStyle), [s.cardStyle]);

  // Installs, downloads and playtime change under us: re-read now and then while shown.
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setLibKey((k) => k + 1), LIBRARY_POLL_MS);
    return () => clearInterval(iv);
  }, [active]);

  // ── Running only while it can be seen ──
  const [winFocused, setWinFocused] = useState(true);
  useEffect(() => {
    const view: any = boxRef.current?.ownerDocument?.defaultView;
    if (!view) return;
    let tm: any;
    const on = () => {
      clearTimeout(tm);
      tm = setTimeout(() => setWinFocused(true), WINDOW_REFOCUS_DELAY_MS);
    };
    const off = () => {
      clearTimeout(tm);
      setWinFocused(false);
    };
    const vis = () => (view.document.visibilityState === "hidden" ? off() : on());
    view.addEventListener("focus", on);
    view.addEventListener("blur", off);
    view.document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(tm);
      view.removeEventListener("focus", on);
      view.removeEventListener("blur", off);
      view.document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  useEffect(() => engine.current?.setActive(active && winFocused), [active, winFocused]);
  // The street has the controller's focus (not the search box, a game page or the sections).
  const [townFocused, setTownFocused] = useState(true);
  // The left trackpad is the penguin's hand (rub to pet, click to grab, flick to throw), only while the street is shown.
  useEffect(() => {
    if (!active || !winFocused || !townFocused || mode === "playing" || !boxRef.current?.isConnected) return; // a detached copy of the home doesn't listen
    const off = subscribeLeftPad(
      (st) => {
        if (boxRef.current?.isConnected) engine.current?.padInput(st);
      },
      () => !!boxRef.current?.isConnected
    );
    return () => {
      off();
      engine.current?.padInput({ touch: false, click: false, x: 0, y: 0 });
    };
  }, [active, winFocused, townFocused, mode === "playing"]);

  // ── Back from the game page while this home stayed mounted ──
  // Seen as the street going out of view (the page covers it) and coming back.
  const leftPage = useRef(false);
  useEffect(() => {
    const cv = cvRef.current;
    const view: any = cv?.ownerDocument?.defaultView;
    if (!cv || !view?.IntersectionObserver) return;
    const io = new view.IntersectionObserver((list: any[]) => {
      const visible = list.some((x) => x.isIntersecting);
      const e = engine.current;
      if (!e || e.mode !== "playing") return;
      if (!visible) leftPage.current = true;
      else if (leftPage.current) {
        leftPage.current = false;
        pendingEmerge = null;
        e.emerge();
      }
    });
    io.observe(cv);
    return () => io.disconnect();
  }, []);
  // A shown street that is still "inside" (the page never opened): step out after a moment.
  useEffect(() => {
    if (!active || !winFocused || mode !== "playing") return;
    const tm = setTimeout(() => {
      const e = engine.current;
      if (e?.mode === "playing" && !leftPage.current) {
        pendingEmerge = null;
        e.emerge();
      }
    }, 4000);
    return () => clearTimeout(tm);
  }, [active, winFocused, mode]);

  // ── Steam's search box (opened with L2) ──
  // Gamepad input goes to the focused search box there, not to the street, so
  // it is caught at the document: R2 leaves the box for the street; Ⓑ opens
  // Steam's menu and the box stays where it is (L2 does nothing there).
  useEffect(() => {
    if (!active) return;
    const doc = boxRef.current?.ownerDocument;
    if (!doc) return;
    const inSearch = () => {
      const el = doc.activeElement as HTMLElement | null;
      return !!el && el.tagName === "INPUT" && !boxRef.current?.closest("[data-minimi-root]")?.contains(el);
    };
    const onBtn = (e: any) => {
      const b = e?.detail?.button;
      if (!boxRef.current?.isConnected || !inSearch()) return;
      if (b === GamepadButton.TRIGGER_RIGHT) {
        consume(e);
        if (e.detail.is_repeat) return;
        (doc.activeElement as HTMLElement | null)?.blur?.();
        focusFirstIn(boxRef.current?.closest("[data-minimi-town]"));
      } else if (b === GamepadButton.TRIGGER_LEFT) {
        consume(e);
      } else if (b === GamepadButton.CANCEL) {
        consume(e);
        try {
          Navigation.OpenMainMenu?.();
        } catch {
          /* this client has no such call */
        }
      }
    };
    doc.addEventListener("vgp_onbuttondown", onBtn, true);
    return () => doc.removeEventListener("vgp_onbuttondown", onBtn, true);
  }, [active]);

  // ── Input ──
  const activeSince = useRef(Date.now());
  useEffect(() => {
    if (active) activeSince.current = Date.now();
  }, [active]);
  const consume = (e: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
  };
  const current = entries[sel];
  // Steam's Focusable can keep handlers from an earlier render: stable trampolines.
  const latest = useRef<Record<string, (e: any) => any>>({});
  latest.current = {
    dir: (e: any) => {
      const b = e?.detail?.button;
      if (b === GamepadButton.DIR_LEFT || b === GamepadButton.DIR_RIGHT || b === GamepadButton.DIR_UP || b === GamepadButton.DIR_DOWN) noteDir(b, e?.detail?.source);
      if (b === GamepadButton.DIR_LEFT || b === GamepadButton.DIR_RIGHT) {
        consume(e);
        // The left trackpad also arrives as D-pad presses, and its touch can be reported a moment
        // later: wait a beat, and move only if no thumb is on the pad (the pad is the hand now).
        if (padRecentlyTouched()) return;
        const d = b === GamepadButton.DIR_RIGHT ? 1 : -1;
        setTimeout(() => {
          if (!padRecentlyTouched()) engine.current?.nav(d);
        }, 45);
        return;
      }
      // ▲ / ▼ do nothing on the street (L2 / R2 replace them).
      if (b === GamepadButton.DIR_UP || b === GamepadButton.DIR_DOWN) return consume(e);
    },
    // Left trackpad touch / click (Steam forwards them while the pad is in analog mode): the hand.
    up: (e: any) => {
      if (padButton(e?.detail?.button, false)) consume(e);
    },
    down: (e: any) => {
      const b = e?.detail?.button;
      if (padButton(b, true)) return consume(e);
      if (b !== GamepadButton.TRIGGER_LEFT && b !== GamepadButton.TRIGGER_RIGHT) return;
      consume(e);
      if (e?.detail?.is_repeat || Date.now() - activeSince.current < ARRIVAL_IGNORE_MS) return;
      if (b === GamepadButton.TRIGGER_LEFT) {
        // L2: Steam's search, like ▲ on the stock home.
        const box = findHeaderSearch(boxRef.current?.ownerDocument);
        if (box) box.focus();
        else Navigation.Navigate("/search");
      } else onRequestSections?.();
    },
    ok: () => {
      const e = engine.current;
      if (!e) return;
      if (e.mode === "playing") return;
      e.launch();
      setMode(e.mode);
    },
    secondary: (ev: any) => {
      consume(ev);
      engine.current?.flipCard();
    },
    options: (ev: any) => {
      consume(ev);
      engine.current?.shake();
    },
    menu: (ev: any) => {
      const g = live.current.entries[engine.current?.selected ?? -1];
      if (g) openNativeGameMenu(g.appid, g.overview, ev?.currentTarget ?? boxRef.current ?? undefined, boxRef.current?.ownerDocument?.defaultView);
    },
  };
  const call = useMemo(() => {
    const f = (name: string) => (e: any) => latest.current[name]?.(e);
    return { dir: f("dir"), down: f("down"), ok: f("ok"), up: f("up"), secondary: f("secondary"), options: f("options"), menu: f("menu") };
  }, []);

  // ── The resting game's details (achievements, shortcut playtime) go onto its shop sign ──
  const tg = games[sel];
  useEffect(() => {
    if (!current) return;
    const appid = current.appid;
    let unsub = () => {};
    const tm = setTimeout(() => (unsub = subscribeAppExtra(appid, (x) => {
      const old = extraSeen.get(appid);
      extraSeen.set(appid, x);
      if (!old || old.minutes !== x.minutes || old.lastPlayed !== x.lastPlayed || old.ach?.achieved !== x.ach?.achieved || old.ach?.total !== x.ach?.total) setExVer((v) => v + 1);
    })), extraSeen.has(appid) ? 120 : 30);
    return () => {
      clearTimeout(tm);
      unsub();
    };
  }, [current?.appid]);
  const neon = s.theme === "neon";
  const display = '"Jua","Motiva Sans","Noto Sans CJK KR",sans-serif';
  return (
    <Focusable
      // @ts-ignore autoFocus exists at runtime
      autoFocus
      noFocusRing
      onGamepadDirection={call.dir}
      onButtonDown={call.down}
      onButtonUp={call.up}
      onOKButton={call.ok}
      onOKActionDescription={tg?.status === "closed" ? t.install : t.play}
      onSecondaryButton={call.secondary}
      onOptionsButton={call.options}
      onMenuButton={call.menu}
      onMenuActionDescription={t.menu}
      onGamepadFocus={() => {
        setTownFocused(true);
        onTownFocus?.();
      }}
      onGamepadBlur={() => setTownFocused(false)}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: neon ? "#07060c" : "#15121b" }}
    >
      <div ref={boxRef} data-minimi-sel={tg?.name ?? ""} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <canvas ref={cvRef} style={{ position: "absolute", display: "block", touchAction: "none" }} />
        <div style={{ position: "absolute", left: 24, top: 52, display: tg ? "none" : "flex", gap: 12, alignItems: "center", pointerEvents: "none", fontFamily: display }}>
          <span style={{ fontSize: 26, color: "#fff", textShadow: neon ? "0 0 10px #ff3fa4, 0 0 22px rgba(255,63,164,.6)" : "0 2px 0 rgba(0,0,0,.35)" }}>{neon ? t.brandNeon : t.brandTown}</span>
          <span style={{ fontSize: 14, fontWeight: 600, padding: "4px 11px", borderRadius: 99, background: "rgba(20,16,28,.55)", color: "#fff", fontFamily: "Motiva Sans, sans-serif" }}>{t.games(games.length)}</span>
        </div>
        {s.padDebug ? <PadDebug /> : null}
        {games.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontFamily: display, fontSize: 22, padding: 40, textAlign: "center" }}>{t.empty}</div>
        ) : null}
      </div>
    </Focusable>
  );
}
