import { render, fireEvent, waitFor } from "@testing-library/react";
import HomeContainer from "../HomeContainer";
import { SettingsProvider } from "../../../state/settings";
import { ThemeProvider } from "../../../state/theme";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

async function setupInvokeMock(overrides: Record<string, any> = {}) {
  const { invoke } = await import("@tauri-apps/api/core");
  (invoke as any).mockImplementation((command: string, args?: any) => {
    const override = overrides[command];
    if (typeof override === "function") {
      return override(args);
    }
    if (typeof override !== "undefined") {
      return Promise.resolve(override);
    }
    if (command === "get_settings") {
      return Promise.resolve({});
    }
    if (command === "secure_get_token") {
      return Promise.resolve(null);
    }
    if (command === "save_settings") {
      return Promise.resolve(undefined);
    }
    if (command === "plex_discover") {
      return Promise.resolve([]);
    }
    return Promise.resolve(undefined);
  });
  return invoke as any;
}

describe("HomeContainer discovery persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges restored servers with discovered results instead of replacing them", async () => {
    const invoke = await setupInvokeMock({
      plex_discover: [{ name: "Local Plex", address: "http://localhost:32400" }],
    });

    window.sessionStorage.setItem(
      "discoveredServers",
      JSON.stringify([{ name: "Remote Plex", address: "http://10.0.0.5:32400" }])
    );
    window.sessionStorage.setItem("selectedServerAddress", "http://10.0.0.5:32400");

    const ui = renderHome();

    fireEvent.click(ui.getByText("Discover"));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("discoveredServers")).toBe(
        JSON.stringify([
          { name: "Remote Plex", address: "http://10.0.0.5:32400" },
          { name: "Local Plex", address: "http://localhost:32400" },
        ])
      );
    });

    expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: {
        discovery: {
          servers: [
            { name: "Remote Plex", address: "http://10.0.0.5:32400" },
            { name: "Local Plex", address: "http://localhost:32400" },
          ],
        },
      },
    });
  });

  it("clears servers and storage when Clear list is clicked", async () => {
    const invoke = await setupInvokeMock();
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

  it("removes a single server and updates the selected address", async () => {
    const invoke = await setupInvokeMock();

    window.sessionStorage.setItem(
      "discoveredServers",
      JSON.stringify([
        { name: "Plex A", address: "http://1.1.1.1:32400" },
        { name: "Plex B", address: "http://2.2.2.2:32400" },
      ])
    );
    window.sessionStorage.setItem("selectedServerAddress", "http://1.1.1.1:32400");

    const ui = renderHome();

    fireEvent.click(ui.getByRole("button", { name: "Remove Plex A" }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("discoveredServers")).toBe(
        JSON.stringify([{ name: "Plex B", address: "http://2.2.2.2:32400" }])
      );
      expect(window.sessionStorage.getItem("selectedServerAddress")).toBe("http://2.2.2.2:32400");
    });

    expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: {
        discovery: {
          servers: [{ name: "Plex B", address: "http://2.2.2.2:32400" }],
          lastSelectedAddress: "http://2.2.2.2:32400",
        },
      },
    });
  });

  it("restores localhost from saved discovery state on Home load", async () => {
    await setupInvokeMock({
      get_settings: {
        discovery: {
          servers: [{ name: "Local Plex", address: "http://localhost:32400" }],
          lastSelectedAddress: "http://localhost:32400",
        },
      },
      plex_discover: [],
    });

    const ui = renderHome();

    await waitFor(() => {
      expect(ui.getByText("Local Plex")).toBeInTheDocument();
      expect(ui.getByText("http://localhost:32400")).toBeInTheDocument();
    });
  });

  it("restores localhost from session storage on Home load", async () => {
    await setupInvokeMock({
      get_settings: {},
      plex_discover: [],
    });

    window.sessionStorage.setItem(
      "discoveredServers",
      JSON.stringify([{ name: "Local Plex", address: "http://localhost:32400" }])
    );
    window.sessionStorage.setItem("selectedServerAddress", "http://localhost:32400");

    const ui = renderHome();

    await waitFor(() => {
      expect(ui.getByText("Local Plex")).toBeInTheDocument();
      expect(ui.getByText("http://localhost:32400")).toBeInTheDocument();
    });
  });

  it("still filters legacy mock entries by name during restore", async () => {
    await setupInvokeMock({
      get_settings: {
        discovery: {
          servers: [{ name: "Mock Plex (Legacy)", address: "http://localhost:32400" }],
        },
      },
      plex_discover: [],
    });

    const ui = renderHome();

    await waitFor(() => {
      expect(ui.queryByText("Mock Plex (Legacy)")).not.toBeInTheDocument();
      expect(ui.getByText("No servers found via discovery.")).toBeInTheDocument();
    });
  });
});
