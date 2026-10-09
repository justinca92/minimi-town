import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, SliderField, ToggleField, staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { listCollections } from "./games";
import { requestWheelReset } from "./reset";
import { useT } from "./i18n";
import { installHomePatch, removeHomePatch } from "./homePatch";
import { KOFI_URL, PLUGIN_VERSION, REPO_URL } from "./links";
import { SafeBoundary, teardownAll } from "./safety";
import { sweepLeftovers } from "./steamDom";
import { checkNow, startUpdate, useUpdateCheck } from "./updater";
import { initSettings, SkyMode, SortMode, Theme, updateSettings, useSettings, useSettingsLoaded } from "./settings";

/** A little building for the Decky menu. */
const TownIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
    <path d="M3 21V9l5-4 5 4v12" />
    <path d="M13 21V12h8v9" />
    <path d="M7 21v-4h2v4" />
    <path d="M2 21h20" />
  </svg>
);

function openUrl(url: string) {
  try {
    Navigation.NavigateToExternalWeb(url);
  } catch {
    /* ignore */
  }
}

function QuickAccessPanel() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const t = useT();
  const upd = useUpdateCheck();
  if (!loaded) return null;
  const collections = listCollections();
  const libraryOptions = [
    { data: "base:installed", label: t.libInstalled },
    { data: "base:all", label: t.libAll },
    ...collections.map((c) => ({ data: c.id, label: `${c.name} (${c.count})` })),
  ];
  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <ToggleField label={t.pHome} description={t.pHomeDesc} checked={s.homeEnabled} onChange={(v: boolean) => updateSettings({ homeEnabled: v })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t.pTheme}
            rgOptions={[
              { data: "town", label: t.themeTown },
              { data: "neon", label: t.themeNeon },
            ]}
            selectedOption={s.theme}
            onChange={(o: any) => updateSettings({ theme: o.data as Theme })}
          />
        </PanelSectionRow>
        {s.theme === "town" ? (
          <PanelSectionRow>
            <DropdownItem
              label={t.pSky}
              rgOptions={[
                { data: "auto", label: t.skyAuto },
                { data: "day", label: t.skyDay },
                { data: "dusk", label: t.skyDusk },
                { data: "night", label: t.skyNight },
              ]}
              selectedOption={s.sky}
              onChange={(o: any) => updateSettings({ sky: o.data as SkyMode })}
            />
          </PanelSectionRow>
        ) : null}
        <PanelSectionRow>
          <DropdownItem
            label={t.pLibrary}
            rgOptions={libraryOptions}
            selectedOption={libraryOptions.some((o) => o.data === s.library) ? s.library : "base:installed"}
            onChange={(o: any) => updateSettings({ library: String(o.data) })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t.pSort}
            rgOptions={[
              { data: "recent", label: t.sortRecent },
              { data: "alpha", label: t.sortAlpha },
              { data: "playtime", label: t.sortPlaytime },
            ]}
            selectedOption={s.sortMode}
            onChange={(o: any) => updateSettings({ sortMode: o.data as SortMode })}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection>
        <PanelSectionRow>
          <ToggleField label={t.pSound} checked={s.soundEnabled} onChange={(v: boolean) => updateSettings({ soundEnabled: v })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t.pFun} checked={s.funSounds} onChange={(v: boolean) => updateSettings({ funSounds: v })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t.pHaptic} checked={s.hapticEnabled} onChange={(v: boolean) => updateSettings({ hapticEnabled: v })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField label={t.pMood(Math.round(s.mood))} value={Math.round(s.mood)} min={0} max={100} step={1} disabled={true} onChange={() => {}} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              updateSettings({ mood: 80 });
              requestWheelReset();
            }}
          >
            {t.pMoodReset}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t.pLang}
            rgOptions={[
              { data: "auto", label: t.langAuto },
              { data: "ko", label: "한국어" },
              { data: "en", label: "English" },
            ]}
            selectedOption={s.language}
            onChange={(o: any) => updateSettings({ language: o.data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => requestWheelReset()}>
            {t.pReload}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={t.pControls}>
        {t.controls.map(([k, v]) => (
          <PanelSectionRow key={k}>
            <div style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ minWidth: 44, color: "#ffb938", fontWeight: 700 }}>{k}</span>
              <span>{v}</span>
            </div>
          </PanelSectionRow>
        ))}
      </PanelSection>

      <PanelSection title={`${t.pAbout} · v${PLUGIN_VERSION}`}>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={upd.kind === "checking"}
            onClick={() => (upd.kind === "available" ? startUpdate(upd.info) : checkNow())}
          >
            {upd.kind === "checking"
              ? t.pChecking
              : upd.kind === "latest"
                ? t.pLatest(upd.version)
                : upd.kind === "available"
                  ? t.pUpdateTo(upd.info.version)
                  : upd.kind === "error"
                    ? t.pUpdateErr
                    : t.pUpdate}
          </ButtonItem>
        </PanelSectionRow>
        {KOFI_URL ? (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => openUrl(KOFI_URL)}>
              {t.pKofi}
            </ButtonItem>
          </PanelSectionRow>
        ) : null}
        {REPO_URL ? (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => openUrl(REPO_URL)}>
              {t.pRepo}
            </ButtonItem>
          </PanelSectionRow>
        ) : null}
      </PanelSection>
    </>
  );
}

export default definePlugin(() => {
  initSettings();
  installHomePatch();
  return {
    name: "Minimi Town",
    titleView: <div className={staticClasses.Title}>Minimi Town</div>,
    content: (
      <SafeBoundary fallback={<div style={{ padding: 16, color: "#ccc" }}>Minimi Town: settings failed to load.</div>}>
        <QuickAccessPanel />
      </SafeBoundary>
    ),
    icon: <TownIcon />,
    onDismount() {
      removeHomePatch();
      // Don't rely on React running every cleanup: undo everything now
      // (bar styles, hidden row) and sweep any leftovers.
      teardownAll();
      sweepLeftovers();
    },
  };
});
