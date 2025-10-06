import { useEffect, useState } from "react";
import HomeContainer from "./pages/Home/HomeContainer";
import LibrarySelectionContainer from "./pages/LibrarySelection/LibrarySelectionContainer";
import ShowSelectionContainer from "./pages/ShowSelection/ShowSelectionContainer";
import PreviewContainer from "./pages/Preview/PreviewContainer";
import SettingsContainer from "./pages/Settings/SettingsContainer";
import { SettingsProvider } from "./state/settings";
import { ThemeProvider } from "./state/theme";
import type { PlexLibrary, PlexServer } from "./types/plex";

type Screen = "home" | "libraries" | "shows" | "preview";
type PreviewFrom = "libraries" | "shows" | "music";

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [server, setServer] = useState<PlexServer | null>(null);
  const [library, setLibrary] = useState<PlexLibrary | null>(null);
  const [previewFrom, setPreviewFrom] = useState<PreviewFrom>("libraries");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    (window as any).__goto_settings = () => {
      setSettingsModalOpen(true);
    };
    (window as any).__goto_home = () => {
      setScreen("home");
    };
    return () => { delete (window as any).__goto_settings; };
  }, []);

  const renderCurrentScreen = () => {
    if (screen === "home") {
      return (
        <HomeContainer
          onSelectServer={(s) => {
            setServer(s);
            setScreen("libraries");
          }}
          // Quick path to settings
        />
      );
    }

    if (screen === "libraries" && server) {
      return (
        <LibrarySelectionContainer
          server={server}
          onBack={() => setScreen("home")}
          onSelectLibrary={(lib) => {
            setLibrary(lib);
            if (lib.type === "show") {
              setScreen("shows");
            } else {
              setPreviewFrom("libraries");
              setScreen("preview");
            }
          }}
        />
      );
    }

    if (screen === "shows" && server && library) {
      return (
        <ShowSelectionContainer
          server={server}
          library={library}
          onBack={() => setScreen("libraries")}
          onSelectShow={(show) => {
            // pass through to Preview; it can start from this show
            (window as any).__initialShow = show;
            setPreviewFrom("shows");
            setScreen("preview");
          }}
        />
      );
    }

    if (screen === "preview" && server && library) {
      return (
        <PreviewContainer
          server={server}
          library={library}
          onBack={() => setScreen(previewFrom === "shows" ? "shows" : "libraries")}
        />
      );
    }

    // Fallback to home if screen state is invalid
    return (
      <HomeContainer onSelectServer={(s) => { setServer(s); setScreen("libraries"); }} />
    );
  };

  return (
    <SettingsProvider>
      <ThemeProvider>
        {renderCurrentScreen()}
        {settingsModalOpen && <SettingsContainer onClose={() => setSettingsModalOpen(false)} />}
      </ThemeProvider>
    </SettingsProvider>
  );
}

export default App;
