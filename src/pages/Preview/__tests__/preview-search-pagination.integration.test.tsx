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
  title: "HD Movies",
  type: "movie",
  roots: ["/media/Movies"],
};

const mockShowLibrary: PlexLibrary = {
  key: "2",
  title: "TV Shows",
  type: "show",
  roots: ["/media/TV"],
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <SettingsProvider>
      <ThemeProvider>{component}</ThemeProvider>
    </SettingsProvider>,
  );
}

function makeLibraryMovie(index: number) {
  return {
    ratingKey: `library-${index}`,
    title: `Library Movie ${index}`,
    year: 2000 + index,
    Media: [{ Part: [{ file: `/media/Movies/Library Movie ${index} (${2000 + index}).mkv` }] }],
  };
}

function makeSearchMovie(index: number) {
  return {
    ratingKey: `carry-${index}`,
    key: `/library/metadata/carry-${index}`,
    title: `Carry On ${index}`,
    year: 1970 + index,
    Media: [{ Part: [{ file: `/media/Movies/Carry On ${index}/Carry On ${index} (${1970 + index}).mkv` }] }],
    Genre: [{ tag: "Comedy" }],
    studio: "Studio",
  };
}

function makeSeasonEpisode(index: number) {
  return {
    ratingKey: `episode-${index}`,
    key: `/library/metadata/episode-${index}`,
    type: "episode",
    title: `Episode ${index}`,
    grandparentTitle: "Abyssal Gate",
    parentTitle: "Season 01",
    parentIndex: 1,
    index,
    year: 2023,
    Media: [{ Part: [{ file: `/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E${String(index).padStart(2, "0")} - Episode ${index}.mkv` }] }],
  };
}

describe("Preview movie search pagination regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === "plexToken") return "fake-token";
      if (key === "nameotron.settings.v1") {
        return JSON.stringify({
          general: {
            pagination: {
              defaultMovieLimit: 10,
              defaultShowLimit: 20,
              defaultMusicLimit: 200,
            },
            viewMode: {
              movies: "table",
              tv: "blocks",
            },
          },
        });
      }
      return null;
    });
  });

  it("keeps remote movie search results paginated after moving to page 2", async () => {
    const initialLibraryRows = Array.from({ length: 11 }, (_, index) => makeLibraryMovie(index + 1));
    const secondLibraryRows = Array.from({ length: 9 }, (_, index) => makeLibraryMovie(index + 12));
    const searchRows = Array.from({ length: 12 }, (_, index) => makeSearchMovie(index + 1));

    let searchCallCount = 0;

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return { pathMappings: [{ server_id: "test-server-id", plex_root: "/media/Movies", local_root: "/mnt/Movies" }] };
        case "fetch_library_content":
          if (args?.start === 0) {
            return {
              MediaContainer: {
                Metadata: initialLibraryRows,
                totalSize: 100,
                size: initialLibraryRows.length,
                offset: 0,
              },
            };
          }
          if (args?.start === 11) {
            return {
              MediaContainer: {
                Metadata: secondLibraryRows,
                totalSize: 100,
                size: secondLibraryRows.length,
                offset: 11,
              },
            };
          }
          return {
            MediaContainer: {
              Metadata: [],
              totalSize: 100,
              size: 0,
              offset: args?.start ?? 0,
            },
          };
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [],
            warnings: [],
            blocking_errors: [],
          };
        case "search_content":
          searchCallCount += 1;
          return {
            MediaContainer: {
              Hub: searchCallCount === 1 ? [{ Metadata: searchRows }] : [{ Metadata: [] }],
            },
          };
        default:
          throw new Error(`Unexpected invoke: ${command}`);
      }
    });

    renderWithProviders(
      <PreviewContainer
        server={mockServer}
        library={mockLibrary}
        onBack={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search files...");
    await userEvent.type(searchInput, "carry");

    await waitFor(() => {
      expect(screen.getByText("12 results • Page 1 / 2")).toBeInTheDocument();
    });

    expect(searchCallCount).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("12 results • Page 2 / 2")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Carry On 11 \(1981\)\.mkv/).length).toBeGreaterThan(0);
    });

    expect(searchCallCount).toBe(1);
  });

  it("reloads movies from the first page instead of reusing stale pagination offsets", async () => {
    const initialLibraryRows = Array.from({ length: 3 }, (_, index) => makeLibraryMovie(index + 1));
    const fetchStarts: number[] = [];

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return { pathMappings: [{ server_id: "test-server-id", plex_root: "/media/Movies", local_root: "/mnt/Movies" }] };
        case "fetch_library_content":
          fetchStarts.push(Number(args?.start ?? 0));
          if (args?.start === 0) {
            return {
              MediaContainer: {
                Metadata: initialLibraryRows,
                totalSize: initialLibraryRows.length,
                size: initialLibraryRows.length,
                offset: 0,
              },
            };
          }
          return {
            MediaContainer: {
              Metadata: [],
              totalSize: initialLibraryRows.length,
              size: 0,
              offset: args?.start ?? 0,
            },
          };
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [],
            warnings: [],
            blocking_errors: [],
          };
        default:
          throw new Error(`Unexpected invoke: ${command}`);
      }
    });

    renderWithProviders(
      <PreviewContainer
        server={mockServer}
        library={mockLibrary}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Library Movie 1 (2001).mkv")).toBeInTheDocument();
    });

    const fetchCountBeforeReload = fetchStarts.length;

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => {
      expect(screen.getByText("Library Movie 1 (2001).mkv")).toBeInTheDocument();
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
    });

    expect(fetchStarts.slice(fetchCountBeforeReload)).toContain(0);
  });

  it("loads more TV season episodes when page 2 needs more rows", async () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === "plexToken") return "fake-token";
      if (key === "nameotron.settings.v1") {
        return JSON.stringify({
          general: {
            pagination: {
              defaultMovieLimit: 10,
              defaultShowLimit: 25,
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

    const firstSeasonBatch = Array.from({ length: 30 }, (_, index) => makeSeasonEpisode(index + 1));
    const secondSeasonBatch = Array.from({ length: 20 }, (_, index) => makeSeasonEpisode(index + 31));
    const fetchStarts: number[] = [];

    (window as any).__initialShow = { ratingKey: "show-1", title: "Abyssal Gate" };

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return { pathMappings: [{ server_id: "test-server-id", plex_root: "/media/TV", local_root: "/mnt/TV" }] };
        case "fetch_show_seasons":
          return {
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: "season-1",
                  key: "/library/metadata/season-1/children",
                  index: 1,
                  title: "Season 01",
                  leafCount: 50,
                },
              ],
            },
          };
        case "fetch_plex_metadata":
          fetchStarts.push(Number(args?.start ?? 0));
          if (args?.start === 0) {
            return {
              MediaContainer: {
                Metadata: firstSeasonBatch,
                totalSize: 50,
                size: firstSeasonBatch.length,
                offset: 0,
              },
            };
          }
          if (args?.start === 30) {
            return {
              MediaContainer: {
                Metadata: secondSeasonBatch,
                totalSize: 50,
                size: secondSeasonBatch.length,
                offset: 30,
              },
            };
          }
          return {
            MediaContainer: {
              Metadata: [],
              totalSize: 50,
              size: 0,
              offset: args?.start ?? 0,
            },
          };
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [],
            warnings: [],
            blocking_errors: [],
          };
        default:
          throw new Error(`Unexpected invoke: ${command}`);
      }
    });

    renderWithProviders(
      <PreviewContainer
        server={mockServer}
        library={mockShowLibrary}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("30 results • Page 1 / 2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("50 results • Page 2 / 2")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading more episodes…")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Episode 50\.mkv/).length).toBeGreaterThan(0);
    });

    expect(fetchStarts).toEqual([0, 30]);
    delete (window as any).__initialShow;
  });
});
