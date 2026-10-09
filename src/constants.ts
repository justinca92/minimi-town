// Tuning values in one place (all in ms unless noted). The home-switching ones
// were tuned on device for Spindeck and are shared as-is.

/** Town ⇄ sections slide duration, and when to act once it has settled. */
export const SLIDE_MS = 300;
export const SLIDE_SETTLED_MS = 320;
/** Ignore another town ⇄ sections switch this soon after one (no ping-pong). */
export const SWITCH_COOLDOWN_MS = 700;
/** ▲ presses closer together than this count as "held" (auto-repeat). */
export const HOLD_REPEAT_MS = 250;
/** After a held ▲ was seen, focus side-effects are treated as part of the hold. */
export const HOLD_GRACE_MS = 300;
/** Focus entering the hidden recent row this soon after arriving is not "▲". */
export const HIDDEN_ROW_GRACE_MS = 600;
/** Focus landing on the tab row within this window after ▲ = leave to the town. */
export const UP_FOCUS_WINDOW_MS = 500;
/** On the town, L1 / R1 are ignored this long after arriving (held button). */
export const ARRIVAL_IGNORE_MS = 500;
/** After Quick Access / the Steam menu closes, wait this long before running again. */
export const WINDOW_REFOCUS_DELAY_MS = 400;

/** Scroll is considered settled after this long without scroll events. */
export const SCROLL_SETTLE_MS = 140;
/** Header bar re-apply interval while home is shown, and full re-scan interval. */
export const HEADER_REAPPLY_MS = 1000;
export const HEADER_RESCAN_MS = 5000;

/** When the town first appears, put gamepad focus on it at these moments (Steam settles focus late at boot). */
export const BOOT_FOCUS_CLAIMS_MS = [150, 600, 1500, 3000];
/** While the town is shown, check this often that gamepad focus isn't lost or stuck on Steam's hidden home. */
export const FOCUS_WATCH_MS = 1000;

/** Re-read the library (installs, downloads, playtime) this often while the town is shown. */
export const LIBRARY_POLL_MS = 4000;
/** The penguin went in but the game never started (cancelled, failed): come back out after this long. */
export const LAUNCH_TIMEOUT_MS = 25000;
