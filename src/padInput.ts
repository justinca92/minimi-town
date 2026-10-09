// The left trackpad as a hand for the penguin (Steam Deck, Steam Controller, Steam Machine).
// Steam doesn't hand trackpad touches to UI elements the way it hands D-pad presses, so this
// listens on every channel the client offers and merges them (none is public API; which ones
// deliver depends on the client version):
//   1. SteamClient.Input.RegisterForControllerStateChanges: ulButtons bit 17 click, bit 19 touch, sLeftPadX/Y
//   2. SteamClient.Input.RegisterForControllerInputMessages: button 37 LPAD_CLICKED, 38 LPAD_TOUCH, 10–13 pad regions
//   3. SteamClient.Input.RegisterForControllerAnalogInputMessages: nA 14 = left pad position
//   4. the UI's own gamepad events: GamepadButton.LPAD_TOUCH / LPAD_CLICK (vgp_onbuttondown/up)
// Read only; nothing about the controller is changed. Registered only while the street is shown.
import { GamepadButton } from "@decky/ui";
import { debug } from "./log";

declare const SteamClient: any;

const LPAD_CLICK_BIT = 1 << 17;
const LPAD_TOUCH_BIT = 1 << 19;
const MSG_LPAD_CLICKED = 37;
const MSG_LPAD_TOUCH = 38;
const MSG_LEFTPAD_FIRST = 10; // 10–13: up, down, left, right regions of the left pad
const MSG_LEFTPAD_LAST = 13;
const ANALOG_LEFTPAD = 14;

export interface PadState {
  touch: boolean;
  click: boolean;
  x: number; // -1 (left) … 1 (right)
  y: number; // -1 (bottom) … 1 (top)
}

/** What each channel has seen (for the on-screen diagnostic). */
export const padDiag = {
  state: 0, stateBits: "", input: 0, inputLast: "", analog: 0, analogLast: "", ui: 0, uiLast: "", dirLast: "", merged: "",
};

let lastTouchAt = 0;
/** True while (or just after) a thumb is on the left pad: its presses are not D-pad presses then. */
export const padRecentlyTouched = () => Date.now() - lastTouchAt < 220;
export function noteDir(button: number, source: unknown) {
  padDiag.dirLast = `${button} src ${String(source)}${padRecentlyTouched() ? " (pad)" : ""}`;
}

const norm = (v: unknown) => {
  const n = Number(v) || 0;
  return Math.max(-1, Math.min(1, Math.abs(n) > 2 ? n / 32767 : n));
};

let loggedState = false;
export function subscribeLeftPad(doc: Document | undefined, cb: (s: PadState) => void): () => void {
  const cur: PadState = { touch: false, click: false, x: 0, y: 0 };
  // Per-channel touch / click, so one channel saying "not touching" doesn't cancel another that does.
  const touchBy = new Map<string, boolean>();
  const clickBy = new Map<string, boolean>();
  const emit = () => {
    const touch = [...touchBy.values()].some(Boolean);
    const click = [...clickBy.values()].some(Boolean);
    cur.touch = touch || click;
    cur.click = click;
    if (cur.touch) lastTouchAt = Date.now();
    padDiag.merged = `${cur.touch ? "touch" : "-"} ${cur.click ? "click" : "-"} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
    cb({ ...cur });
  };
  const offs: (() => void)[] = [];
  const reg = (name: string, fn: () => any) => {
    try {
      const r = fn();
      if (r?.unregister) offs.push(() => r.unregister());
    } catch (e) {
      debug("pad", `no ${name}`, e);
    }
  };
  const input = SteamClient?.Input;
  let analogT: any;
  offs.push(() => clearTimeout(analogT));

  reg("controller state feed", () =>
    input?.RegisterForControllerStateChanges?.((changes: any[]) => {
      if (!Array.isArray(changes)) return;
      for (const c of changes) {
        padDiag.state++;
        if (!loggedState) {
          loggedState = true;
          debug("pad", "controller state sample", { keys: Object.keys(c ?? {}).slice(0, 24), ulButtons: c?.ulButtons, x: c?.sLeftPadX, y: c?.sLeftPadY });
        }
        let b = 0;
        try {
          b = Number(BigInt.asUintN(32, BigInt(c?.ulButtons ?? 0)));
        } catch {
          b = Number(c?.ulButtons) || 0;
        }
        const t = (b & LPAD_TOUCH_BIT) !== 0, k = (b & LPAD_CLICK_BIT) !== 0;
        padDiag.stateBits = `0x${b.toString(16)} ${t ? "T" : ""}${k ? "C" : ""}`;
        if (t) {
          cur.x = norm(c?.sLeftPadX);
          cur.y = norm(c?.sLeftPadY);
        }
        if (t !== !!touchBy.get("state") || k !== !!clickBy.get("state") || t) {
          touchBy.set("state", t);
          clickBy.set("state", k);
          emit();
        }
      }
    })
  );

  reg("controller input messages", () =>
    input?.RegisterForControllerInputMessages?.((...args: any[]) => {
      // (controllerIndex, button, pressed), or an array of {nController, eButton, bPressed}
      const list = Array.isArray(args[0]) ? args[0] : [{ eButton: args[1], bPressed: args[2] }];
      for (const m of list) {
        const btn = Number(m?.eButton ?? m?.button ?? m?.[1]);
        const down = !!(m?.bPressed ?? m?.pressed ?? m?.[2]);
        padDiag.input++;
        padDiag.inputLast = `${btn} ${down ? "down" : "up"}`;
        if (btn === MSG_LPAD_TOUCH) touchBy.set("input", down), emit();
        else if (btn === MSG_LPAD_CLICKED) clickBy.set("input", down), emit();
        else if (btn >= MSG_LEFTPAD_FIRST && btn <= MSG_LEFTPAD_LAST && down) lastTouchAt = Date.now();
      }
    })
  );

  reg("analog messages", () =>
    input?.RegisterForControllerAnalogInputMessages?.((msgs: any[]) => {
      if (!Array.isArray(msgs)) return;
      for (const m of msgs) {
        if (Number(m?.nA) !== ANALOG_LEFTPAD) continue;
        padDiag.analog++;
        cur.x = norm(m?.x);
        cur.y = norm(m?.y);
        padDiag.analogLast = `${Number(m?.x).toFixed?.(2)},${Number(m?.y).toFixed?.(2)}`;
        // A moving position means a thumb is on the pad, even if no channel said "touch";
        // the messages just stop when it lifts, so that counts as letting go.
        touchBy.set("analog", cur.x !== 0 || cur.y !== 0);
        clearTimeout(analogT);
        analogT = setTimeout(() => {
          touchBy.set("analog", false);
          emit();
        }, 150);
        emit();
      }
    })
  );

  if (doc) {
    const onDown = (e: any) => {
      const b = e?.detail?.button;
      if (b !== GamepadButton.LPAD_TOUCH && b !== GamepadButton.LPAD_CLICK) return;
      padDiag.ui++;
      padDiag.uiLast = `${b === GamepadButton.LPAD_TOUCH ? "touch" : "click"} down`;
      (b === GamepadButton.LPAD_TOUCH ? touchBy : clickBy).set("ui", true);
      emit();
    };
    const onUp = (e: any) => {
      const b = e?.detail?.button;
      if (b !== GamepadButton.LPAD_TOUCH && b !== GamepadButton.LPAD_CLICK) return;
      padDiag.uiLast = `${b === GamepadButton.LPAD_TOUCH ? "touch" : "click"} up`;
      (b === GamepadButton.LPAD_TOUCH ? touchBy : clickBy).set("ui", false);
      emit();
    };
    doc.addEventListener("vgp_onbuttondown", onDown, true);
    doc.addEventListener("vgp_onbuttonup", onUp, true);
    offs.push(() => {
      doc.removeEventListener("vgp_onbuttondown", onDown, true);
      doc.removeEventListener("vgp_onbuttonup", onUp, true);
    });
  }

  return () => offs.forEach((f) => {
    try {
      f();
    } catch {
      /* ignore */
    }
  });
}
