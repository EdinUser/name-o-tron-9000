import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import PreviewContainer from "../PreviewContainer";
import { SettingsProvider } from "../../../state/settings";
import { ThemeProvider } from "../../../state/theme";
import type { PlexLibrary, PlexServer } from "../../../types/plex";
import { buildPreviewMovieMetadata } from "../../../testUtils/mockPlexFixtures";

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
  roots: ["/mount/server/HDD1/Movies"],
};

const trackedMovie = buildPreviewMovieMetadata("101");
const trackedMovieFile = trackedMovie.Media?.[0]?.Part?.[0]?.file ?? "";
const trackedMovieFolder = trackedMovieFile.split("/").slice(0, -1).join("/");

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
                plex_root: "/mount/server/HDD1/Movies",
                local_root: "/mnt/Movies",
              },
            ],
          };
        case "fetch_library_content":
          return {
            MediaContainer: {
              Metadata: [trackedMovie],
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
                original_path: trackedMovieFile.replace("/mount/server/HDD1/Movies", "/mnt/Movies"),
                new_path: trackedMovieFile
                  .replace("/mount/server/HDD1/Movies", "/mnt/Movies")
                  .replace(".mkv", " [Renamed].mkv"),
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
      const refreshCall = mockInvoke.mock.calls.find(
        ([command]) => command === "plex_refresh_library_section_with_path",
      );
      expect(refreshCall).toBeDefined();
      expect(refreshCall?.[1]).toMatchObject({
        server: mockServer.address,
        sectionId: 1,
        path: trackedMovieFolder,
      });
    });
  });

  it("sends subtitle rename operations together with the movie apply request", async () => {
    const movieWithTrailingSpace = {
      ...trackedMovie,
      title: "One Piece Film Red",
      year: 2022,
      Media: [
        {
          Part: [
            {
              file: "/mount/server/HDD1/Movies/One Piece Film Red (2022) .mkv",
            },
          ],
        },
      ],
    };

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return {
            pathMappings: [
              {
                server_id: "test-server-id",
                plex_root: "/mount/server/HDD1/Movies",
                local_root: "/mnt/Movies",
              },
            ],
          };
        case "fetch_library_content":
          return {
            MediaContainer: {
              Metadata: [movieWithTrailingSpace],
              totalSize: 1,
              size: 1,
              offset: 0,
            },
          };
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [
              {
                original_path: "/mnt/Movies/One Piece Film Red (2022) .eng.srt",
                new_path: "/mnt/Movies/One Piece Film Red (2022) .eng.srt",
                operation_type: "rename",
              },
            ],
            warnings: [],
            blocking_errors: [],
          };
        case "apply_video_renames":
          return {
            success: true,
            operations_applied: 2,
            operations_failed: 0,
            rollback_log_path: "/tmp/rollback.json",
            errors: [],
            operations: args?.request?.operations ?? [],
          };
        default:
          return null;
      }
    });

    renderWithProviders(
      <PreviewContainer server={mockServer} library={mockLibrary} onBack={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("switch")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      const applyCall = mockInvoke.mock.calls.find(
        ([command]) => command === "apply_video_renames",
      );
      expect(applyCall).toBeDefined();
      const operations = (applyCall?.[1] as any)?.request?.operations ?? [];
      expect(operations).toHaveLength(2);
      expect(
        operations.some((operation: any) =>
          operation.original_path === "/mnt/Movies/One Piece Film Red (2022) .eng.srt" &&
          operation.new_path.endsWith("/One Piece Film Red (2022).eng.srt"),
        ),
      ).toBe(true);
    });
  });
});
