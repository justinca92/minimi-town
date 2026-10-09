// One line of game info next to the title on the road, with small line icons
// (Spindeck's info row): playtime · last played · achievements (+ bar) · friends playing.
import { CSSProperties, ReactNode } from "react";
import { AchievementProgress } from "./games";

const PATHS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  recent: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20h6" />
    </>
  ),
  friends: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="10" r="2.6" />
      <path d="M15.5 14.6A4.5 4.5 0 0 1 21 19" />
    </>
  ),
};

const FRIENDS_GREEN = "#8bc53f"; // Steam's "in game" green
const TEXT = "#e4e9ef";
const SHADOW = "0 2px 0 rgba(0,0,0,.65), 0 0 10px rgba(0,0,0,.6)";

function Item({ icon, color = TEXT, children }: { icon: keyof typeof PATHS; color?: string; children?: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color, textShadow: SHADOW }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", filter: "drop-shadow(0 1.5px 0 rgba(0,0,0,.6))" }}>
        {PATHS[icon]}
      </svg>
      {children}
    </span>
  );
}

export function InfoRow({
  playtime,
  lastPlayed,
  ach,
  friends,
  accent,
  size = 16,
  style,
}: {
  playtime: string;
  lastPlayed: string | null;
  ach: AchievementProgress | null;
  friends: string | null;
  accent: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 20, fontSize: size, fontWeight: 600, letterSpacing: "0.05em", fontFamily: "Motiva Sans, sans-serif", whiteSpace: "nowrap", ...style }}>
      <Item icon="clock">{playtime}</Item>
      {lastPlayed && <Item icon="recent">{lastPlayed}</Item>}
      {ach && (
        <Item icon="trophy">
          {ach.achieved}/{ach.total}
          <span style={{ width: 50, height: 5, borderRadius: 3, background: "#ffffff40", overflow: "hidden", marginLeft: 2, boxShadow: "0 1px 0 rgba(0,0,0,.5)" }}>
            <span style={{ display: "block", height: "100%", width: `${(ach.achieved / ach.total) * 100}%`, background: accent }} />
          </span>
        </Item>
      )}
      {friends && (
        <Item icon="friends" color={FRIENDS_GREEN}>
          {friends}
        </Item>
      )}
    </span>
  );
}
