// The left trackpad as a hand for the penguin (Steam Deck, Steam Controller, Steam Machine).
// Steam's controller-state feed (SteamClient.Input.RegisterForControllerStateChanges, not a
// public API) reports the pad position and its touch / click bits; the gamepad events the UI
// gets don't. Read only, nothing about the controller is changed. Registered only while the
// street is on screen.
import { debug } from "./log";

declare const SteamClient: any;

const LPAD_CLICK = 1 << 17;
const LPAD_TOUCH = 1 << 19;

export interface PadState {
  touch: boolean;
  click: boolean;
  x: number; // -1 (left) … 1 (right)
  y: number; // -1 (bottom) … 1 (top)
}

let lastTouchAt = 0;
/** True while (or just after) a thumb is on the left pad: its clicks are not D-pad presses then. */
export const padRecentlyTouched = () => Date.now() - lastTouchAt < 160;

let logged = false;
export function subscribeLeftPad(cb: (s: PadState) => void): () => void {
  let reg: any;
  let was = false;
  try {
    reg = SteamClient?.Input?.RegisterForControllerStateChanges?.((changes: any[]) => {
      if (!Array.isArray(changes)) return;
      for (const c of changes) {
        if (!logged) {
          logged = true;
          debug("pad", "controller state sample", { keys: Object.keys(c ?? {}).slice(0, 20), ulButtons: c?.ulButtons, x: c?.sLeftPadX, y: c?.sLeftPadY });
        }
        const b = Number(c?.ulButtons) || 0;
        const touch = (b & LPAD_TOUCH) !== 0;
        const click = (b & LPAD_CLICK) !== 0;
        if (touch || click) lastTouchAt = Date.now();
        // Several controllers can report: follow the one whose pad is in use, and its release.
        if (!touch && !click && !was) continue;
        was = touch || click;
        cb({ touch: touch || click, click, x: (Number(c?.sLeftPadX) || 0) / 32767, y: (Number(c?.sLeftPadY) || 0) / 32767 });
      }
    });
  } catch (e) {
    debug("pad", "no controller state feed", e);
  }
  return () => {
    try {
      reg?.unregister?.();
    } catch {
      /* ignore */
    }
  };
}
