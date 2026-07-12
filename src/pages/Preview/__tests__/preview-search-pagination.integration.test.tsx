import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import PreviewContainer from "../PreviewContainer";
import { SettingsProvider } from "../../../state/settings";
import { ThemeProvider } from "../../../state/theme";
import {
  buildMockShowSeasonDirectories,
  getMockEpisodesForShowSeason,
  getMockMovies,
  getMockSearchMovies,
  getMockSearchTv,
} from "../../../testUtils/mockPlexFixtures";
import type { PlexLibrary, PlexServer } from "../../../types/plex";
import { generateServerId } from "../../../utils/cache";

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
  roots: ["/share/plex/Series"],
};

const firstTrackedMoviePath =
  getMockMovies(1)[0]?.Media?.[0]?.Part?.[0]?.file ?? "";

function renderWithProviders(component: React.ReactElement) {
  return render(
    <SettingsProvider>
      <ThemeProvider>{component}</ThemeProvider>
    </SettingsProvider>,
  );
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
    const movieEntries = getMockMovies();
    const initialLibraryRows = movieEntries.slice(0, 11);
    const secondLibraryRows = movieEntries.slice(11, 20);
    const searchRows = getMockSearchMovies(12);

    let searchCallCount = 0;

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

  it("re-runs remote movie search after reload when the query is unchanged", async () => {
    const movieEntries = getMockMovies();
    const initialLibraryRows = movieEntries.slice(0, 11);
    const secondLibraryRows = movieEntries.slice(11, 20);
    const searchRows = getMockSearchMovies(12);

    let searchCallCount = 0;

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
              Hub: searchCallCount === 1 ? [{ Metadata: searchRows }] : [{ Metadata: searchRows }],
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
      expect(searchCallCount).toBe(1);
    });

    await waitFor(() => {
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Carry On 1 \(1971\)\.mkv/).length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => {
      expect(searchCallCount).toBe(2);
    });

    await waitFor(() => {
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Carry On 1 \(1971\)\.mkv/).length).toBeGreaterThan(0);
    });
  });

  it("reloads movies from the first page instead of reusing stale pagination offsets", async () => {
    const initialLibraryRows = getMockMovies(3);
    const fetchStarts: number[] = [];

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
      expect(screen.getByText(firstTrackedMoviePath)).toBeInTheDocument();
    });

    const fetchCountBeforeReload = fetchStarts.length;

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => {
      expect(screen.getByText(firstTrackedMoviePath)).toBeInTheDocument();
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
    });

    expect(fetchStarts.slice(fetchCountBeforeReload)).toContain(0);
  });

  it("renders movie ID placeholders from Guid metadata returned by the section page", async () => {
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
              movies: "blocks",
              tv: "blocks",
            },
          },
          templates: {
            movie: "{title}[ ({year})] {imdbToken}",
          },
          movies: {
            ids: "none",
          },
        });
      }
      return null;
    });

    const movieEntry = {
      ...getMockMovies(1)[0],
      guid: "plex://movie/local-only",
      Guid: [{ id: "imdb://tt0816692" }, { id: "tmdb://157336" }],
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
              Metadata: [movieEntry],
              totalSize: 1,
              size: 1,
              offset: 0,
            },
          };
        case "fetch_plex_metadata":
          throw new Error("Movie ID placeholders should not trigger per-movie metadata hydration");
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames":
          return {
            video_operations: [],
            subtitle_operations: [],
            warnings: [],
            blocking_errors: [],
          };
        case "fetch_plex_image":
          return "data:image/jpeg;base64,ZmFrZQ==";
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
      expect(screen.getByText(/Interstellar \(2014\) \{imdb-tt0816692\}\.mkv/)).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("fetch_plex_metadata", expect.anything());
  });

  it("fetches posters for movie blocks view rows loaded on page 3", async () => {
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
              movies: "blocks",
              tv: "blocks",
            },
          },
        });
      }
      return null;
    });

    const movieEntries = getMockMovies();
    const page1Rows = movieEntries.slice(0, 10);
    const page2Rows = movieEntries.slice(10, 20);
    const page3Rows = movieEntries.slice(20, 25);
    const fetchImageCalls: string[] = [];
    const fetchStarts: number[] = [];

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
          fetchStarts.push(Number(args?.start ?? 0));
          if (args?.start === 0) {
            return {
              MediaContainer: {
                Metadata: page1Rows,
                totalSize: 25,
                size: page1Rows.length,
                offset: 0,
              },
            };
          }
          if (args?.start === 10) {
            return {
              MediaContainer: {
                Metadata: page2Rows,
                totalSize: 25,
                size: page2Rows.length,
                offset: 10,
              },
            };
          }
          if (args?.start === 20) {
            return {
              MediaContainer: {
                Metadata: page3Rows,
                totalSize: 25,
                size: page3Rows.length,
                offset: 20,
              },
            };
          }
          return {
            MediaContainer: {
              Metadata: [],
              totalSize: 25,
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
        case "fetch_plex_image":
          fetchImageCalls.push(String(args?.imagePath ?? ""));
          return "data:image/jpeg;base64,ZmFrZQ==";
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
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText(/Page 2 \/ /)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText(/Page 3 \/ 3/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(fetchImageCalls).toContain(page3Rows[0]?.thumb);
    });

    expect(screen.getByAltText(`${page3Rows[0]?.title} poster`)).toBeInTheDocument();
    expect(fetchStarts.filter((start) => start === 10)).toHaveLength(1);
  });

  it("fetches posters for remote movie search results in blocks view", async () => {
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
              movies: "blocks",
              tv: "blocks",
            },
          },
        });
      }
      return null;
    });

    const searchRows = getMockSearchMovies(1);
    const searchMovie = searchRows[0];
    const remoteLibrary = {
      ...mockLibrary,
      roots: ["/mount/server/HDD1/Movies"],
    };
    const fetchImageCalls: string[] = [];

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
              Metadata: [],
              totalSize: 0,
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
        case "fetch_plex_image":
          fetchImageCalls.push(String(args?.imagePath ?? ""));
          return "data:image/jpeg;base64,ZmFrZQ==";
        case "search_content":
          return {
            MediaContainer: {
              Hub: [{ Metadata: searchRows }],
            },
          };
        default:
          throw new Error(`Unexpected invoke: ${command}`);
      }
    });

    renderWithProviders(
      <PreviewContainer
        server={mockServer}
        library={remoteLibrary}
        onBack={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search files...");
    await userEvent.type(searchInput, "carry");

    await waitFor(() => {
      expect(fetchImageCalls).toContain(searchMovie?.thumb);
    });

    expect(screen.getByAltText(`${searchMovie?.title} poster`)).toBeInTheDocument();
  });

  it("attaches subtitle operations to remote movie search results", async () => {
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
              movies: "blocks",
              tv: "blocks",
            },
          },
        });
      }
      return null;
    });

    const searchRows = getMockSearchMovies(1);
    const searchMovie = searchRows[0];
    const remoteFile = String(searchMovie?.Media?.[0]?.Part?.[0]?.file ?? "");
    const remoteSubtitle = remoteFile.replace(/\.mkv$/, ".bul.srt");
    const remoteLibrary = {
      ...mockLibrary,
      roots: ["/mount/server/HDD1/Movies"],
    };
    const previewScopes: string[][] = [];

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
              Metadata: [],
              totalSize: 0,
              size: 0,
              offset: args?.start ?? 0,
            },
          };
        case "sanitize_filename_cmd":
          return args?.filename;
        case "preview_video_renames": {
          const scope = args?.request?.scope ?? [];
          previewScopes.push(scope);
          const subtitleOperations = scope.includes(remoteFile)
            ? [
                {
                  original_path: remoteSubtitle,
                  new_path: remoteSubtitle,
                  operation_type: "rename",
                  warning_flags: [],
                },
              ]
            : [];
          return {
            video_operations: [],
            subtitle_operations: subtitleOperations,
            warnings: [],
            blocking_errors: [],
          };
        }
        case "search_content":
          return {
            MediaContainer: {
              Hub: [{ Metadata: searchRows }],
            },
          };
        case "fetch_plex_image":
          return "data:image/jpeg;base64,ZmFrZQ==";
        default:
          throw new Error(`Unexpected invoke: ${command}`);
      }
    });

    renderWithProviders(
      <PreviewContainer
        server={mockServer}
        library={remoteLibrary}
        onBack={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search files...");
    await userEvent.type(searchInput, "carry");

    await waitFor(() => {
      expect(previewScopes.some((scope) => scope.includes(remoteFile))).toBe(true);
    });

    expect(await screen.findByTitle("1 subtitle operation")).toBeInTheDocument();
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

    const seasonDirectories = buildMockShowSeasonDirectories("200");
    const seasonOneEpisodes = getMockEpisodesForShowSeason("200", 1);
    const firstSeasonBatch = seasonOneEpisodes.slice(0, 30);
    const secondSeasonBatch = seasonOneEpisodes.slice(30);
    const fetchStarts: number[] = [];

    (window as any).__initialShow = { ratingKey: "200", title: "Abyssal Gate" };

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return {
            pathMappings: [
              {
                server_id: "test-server-id",
                plex_root: "/share/plex/Series",
                local_root: "/mnt/TV",
              },
            ],
          };
        case "fetch_show_seasons":
          return {
            MediaContainer: {
              Metadata: seasonDirectories,
            },
          };
        case "fetch_plex_metadata":
          fetchStarts.push(Number(args?.start ?? 0));
          if (args?.start === 0) {
            return {
              MediaContainer: {
                Metadata: firstSeasonBatch,
                totalSize: seasonOneEpisodes.length,
                size: firstSeasonBatch.length,
                offset: 0,
              },
            };
          }
          if (args?.start === 30) {
            return {
              MediaContainer: {
                Metadata: secondSeasonBatch,
                totalSize: seasonOneEpisodes.length,
                size: secondSeasonBatch.length,
                offset: 30,
              },
            };
          }
          return {
            MediaContainer: {
              Metadata: [],
              totalSize: seasonOneEpisodes.length,
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
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText(/Page 2 \/ 2/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading more episodes…")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Abyssal_Gate\.S01E50\.mkv/).length).toBeGreaterThan(0);
    });

    expect(fetchStarts).toEqual([0, 30]);
    delete (window as any).__initialShow;
  });

  it("uses tracked TV remote search results when a show query has no local matches", async () => {
    const seasonDirectories = buildMockShowSeasonDirectories("200");
    const seasonOneEpisodes = getMockEpisodesForShowSeason("200", 1).slice(0, 20);
    const tvSearchRows = getMockSearchTv();
    let searchCallCount = 0;

    (window as any).__initialShow = { ratingKey: "200", title: "Abyssal Gate" };

    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      switch (command) {
        case "get_settings":
          return {
            pathMappings: [
              {
                server_id: "test-server-id",
                plex_root: "/share/plex/Series",
                local_root: "/mnt/TV",
              },
            ],
          };
        case "fetch_show_seasons":
          return {
            MediaContainer: {
              Metadata: seasonDirectories,
            },
          };
        case "fetch_plex_metadata":
          return {
            MediaContainer: {
              Metadata: seasonOneEpisodes,
              totalSize: seasonOneEpisodes.length,
              size: seasonOneEpisodes.length,
              offset: Number(args?.start ?? 0),
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
        case "fetch_plex_image":
          return "data:image/jpeg;base64,ZmFrZQ==";
        case "search_content":
          searchCallCount += 1;
          return {
            MediaContainer: {
              Hub: [{ Metadata: tvSearchRows }],
            },
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
      expect(screen.getByText("Season 01 (50 episodes)")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search files...");
    await userEvent.type(searchInput, "dock");

    await waitFor(() => {
      expect(screen.queryByText("No items to preview.")).not.toBeInTheDocument();
      expect(screen.getAllByText(/First Dock/).length).toBeGreaterThan(0);
    });

    expect(searchCallCount).toBe(1);
    delete (window as any).__initialShow;
  });

  it("restores a recent per-library template from the preview input dropdown", async () => {
    const serverId = generateServerId(mockServer);
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
          templates: {
            movie: "{title}[ ({year})]{ext}",
          },
          templateHistory: {
            [serverId]: {
              [mockLibrary.key]: [
                "{title}{ext}",
                "{title}[ ({year})]{ext}",
              ],
            },
          },
        });
      }
      return null;
    });

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
              Metadata: getMockMovies(1),
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
      expect(screen.getByText(firstTrackedMoviePath)).toBeInTheDocument();
    });

    const templateInput = screen.getByPlaceholderText("Movie template");
    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getByText("Recent templates")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "{title}" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "{title}" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("{title}")).toBeInTheDocument();
    });
  });

  it("can save a recent template as a persistent favorite and delete it from the saved section", async () => {
    const serverId = generateServerId(mockServer);
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
          templates: {
            movie: "{title}[ ({year})]{ext}",
          },
          templateHistory: {
            [serverId]: {
              [mockLibrary.key]: [
                "{title}{ext}",
                "{title}[ ({year})]{ext}",
              ],
            },
          },
          templateFavorites: {
            [serverId]: {
              [mockLibrary.key]: [
                "{title}/Extras/{title}{ext}",
              ],
            },
          },
        });
      }
      return null;
    });

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
              Metadata: getMockMovies(1),
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
      expect(screen.getByText(firstTrackedMoviePath)).toBeInTheDocument();
    });

    const templateInput = screen.getByPlaceholderText("Movie template");
    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getByText("Recent templates")).toBeInTheDocument();
      expect(screen.getByText("Saved templates")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Save" }).length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getByText("Saved templates")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "{title}" }).length).toBeGreaterThanOrEqual(2);
      expect(screen.queryAllByRole("button", { name: "Save" }).length).toBe(1);
      expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "{title}" }).length).toBe(1);
      expect(screen.getByRole("button", { name: "{title}/Extras/{title}" })).toBeInTheDocument();
      expect(screen.queryAllByRole("button", { name: "Delete" }).length).toBe(1);
      expect(screen.queryAllByRole("button", { name: "Save" }).length).toBe(2);
    });
  });

  it("does not add in-progress template edits to history until the input blurs", async () => {
    const serverId = generateServerId(mockServer);
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
          templates: {
            movie: "{title}[ ({year})]{ext}",
          },
          templateHistory: {
            [serverId]: {
              [mockLibrary.key]: [
                "{title}[ ({year})]{ext}",
              ],
            },
          },
        });
      }
      return null;
    });

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
              Metadata: getMockMovies(1),
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
      expect(screen.getByText(firstTrackedMoviePath)).toBeInTheDocument();
    });

    const templateInput = screen.getByPlaceholderText("Movie template");
    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getByText("Recent templates")).toBeInTheDocument();
    });

    fireEvent.change(templateInput, {
      target: { value: "{title}[ ({year})][ {plexIds}]{ext}" },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });

    expect(screen.queryByRole("button", { name: "{title}[ ({year})][ {plexIds}]" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    await userEvent.click(templateInput);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "{title}[ ({year})][ {plexIds}]" })).toBeInTheDocument();
    });
  });
});
