import { render, fireEvent, waitFor } from "@testing-library/react";
import HomeContainer from "../HomeContainer";
import { SettingsProvider } from "../../../state/settings";
import { ThemeProvider } from "../../../state/theme";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock invoke to control backend responses
vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => {
  return {
    listen: vi.fn().mockResolvedValue(() => {}),
  };
});

// Mock window APIs used by the component
Object.defineProperty(window, "sessionStorage", {
  value: (function () {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })(),
});

// Helper to render with providers
const renderHome = () =>
  render(
    <SettingsProvider>
      <ThemeProvider>
        <HomeContainer onSelectServer={vi.fn()} />
      </ThemeProvider>
    </SettingsProvider>
  );

describe("HomeContainer clear servers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
  });

  it("clears servers and storage when Clear list is clicked", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    // Seed discoveredServers and selectedServerAddress
    window.sessionStorage.setItem(
      "discoveredServers",
      JSON.stringify([{ name: "Plex A", address: "http://1.1.1.1:32400" }])
    );
    window.sessionStorage.setItem("selectedServerAddress", "http://1.1.1.1:32400");

    (invoke as any).mockResolvedValue([]);

    const ui = renderHome();

    // Click Clear list
    fireEvent.click(ui.getByText("Clear list"));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("discoveredServers")).toBeNull();
      expect(window.sessionStorage.getItem("selectedServerAddress")).toBeNull();
    });

    // Ensure save_settings was called with empty discovery
    expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: { discovery: { servers: [], lastSelectedAddress: null } },
    });
  });
});

