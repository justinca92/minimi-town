import { Focusable, GamepadButton, Navigation } from "@decky/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createTown, TownGame, TownStatus } from "./town/engine";
import { downloadProgress, GameEntry, launch, loadLibrary, openGamePage, overviewMinutes } from "./games";
import { openNativeGameMenu } from "./nativeMenu";
import { findHeaderSearch } from "./steamDom";
import { getSettings, updateSettings, useSettings } from "./settings";
import { funSound, playUiSound } from "./sound";
import { wheelTick } from "./haptics";
import { Strings, useT } from "./i18n";
import { useLang } from "./locale";
import { onTeardown } from "./safety";
import { debug } from "./log";
import { ARRIVAL_IGNORE_MS, LIBRARY_POLL_MS, LAUNCH_TIMEOUT_MS, WINDOW_REFOCUS_DELAY_MS } from "./constants";

declare const SteamClient: any;

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
  return list.map((g) => {
    const { status, progress } = statusOf(g);
    const hours = Math.floor(overviewMinutes(g.overview) / 60);
    const label: Record<TownStatus, string> = { recent: t.stRecent, new: t.stNew, dusty: t.stDusty, closed: t.stClosed, downloading: t.stDownloading, ready: t.stReady };
    return { appid: g.appid, name: g.name, status, progress, hours, sign: hours > 0 ? `${hours}h` : label[status], art: g.header, capsule: g.capsule };
  });
}

const CHIP: Record<TownStatus, string> = { recent: "#62d6b2", dusty: "#b9adc2", downloading: "#86c9ff", closed: "#ff7f8e", new: "#ffb938", ready: "#d9cfe0" };

interface Props {
  active: boolean;                // false while Steam's sections are shown
  onTownFocus?: () => void;
  onRequestSections?: () => void; // R2 → What's New / Friends / Recommended
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
  const games = useMemo(() => toTown(entries, t), [entries, t]);
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
        setMode(engine.current?.mode ?? "browse");
      },
      onInstall: (i) => {
        const g = live.current.entries[i];
        if (g) setTimeout(() => openGamePage(g), 500);
      },
      onEntered: (i) => {
        setMode("playing");
        const g = live.current.entries[i];
        if (!g) return e.goBack();
        if (getSettings().soundEnabled) playUiSound("launch");
        startWatch(g.appid);
        try {
          launch(g);
        } catch (err) {
          debug("launch", "RunGame failed, opening the game page", err);
          e.goBack();
          openGamePage(g);
        }
      },
    });
    engine.current = e;
    e.setGames(live.current.games, null);
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
      stopWatch();
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

  // ── The game's life: the penguin comes back out when it ends ──
  const watch = useRef<{ appid: number; started: boolean; reg: any; timer: any } | null>(null);
  function stopWatch() {
    const w = watch.current;
    if (!w) return;
    clearTimeout(w.timer);
    try {
      w.reg?.unregister?.();
    } catch {
      /* ignore */
    }
    watch.current = null;
  }
  function comeBack() {
    stopWatch();
    engine.current?.goBack();
    setMode("browse");
  }
  function startWatch(appid: number) {
    stopWatch();
    const w: any = { appid, started: false, reg: null, timer: null };
    try {
      w.reg = SteamClient?.GameSessions?.RegisterForAppLifetimeNotifications?.((n: any) => {
        if (Number(n?.unAppID) !== appid) return;
        if (n.bRunning) w.started = true;
        else comeBack();
      });
    } catch {
      /* no notifications on this client: the timer and refocus handle it */
    }
    // Never started (cancelled dialog, failed launch): come back out after a while.
    w.timer = setTimeout(() => {
      if (!w.started) comeBack();
    }, LAUNCH_TIMEOUT_MS);
    watch.current = w;
  }
  // Back on the home with nothing running (e.g. the notification was missed).
  useEffect(() => {
    if (!active || !winFocused || engine.current?.mode !== "playing") return;
    const tm = setTimeout(() => {
      const running = (globalThis as any).SteamUIStore?.RunningApps;
      if (watch.current?.started && Array.isArray(running) && running.length === 0) comeBack();
    }, 2500);
    return () => clearTimeout(tm);
  }, [active, winFocused]);

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
      if (b === GamepadButton.DIR_LEFT || b === GamepadButton.DIR_RIGHT) {
        engine.current?.nav(b === GamepadButton.DIR_RIGHT ? 1 : -1);
        return consume(e);
      }
      // ▲ / ▼ do nothing on the street (L2 / R2 replace them).
      if (b === GamepadButton.DIR_UP || b === GamepadButton.DIR_DOWN) return consume(e);
    },
    down: (e: any) => {
      const b = e?.detail?.button;
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
    return { dir: f("dir"), down: f("down"), ok: f("ok"), options: f("options"), menu: f("menu") };
  }, []);

  // ── HUD ──
  const tg = games[sel];
  const tierIdx = tg ? (tg.hours >= 500 ? 3 : tg.hours >= 200 ? 2 : tg.hours >= 100 ? 1 : 0) : 0;
  const chipLabel: Record<TownStatus, string> = { recent: t.stRecent, new: t.stNew, dusty: t.stDusty, closed: t.stClosed, downloading: t.stDownloading, ready: t.stReady };
  const lastLine = current
    ? current.lastPlayed > STEAM_EPOCH
      ? t.lastPlayed(Math.floor((Date.now() / 1000 - current.lastPlayed) / DAY))
      : t.neverPlayed
    : "";
  const neon = s.theme === "neon";
  const display = '"Jua","Motiva Sans","Noto Sans CJK KR",sans-serif';
  return (
    <Focusable
      // @ts-ignore autoFocus exists at runtime
      autoFocus
      noFocusRing
      onGamepadDirection={call.dir}
      onButtonDown={call.down}
      onOKButton={call.ok}
      onOKActionDescription={tg?.status === "closed" ? t.install : t.play}
      onOptionsButton={call.options}
      onMenuButton={call.menu}
      onMenuActionDescription={t.menu}
      onGamepadFocus={() => onTownFocus?.()}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: neon ? "#07060c" : "#15121b" }}
    >
      <div ref={boxRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <canvas ref={cvRef} style={{ position: "absolute", display: "block", touchAction: "none" }} />
        <div style={{ position: "absolute", left: 24, top: 52, display: "flex", gap: 12, alignItems: "center", pointerEvents: "none", fontFamily: display }}>
          <span style={{ fontSize: 26, color: "#fff", textShadow: neon ? "0 0 10px #ff3fa4, 0 0 22px rgba(255,63,164,.6)" : "0 2px 0 rgba(0,0,0,.35)" }}>{neon ? t.brandNeon : t.brandTown}</span>
          <span style={{ fontSize: 14, fontWeight: 600, padding: "4px 11px", borderRadius: 99, background: "rgba(20,16,28,.55)", color: "#fff", fontFamily: "Motiva Sans, sans-serif" }}>{t.games(games.length)}</span>
        </div>
        {games.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontFamily: display, fontSize: 22, padding: 40, textAlign: "center" }}>{t.empty}</div>
        ) : null}
        {tg ? (
          // The selected game, written on the road under the street: plain text, no panel.
          <div
            style={{
              position: "absolute", left: 40, right: 40, bottom: 20, pointerEvents: "none",
              opacity: mode === "playing" ? 0 : 1, transition: "opacity .3s",
            }}
          >
            <div
              style={{
                fontFamily: display, fontSize: 40, lineHeight: 1.1, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                textShadow: neon ? `0 0 8px ${CHIP[tg.status]}, 0 0 22px rgba(63,240,255,.55), 0 3px 0 rgba(0,0,0,.6)` : "0 3px 0 rgba(0,0,0,.55), 0 0 14px rgba(0,0,0,.55)",
              }}
            >
              {tg.name}
            </div>
            <div
              style={{
                display: "flex", gap: 12, alignItems: "baseline", marginTop: 6, fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,.88)",
                fontFamily: "Motiva Sans, sans-serif", whiteSpace: "nowrap", textShadow: "0 2px 0 rgba(0,0,0,.6), 0 0 10px rgba(0,0,0,.6)",
              }}
            >
              <span style={{ color: CHIP[tg.status], fontWeight: 800 }}>
                {tg.status === "downloading" ? `${chipLabel.downloading} ${Math.floor(tg.progress)}%` : chipLabel[tg.status]}
              </span>
              {tg.status === "closed" ? null : <span>{lastLine}</span>}
              {tg.hours > 0 ? <span>· {t.hours(tg.hours)}</span> : null}
              {tierIdx ? <span style={{ color: ["", "#e0a46a", "#dfe7f2", "#ffd24a"][tierIdx], fontWeight: 800 }}>· {t.tiers[tierIdx]} {[0, 100, 200, 500][tierIdx]}h+</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </Focusable>
  );
}
