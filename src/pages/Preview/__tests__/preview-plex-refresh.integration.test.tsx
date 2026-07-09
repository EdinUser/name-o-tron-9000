import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import PreviewContainer from "../PreviewContainer";
import { SettingsProvider } from "../../../state/settings";
import { ThemeProvider } from "../../../state/theme";
import type { PlexLibrary, PlexServer } from "../../../types/plex";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
  })),
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

const mockInvoke = vi.mocked(invoke);

const mockServer: PlexServer = {
  name: "Test Server",
  address: "http://192.168.1.100:32400",
  machineIdentifier: "test-server-id",
  owned: true,
};

const mockLibrary: PlexLibrary = {
  key: "1",
  title: "Movies",
  type: "movie",
  roots: ["/share/Movies"],
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <SettingsProvider>
      <ThemeProvider>{component}</ThemeProvider>
    </SettingsProvider>,
  );
}

describe("Preview Plex refresh integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", vi.fn());

    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === "plexToken") return "fake-token";
      if (key === "nameotron.settings.v1") {
        return JSON.stringify({
          general: {
            pagination: {
              defaultMovieLimit: 20,
              defaultShowLimit: 20,
              defaultMusicLimit: 200,
            },
            viewMode: {
              movies: "table",
              tv: "table",
            },
          },
        });
      }
      return null;
    });

    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "get_settings":
          return {
            pathMappings: [
              {
                server_id: "test-server-id",
                plex_root: "/share/Movies",
                local_root: "/mnt/Movies",
              },
            ],
          };
        case "fetch_library_content":
          return {
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: "23475",
                  title: "50 First Dates",
                  year: 2004,
                  Media: [
                    {
                      Part: [
                        {
                          file: "/share/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv",
                        },
                      ],
                    },
                  ],
                },
              ],
              totalSize: 1,
              size: 1,
              offset: 0,
            },
          };
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [],
            warnings: [],
            blocking_errors: [],
          };
        case "undo_last_rename":
          return {
            success: true,
            operations_applied: 1,
            operations_failed: 0,
            rollback_log_path: "/tmp/rollback.json",
            errors: [],
            operations: [
              {
                operation_type: "rename",
                original_path: "/mnt/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv",
                new_path: "/mnt/Movies/Normal/A-I/50 First Dates/50 First Dates [Renamed].mkv",
                backup_path: null,
                operation_id: "movie_1",
              },
            ],
          };
        case "plex_refresh_library_section_with_path":
          return "ok";
        default:
          return null;
      }
    });
  });

  it("triggers a targeted Plex path refresh after a successful undo", async () => {
    renderWithProviders(
      <PreviewContainer server={mockServer} library={mockLibrary} onBack={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /undo/i }));
    await userEvent.click(screen.getByRole("button", { name: "Undo Last Rename" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("plex_refresh_library_section_with_path", {
        server: mockServer.address,
        sectionId: 1,
        path: "/share/Movies/Normal/A-I/50 First Dates",
        token: "fake-token",
      });
    });
  });
});
