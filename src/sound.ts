// Steam UI plays its navigation sound when focus moves between elements. The
// wheel is a single focusable that consumes input itself, so Steam never plays
// it. We ask Steam's own UI audio store to play its own sound files, the same
// path Steam uses (so it follows Steam's UI-sound setting and output stream).
// Files below were confirmed present on SteamOS (loaded by Steam UI itself).
import { debug } from "./log";

const BASE = "https://steamloopback.host/sounds/";
export const SOUNDS = {
  step: "deck_ui_navigation.wav",
  launch: "deck_ui_launch_game.wav",
  detail: "deck_ui_into_game_detail.wav",
  screen: "deck_ui_tab_transition_01.wav",
} as const;

function steamAudio(): any {
  try {
    return (globalThis as any).SteamUIStore?.m_GamepadUIAudioStore;
  } catch {
    return undefined;
  }
}

export function playUiSound(kind: keyof typeof SOUNDS) {
  const url = BASE + SOUNDS[kind];
  const store = steamAudio();
  if (store?.PlayAudioURL) {
    try {
      Promise.resolve(store.PlayAudioURL(url)).catch((e: any) => debug("sound", "Steam playback failed", e));
      return;
    } catch (e) {
      debug("sound", "Steam playback failed", e);
    }
  }
  // Fallback: plain HTML audio (may be blocked by autoplay rules).
  try {
    const a = new Audio(url);
    a.volume = 0.6;
    a.play().catch((e) => debug("sound", "HTML playback failed", e));
  } catch (e) {
    debug("sound", "no audio", e);
  }
}

// The penguin's own little noises (boing, splat…), synthesized like the
// mockup. Steam's audio store only plays its own files, so these go through
// Web Audio in Steam's window; if that isn't allowed there they stay silent.
let AC: any = null;
export function funSound(type: string, view: any = globalThis) {
  try {
    const Ctx = view.AudioContext || view.webkitAudioContext;
    if (!Ctx) return;
    AC = AC || new Ctx();
    if (AC.state === "suspended") AC.resume?.();
    if (type === "bang") {
      // a short pew-bang: a noise burst through a falling low-pass, plus a thump
      const t0 = AC.currentTime, len = Math.floor(AC.sampleRate * 0.16);
      const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const src = AC.createBufferSource(), lp = AC.createBiquadFilter(), g = AC.createGain();
      src.buffer = buf; lp.type = "lowpass"; lp.frequency.setValueAtTime(3200, t0); lp.frequency.exponentialRampToValueAtTime(400, t0 + 0.14);
      g.gain.setValueAtTime(0.32, t0); src.connect(lp); lp.connect(g); g.connect(AC.destination); src.start(t0);
      const o2 = AC.createOscillator(), g2 = AC.createGain(); o2.type = "sine";
      o2.frequency.setValueAtTime(160, t0); o2.frequency.exponentialRampToValueAtTime(50, t0 + 0.12);
      g2.gain.setValueAtTime(0.4, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o2.connect(g2); g2.connect(AC.destination); o2.start(t0); o2.stop(t0 + 0.16);
      return;
    }
    const t = AC.currentTime,
      o = AC.createOscillator(),
      g = AC.createGain();
    o.connect(g);
    g.connect(AC.destination);
    const env = (v: number, d: number) => {
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t);
      o.stop(t + d + 0.02);
    };
    const f = o.frequency;
    if (type === "poke") { o.type = "sine"; f.setValueAtTime(520, t); f.exponentialRampToValueAtTime(980, t + 0.08); env(0.12, 0.1); }
    else if (type === "splat") { o.type = "triangle"; f.setValueAtTime(180, t); f.exponentialRampToValueAtTime(45, t + 0.18); env(0.35, 0.22); }
    else if (type === "boing") { o.type = "sine"; f.setValueAtTime(300, t); f.exponentialRampToValueAtTime(620, t + 0.12); env(0.1, 0.18); }
    else if (type === "yawn") { o.type = "sawtooth"; f.setValueAtTime(380, t); f.exponentialRampToValueAtTime(170, t + 0.7); env(0.04, 0.75); }
    else if (type === "pet") { o.type = "sine"; f.setValueAtTime(900, t); f.linearRampToValueAtTime(1200, t + 0.08); env(0.05, 0.12); }
    else if (type === "angry") { o.type = "square"; f.setValueAtTime(140, t); f.linearRampToValueAtTime(110, t + 0.2); env(0.06, 0.22); }
    else { o.disconnect(); g.disconnect(); }
  } catch {
    /* no Web Audio here */
  }
}
