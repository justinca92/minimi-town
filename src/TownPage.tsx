import { Focusable, GamepadButton, Navigation } from "@decky/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createTown, TownGame, TownStatus } from "./town/engine";
import { AppExtra, cachedAchievements, downloadProgress, GameEntry, loadLibrary, openGamePage, overviewMinutes, subscribeAppExtra } from "./games";
import { InfoRow } from "./InfoRow";
import { friendsInGame } from "./friends";
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
  // it is caught at the document: L2 / R2 bring you back to the street, and Ⓑ
  // leaves the box and opens Steam's menu, like Ⓑ on the stock home.
  useEffect(() => {
    if (!active) return;
    const doc = boxRef.current?.ownerDocument;
    if (!doc) return;
    const inSearch = () => {
      const el = doc.activeElement as HTMLElement | null;
      return !!el && el.tagName === "INPUT" && !boxRef.current?.closest("[data-minimi-root]")?.contains(el);
    };
    const backToStreet = () => {
      (doc.activeElement as HTMLElement | null)?.blur?.();
      focusFirstIn(boxRef.current?.closest("[data-minimi-town]"));
    };
    const onBtn = (e: any) => {
      const b = e?.detail?.button;
      if (!boxRef.current?.isConnected || !inSearch()) return;
      if (b === GamepadButton.TRIGGER_LEFT || b === GamepadButton.TRIGGER_RIGHT) {
        consume(e);
        if (!e.detail.is_repeat) backToStreet();
      } else if (b === GamepadButton.CANCEL) {
        consume(e);
        backToStreet();
        setTimeout(() => {
          try {
            Navigation.OpenMainMenu?.();
          } catch {
            /* this client has no such call: Ⓑ just leaves the box */
          }
        }, 60);
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

  // ── The road text: name + Spindeck's icon info row ──
  const tg = games[sel];
  const tierIdx = tg ? (tg.hours >= 500 ? 3 : tg.hours >= 200 ? 2 : tg.hours >= 100 ? 1 : 0) : 0;
  const chipLabel: Record<TownStatus, string> = { recent: t.stRecent, new: t.stNew, dusty: t.stDusty, closed: t.stClosed, downloading: t.stDownloading, ready: t.stReady };
  // App details (achievements, shortcut playtime) once the selection rests, tagged
  // with the appid so the previous game's values never show for the next one.
  const [extra, setExtra] = useState<(AppExtra & { appid: number }) | null>(null);
  useEffect(() => {
    if (!current) return;
    const appid = current.appid;
    let alive = true;
    let unsub = () => {};
    const tm = setTimeout(() => (unsub = subscribeAppExtra(appid, (x) => alive && setExtra({ ...x, appid }))), 120);
    return () => {
      alive = false;
      clearTimeout(tm);
      unsub();
    };
  }, [current?.appid]);
  const ex = current && extra?.appid === current.appid ? extra : null;
  const ach = ex ? ex.ach : current ? cachedAchievements(current.appid) ?? null : null;
  const minutes = current ? Math.max(overviewMinutes(current.overview), ex?.minutes ?? 0) : 0;
  const lastAt = Math.max(current?.lastPlayed ?? 0, ex?.lastPlayed ?? 0);
  const friends = useMemo(() => (current ? friendsInGame(current.appid) : null), [current?.appid]);
  // Only the states worth a word: the info icons already say the rest.
  const statusWord = tg && (tg.status === "closed" || tg.status === "new" || tg.status === "downloading")
    ? tg.status === "downloading" ? `${chipLabel.downloading} ${Math.floor(tg.progress)}%` : chipLabel[tg.status]
    : null;
  const neon = s.theme === "neon";
  const display = '"Jua","Motiva Sans","Noto Sans CJK KR",sans-serif';
  const info = (size: number) => (
    <InfoRow
      playtime={t.playtimeShort(minutes)}
      lastPlayed={lastAt > STEAM_EPOCH ? t.ago(Math.floor((Date.now() / 1000 - lastAt) / DAY)) : null}
      ach={ach}
      friends={friends ? t.friendsPlaying(friends) : null}
      accent={neon ? "#3ff0ff" : "#ffb938"}
      size={size}
    />
  );
  const badges = (size: number) =>
    tg && (statusWord || tierIdx) ? (
      <span style={{ display: "flex", gap: 12, fontFamily: "Motiva Sans, sans-serif", fontSize: size, fontWeight: 800, letterSpacing: "0.05em", whiteSpace: "nowrap", textShadow: "0 2px 0 rgba(0,0,0,.65), 0 0 10px rgba(0,0,0,.6)" }}>
        {statusWord ? <span style={{ color: CHIP[tg.status] }}>{statusWord}</span> : null}
        {tierIdx ? <span style={{ color: ["", "#e0a46a", "#dfe7f2", "#ffd24a"][tierIdx] }}>{t.tiers[tierIdx]} {[0, 100, 200, 500][tierIdx]}h+</span> : null}
      </span>
    ) : null;
  const fade = { opacity: mode === "playing" ? 0 : 1, transition: "opacity .3s" };
  const titleShadow = neon ? "0 0 8px rgba(63,240,255,.7), 0 0 22px rgba(255,63,164,.45), 0 3px 0 rgba(0,0,0,.6)" : "0 3px 0 rgba(0,0,0,.45), 0 0 16px rgba(0,0,0,.35)";
  /** The picked game's info: top-left under Steam's bar, like a page title. */
  const renderInfo = () =>
    tg ? (
      <>
        {/* a soft shade under Steam's bar so the title reads over a bright sky */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 170, pointerEvents: "none", background: neon ? "linear-gradient(to bottom, rgba(5,4,12,.55), rgba(5,4,12,0))" : "linear-gradient(to bottom, rgba(20,30,50,.42), rgba(20,30,50,0))" }} />
        <div style={{ position: "absolute", left: 32, top: 54, right: 32, pointerEvents: "none", ...fade }}>
          <div style={{ fontFamily: display, fontSize: 38, lineHeight: 1.1, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: titleShadow }}>{tg.name}</div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8 }}>
            {info(15)}
            {badges(14)}
          </div>
        </div>
      </>
    ) : null;
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
        <div style={{ position: "absolute", left: 24, top: 52, display: tg ? "none" : "flex", gap: 12, alignItems: "center", pointerEvents: "none", fontFamily: display }}>
          <span style={{ fontSize: 26, color: "#fff", textShadow: neon ? "0 0 10px #ff3fa4, 0 0 22px rgba(255,63,164,.6)" : "0 2px 0 rgba(0,0,0,.35)" }}>{neon ? t.brandNeon : t.brandTown}</span>
          <span style={{ fontSize: 14, fontWeight: 600, padding: "4px 11px", borderRadius: 99, background: "rgba(20,16,28,.55)", color: "#fff", fontFamily: "Motiva Sans, sans-serif" }}>{t.games(games.length)}</span>
        </div>
        {games.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontFamily: display, fontSize: 22, padding: 40, textAlign: "center" }}>{t.empty}</div>
        ) : null}
        {tg ? renderInfo() : null}
      </div>
    </Focusable>
  );
}
