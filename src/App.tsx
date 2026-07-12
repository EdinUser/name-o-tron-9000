import { useEffect, useState } from "react";
import HomeContainer from "./pages/Home/HomeContainer";
import LibrarySelectionContainer from "./pages/LibrarySelection/LibrarySelectionContainer";
import ShowSelectionContainer from "./pages/ShowSelection/ShowSelectionContainer";
import PreviewContainer from "./pages/Preview/PreviewContainer";
import SettingsContainer from "./pages/Settings/SettingsContainer";
import { SettingsProvider } from "./state/settings";
import { ThemeProvider } from "./state/theme";
import RiskAcknowledgementModal from "./components/RiskAcknowledgementModal";
import type { PlexLibrary, PlexServer } from "./types/plex";

type Screen = "home" | "libraries" | "shows" | "preview";
type PreviewFrom = "libraries" | "shows" | "music";
const RISK_ACKNOWLEDGEMENT_KEY = "nameotron.riskAcknowledgement.v1";
const RISK_ACKNOWLEDGEMENT_VERSION = 1;

function hasAcceptedRiskAcknowledgement(): boolean {
  try {
    const raw = localStorage.getItem(RISK_ACKNOWLEDGEMENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.accepted === true && parsed?.version === RISK_ACKNOWLEDGEMENT_VERSION;
  } catch {
    return false;
  }
}

function saveRiskAcknowledgement() {
  try {
    localStorage.setItem(
      RISK_ACKNOWLEDGEMENT_KEY,
      JSON.stringify({
        accepted: true,
        version: RISK_ACKNOWLEDGEMENT_VERSION,
        acceptedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // If persistence fails, continue for the current session only.
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [server, setServer] = useState<PlexServer | null>(null);
  const [library, setLibrary] = useState<PlexLibrary | null>(null);
  const [previewFrom, setPreviewFrom] = useState<PreviewFrom>("libraries");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(hasAcceptedRiskAcknowledgement);

  useEffect(() => {
    (window as any).__goto_settings = () => {
      setSettingsModalOpen(true);
    };
    (window as any).__goto_home = () => {
      setScreen("home");
    };
    return () => {
      delete (window as any).__goto_settings;
      delete (window as any).__goto_home;
    };
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
      // Get saved page for this library (session-based, resets on app restart)
      const savedPage = sessionStorage.getItem(`showPage_${library.key}`);
      const initialPage = savedPage ? parseInt(savedPage, 10) : undefined;

      return (
        <ShowSelectionContainer
          server={server}
          library={library}
          initialPage={initialPage}
          onBack={() => setScreen("libraries")}
          onSelectShow={(show, currentPage) => {
            // Store current page for this library (session-based)
            sessionStorage.setItem(`showPage_${library.key}`, currentPage.toString());
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
        {riskAcknowledged ? (
          <>
            {renderCurrentScreen()}
            {settingsModalOpen && <SettingsContainer onClose={() => setSettingsModalOpen(false)} />}
          </>
        ) : (
          <RiskAcknowledgementModal
            onAccept={() => {
              saveRiskAcknowledgement();
              setRiskAcknowledged(true);
            }}
          />
        )}
      </ThemeProvider>
    </SettingsProvider>
  );
}

export default App;
