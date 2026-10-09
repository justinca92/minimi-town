// Browser demo of the street: the plugin's own engine and penguin sounds, with made-up games
// (art drawn here, no real titles), keyboard / mouse / touch instead of a Steam Deck.
// Built into docs/index.html by tools/demo/build.sh.
import { createTown, TownGame, TownStatus } from "../../src/town/engine";
import { funSound } from "../../src/sound";

type Lang = "ko" | "en";
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// ── made-up games: status, playtime and achievements chosen so every kind of shop shows up ──
interface Seed { name: string; status: TownStatus; hours: number; ach?: [number, number]; days?: number; friends?: number; progress?: number }
const SEEDS: Seed[] = [
  { name: "Lantern Drift", status: "recent", hours: 612, ach: [48, 48], days: 0, friends: 2 },
  { name: "Pixel Pantry", status: "recent", hours: 388, ach: [41, 50], days: 1 },
  { name: "Tide Runner", status: "new", hours: 0 },
  { name: "Moss & Marrow", status: "ready", hours: 236, ach: [30, 52], days: 12 },
  { name: "Starfall Tavern", status: "recent", hours: 171, ach: [19, 35], days: 3, friends: 1 },
  { name: "Clockwork Garden", status: "dusty", hours: 104, ach: [8, 40], days: 420 },
  { name: "Paper Comets", status: "downloading", hours: 0, progress: 63 },
  { name: "Velvet Orbit", status: "ready", hours: 58, ach: [22, 30], days: 40 },
  { name: "Rust Harbor", status: "closed", hours: 12, days: 300 },
  { name: "Kite Kingdom", status: "ready", hours: 141, ach: [27, 27], days: 25 },
  { name: "Echo Valley", status: "dusty", hours: 33, days: 700 },
  { name: "Midnight Ferry", status: "recent", hours: 9, ach: [3, 24], days: 2 },
  { name: "Glass Meadow", status: "new", hours: 0 },
  { name: "Cinder Road", status: "ready", hours: 205, ach: [44, 60], days: 18 },
  { name: "Frostbyte", status: "closed", hours: 0 },
  { name: "Sugar Rally", status: "ready", hours: 26, ach: [12, 20], days: 70 },
];

const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const PALETTES = [
  ["#ff7a59", "#ffd166", "#2b2d42"], ["#3ff0ff", "#7b5cff", "#0b1026"], ["#7bd389", "#f4f1bb", "#1d3b2a"], ["#ff4f9a", "#ffd1e8", "#2a1033"],
  ["#ffb938", "#ff6b3d", "#2a1408"], ["#8ecae6", "#219ebc", "#023047"], ["#cdb4db", "#ffafcc", "#3a2a4a"], ["#e9c46a", "#2a9d8f", "#132a2a"],
];

/** Art for a made-up game: a little poster with sky, shapes and the title. */
function makeArt(name: string, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const hs = hash(name), [a, b, ink] = PALETTES[hs % PALETTES.length];
  const bg = g.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, ink);
  bg.addColorStop(1, b);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  let r = hs;
  const rnd = () => ((r = Math.imul(r ^ (r >>> 15), 2246822519) >>> 0) % 1000) / 1000;
  for (let k = 0; k < 14; k++) {
    g.globalAlpha = 0.12 + rnd() * 0.25;
    g.fillStyle = k % 2 ? a : "#ffffff";
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 6 + rnd() * h * 0.22, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // a moon and a horizon of hills
  g.fillStyle = a;
  g.beginPath();
  g.arc(w * (0.62 + rnd() * 0.25), h * 0.32, h * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.72 + Math.sin(x * 0.02 + hs) * 0.08));
  g.lineTo(w, h);
  g.fill();
  // the title
  const portrait = h > w;
  const words = name.toUpperCase().split(" ");
  let fs = portrait ? w * 0.17 : h * 0.2;
  g.font = `${fs}px "Black Han Sans", "Jua", sans-serif`;
  while (Math.max(...words.map((x) => g.measureText(x).width)) > w * 0.86) g.font = `${(fs -= 2)}px "Black Han Sans", "Jua", sans-serif`;
  g.textBaseline = "top";
  g.fillStyle = "#ffffff";
  g.shadowColor = "rgba(0,0,0,.45)";
  g.shadowOffsetY = 3;
  g.shadowBlur = 4;
  words.forEach((wd, i) => g.fillText(wd, w * 0.07, (portrait ? h * 0.1 : h * 0.12) + i * fs * 1.02));
  return c.toDataURL("image/png");
}
function makeIcon(name: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const [a, , ink] = PALETTES[hash(name) % PALETTES.length];
  g.fillStyle = ink;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = a;
  g.beginPath();
  g.arc(32, 32, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = '30px "Black Han Sans", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name[0], 32, 34);
  return c.toDataURL("image/png");
}

const T = {
  ko: {
    tiers: ["", "단골", "인기", "명소", "명물", "전설"],
    hours: (h: number) => (h ? `${h}시간` : "아직 플레이 안 함"),
    ago: (d: number) => (d <= 0 ? "오늘" : d === 1 ? "어제" : d < 7 ? `${d}일 전` : d < 30 ? `${Math.floor(d / 7)}주 전` : d < 365 ? `${Math.floor(d / 30)}개월 전` : `${Math.floor(d / 365)}년 전`),
    friends: (n: number) => `${n}명 플레이 중`,
    st: { recent: "최근 플레이", new: "새 게임", dusty: "오래 쉼", closed: "설치 안 됨", downloading: "다운로드 중", ready: "플레이 가능" } as Record<TownStatus, string>,
    install: "설치 페이지가 열려요 (데모)",
  },
  en: {
    tiers: ["", "Regular", "Popular", "Landmark", "Icon", "Legend"],
    hours: (h: number) => (h ? `${h} HRS` : "NOT PLAYED YET"),
    ago: (d: number) => (d <= 0 ? "TODAY" : d === 1 ? "YESTERDAY" : d < 7 ? `${d} DAYS AGO` : d < 30 ? `${Math.floor(d / 7)} WK AGO` : d < 365 ? `${Math.floor(d / 30)} MO AGO` : `${Math.floor(d / 365)} YR AGO`),
    friends: (n: number) => `${n} PLAYING`,
    st: { recent: "Recently played", new: "New", dusty: "Dusty", closed: "Not installed", downloading: "Downloading", ready: "Ready" } as Record<TownStatus, string>,
    install: "The install page opens here (demo)",
  },
};

const ART = new Map<string, { wide: string; tall: string; icon: string }>();
function games(lang: Lang): TownGame[] {
  const t = T[lang];
  return SEEDS.map((s, i) => {
    if (!ART.has(s.name)) ART.set(s.name, { wide: makeArt(s.name, 460, 215), tall: makeArt(s.name, 300, 450), icon: makeIcon(s.name) });
    const art = ART.get(s.name)!;
    return {
      appid: 9000 + i * 17,
      name: s.name,
      status: s.status,
      progress: s.progress ?? 0,
      hours: s.hours,
      sign: s.hours ? `${s.hours}h` : t.st[s.status],
      art: [art.wide],
      capsule: [art.tall],
      icon: [art.icon],
      info: {
        play: t.hours(s.hours),
        last: s.days !== undefined ? t.ago(s.days) : null,
        ach: s.ach ?? null,
        friends: s.friends ? t.friends(s.friends) : null,
      },
    };
  });
}

// ── the street ──
const state = { lang: (navigator.language || "").startsWith("ko") ? ("ko" as Lang) : ("en" as Lang), theme: "town" as "town" | "neon", sky: "day" as any, card: "wide" as "wide" | "capsule", penguin: true, sound: false, mood: 80 };
let town: ReturnType<typeof createTown> | null = null;
let selected = 0;
const box = $("stage");
const cv = $("street") as HTMLCanvasElement;

function build() {
  town?.destroy();
  const list = games(state.lang);
  town = createTown(cv, {
    lang: state.lang,
    tiers: T[state.lang].tiers,
    theme: state.theme,
    sky: state.sky,
    cardStyle: state.card,
    penguin: state.penguin,
    mood: state.mood,
    sound: (k) => {
      if (state.sound && k !== "tick" && k !== "door") funSound(k);
    },
    haptic: () => {},
    saveMood: (m) => (state.mood = m),
    onSelect: (i) => (selected = i),
    onInstall: () => toast(T[state.lang].install),
    onEntered: (i) => openPage(i),
  });
  town.setGames(list, list[selected]?.appid ?? list[0].appid);
  fit();
  town.setActive(true);
}
function fit() {
  town?.fit(box.clientWidth, box.clientHeight);
}
new ResizeObserver(fit).observe(box);

// ── the "game page" the penguin walks into ──
const page = $("page");
function openPage(i: number) {
  const s = SEEDS[i];
  if (!s) return town?.emerge();
  ($("page-art") as HTMLImageElement).src = ART.get(s.name)!.wide;
  $("page-title").textContent = s.name;
  page.hidden = false;
  ($("page-back") as HTMLButtonElement).focus();
}
function closePage() {
  if (page.hidden) return;
  page.hidden = true;
  town?.emerge();
  cv.focus();
}
$("page-back").addEventListener("click", closePage);

let toastT: any;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), 2200);
}

// ── keys and on-screen buttons ──
const act = (a: string) => {
  if (!town) return;
  if (!page.hidden) return a === "b" && closePage();
  if (a === "left") town.nav(-1);
  else if (a === "right") town.nav(1);
  else if (a === "a") town.launch();
  else if (a === "x") town.flipCard();
  else if (a === "y") town.shake();
};
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  const map: Record<string, string> = { arrowleft: "left", arrowright: "right", enter: "a", " ": "a", a: "a", x: "x", y: "y", escape: "b", backspace: "b", b: "b" };
  if (map[k]) {
    e.preventDefault();
    act(map[k]);
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => b.addEventListener("click", () => act(b.dataset.act!)));

// ── options ──
function seg(id: string, key: keyof typeof state, apply: (v: string) => void) {
  const el = $(id);
  el.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      (state as any)[key] = b.dataset.v === "true" ? true : b.dataset.v === "false" ? false : b.dataset.v;
      apply(b.dataset.v!);
    })
  );
}
seg("opt-theme", "theme", (v) => {
  town?.setTheme(v, true);
  document.documentElement.dataset.street = v;
  $("opt-sky-wrap").toggleAttribute("data-off", v === "neon");
});
seg("opt-sky", "sky", (v) => town?.setSky(v));
seg("opt-card", "card", (v) => town?.setCardStyle(v));
seg("opt-penguin", "penguin", (v) => town?.setPenguin(v === "true"));
seg("opt-lang", "lang", () => build());
seg("opt-sound", "sound", () => {});
document.querySelectorAll("#opt-lang button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.v === state.lang)));

(document as any).fonts?.ready?.then(() => build()) ?? build();
