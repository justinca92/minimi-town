// The left trackpad as a hand for the penguin (Steam Deck, Steam Controller, Steam Machine).
//
// Same path as Spindeck's trackpad wheel (confirmed on device there): Steam's own radial menu
// puts the controller into its keyboard action set and turns on analog input messages; the
// trackpads then send their finger position while a thumb is on them, no click needed:
// left pad = message type 48, x/y in [-1, 1], y up. The messages stop when the thumb lifts.
// In that mode Steam also forwards the pad's TOUCH / CLICK to the focused element as UI
// button events (GamepadButton.LPAD_TOUCH / LPAD_CLICK): TownPage passes them in with
// padButton(); the click is what grabs the penguin.
// Runtime only, nothing is saved; leaving the street (or unloading) turns the action set off.
import { GamepadButton } from "@decky/ui";
import { debug } from "./log";
import { onTeardown } from "./safety";

declare const SteamClient: any;

const ANALOG_LEFT_PAD = 48;
const GESTURE_GAP_MS = 150; // no message for this long = the thumb lifted
const START_DELAY_MS = 500; // switching the action set while a button is held opened Steam's menu (Spindeck)

export interface PadState {
  touch: boolean;
  click: boolean;
  x: number; // -1 (left) … 1 (right)
  y: number; // -1 (bottom) … 1 (top)
}

/** What the pad reported, for the on-screen diagnostic. */
export const padDiag = { on: false, analog: 0, analogLast: "", ui: 0, uiLast: "", dirLast: "", merged: "", types: "" };

let lastTouchAt = 0;
/** True while (or just after) a thumb is on the left pad: its presses are not D-pad presses then. */
export const padRecentlyTouched = () => Date.now() - lastTouchAt < 220;
export function noteDir(button: number, source: unknown) {
  padDiag.dirLast = `${button} src ${String(source)}${padRecentlyTouched() ? " (pad)" : ""}`;
}

const cur: PadState = { touch: false, click: false, x: 0, y: 0 };
const listeners = new Map<(s: PadState) => void, () => boolean>(); // listener → still on the page?
let uiTouch = false;
let analogTouch = false;
let gapT: any;
const emit = () => {
  cur.touch = uiTouch || analogTouch || cur.click;
  if (cur.touch) lastTouchAt = Date.now();
  padDiag.merged = `${cur.touch ? "touch" : "-"} ${cur.click ? "click" : "-"} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
  listeners.forEach((_alive, f) => f({ ...cur }));
};

/** The pad's UI button events (LPAD_TOUCH / LPAD_CLICK). Returns true when it was one of them (swallow it). */
export function padButton(button: number, down: boolean): boolean {
  if (button !== GamepadButton.LPAD_TOUCH && button !== GamepadButton.LPAD_CLICK) return false;
  padDiag.ui++;
  padDiag.uiLast = `${button === GamepadButton.LPAD_TOUCH ? "touch" : "click"} ${down ? "down" : "up"}`;
  if (button === GamepadButton.LPAD_TOUCH) uiTouch = down;
  else cur.click = down;
  if (down) lastTouchAt = Date.now();
  emit();
  return true;
}

// One Steam registration shared by every subscriber (a hidden copy of the home can subscribe too).
let users = 0;
let stopSteam: (() => void) | null = null;

function startSteam(): () => void {
  const Input = SteamClient?.Input;
  let reg: any;
  let keep: any;
  let started = false;
  const seen = new Set<number>();
  const onAnalog = (...a: any[]) => {
    // (controllerIndex, type, pressed, x, y); some clients may pass an array of {nA, x, y}
    const list = Array.isArray(a[0]) ? a[0].map((m: any) => [m?.nA, m?.x, m?.y]) : [[a[1], a[3], a[4]]];
    for (const [type, x, y] of list) {
      const t = Number(type);
      if (!seen.has(t)) {
        seen.add(t);
        padDiag.types = [...seen].join(",");
        debug("pad", "analog input type", t);
      }
      if (t !== ANALOG_LEFT_PAD) continue;
      padDiag.analog++;
      cur.x = Math.max(-1, Math.min(1, Number(x) || 0));
      cur.y = Math.max(-1, Math.min(1, Number(y) || 0));
      padDiag.analogLast = `${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
      analogTouch = true;
      clearTimeout(gapT);
      gapT = setTimeout(() => {
        analogTouch = false;
        emit();
      }, GESTURE_GAP_MS);
      emit();
    }
  };
  const startT = setTimeout(() => {
    if (!Input?.RegisterForControllerAnalogInputMessages || !Input?.SetKeyboardActionset) {
      debug("pad", "no analog input / keyboard action set on this client");
      return;
    }
    try {
      reg = Input.RegisterForControllerAnalogInputMessages(onAnalog);
      Input.EnableControllerAnalogInputMessages?.(true);
      Input.SetKeyboardActionset(true, false);
      started = true;
      padDiag.on = true;
    } catch (e) {
      debug("pad", "analog input failed", e);
    }
    // Steam drops the action set unless it's refreshed, as its radial menu does.
    keep = setInterval(() => {
      // A copy of the home that was taken out of the page never cleans up: drop it, and stop when none is left.
      for (const [f, alive] of [...listeners]) if (!alive()) dropListener(f);
      if (!users) return;
      try {
        Input.SetKeyboardActionset(true, false);
      } catch {
        /* ignore */
      }
    }, 1000);
  }, START_DELAY_MS);
  return () => {
    clearTimeout(startT);
    clearInterval(keep);
    clearTimeout(gapT);
    if (started) {
      try {
        Input.SetKeyboardActionset(false, false);
        Input.EnableControllerAnalogInputMessages?.(false);
      } catch {
        /* ignore */
      }
    }
    padDiag.on = false;
    try {
      reg?.unregister?.();
    } catch {
      /* ignore */
    }
    uiTouch = analogTouch = false;
    cur.touch = cur.click = false;
  };
}

function dropListener(f: (s: PadState) => void) {
  if (!listeners.delete(f)) return;
  if (--users === 0) {
    const st = stopSteam;
    stopSteam = null;
    st?.();
  }
}

/** Listen to the left pad while the street is shown (`alive` = is that street still on the page). */
export function subscribeLeftPad(cb: (s: PadState) => void, alive: () => boolean = () => true): () => void {
  listeners.set(cb, alive);
  if (users++ === 0) stopSteam = startSteam();
  const stop = () => dropListener(cb);
  // Also undone if the plugin unloads without React running this cleanup.
  const unregister = onTeardown(stop);
  return () => {
    unregister();
    stop();
  };
}
