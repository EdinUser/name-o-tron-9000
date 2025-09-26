import { useEffect, useState } from "react";
import Home from "./pages/Home";
import LibrarySelection from "./pages/LibrarySelection";
import Preview from "./pages/Preview";
import SettingsPage from "./pages/Settings";
import type { PlexLibrary, PlexServer } from "./types/plex";

type Screen = "home" | "libraries" | "preview" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [server, setServer] = useState<PlexServer | null>(null);
  const [library, setLibrary] = useState<PlexLibrary | null>(null);

  useEffect(() => {
    (window as any).__goto_settings = () => setScreen("settings");
    return () => { delete (window as any).__goto_settings; };
  }, []);

  if (screen === "home") {
    return (
      <Home
        onSelectServer={(s) => {
          setServer(s);
          setScreen("libraries");
        }}
        // Quick path to settings
      />
    );
  }

  if (screen === "settings") {
    return (
      <SettingsPage
        onBack={() => setScreen(server ? "libraries" : "home")}
      />
    );
  }

  if (screen === "libraries" && server) {
    return (
      <LibrarySelection
        server={server}
        onBack={() => setScreen("home")}
        onSelectLibrary={(lib) => {
          setLibrary(lib);
          setScreen("preview");
        }}
      />
    );
  }

  if (screen === "preview" && server && library) {
    return (
      <Preview
        server={server}
        library={library}
        onBack={() => setScreen("libraries")}
      />
    );
  }

  return <Home onSelectServer={(s) => { setServer(s); setScreen("libraries"); }} />;
}

export default App;
