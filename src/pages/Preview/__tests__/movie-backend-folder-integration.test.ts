import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeMovieProposal } from "../movieProposal";
import type { MovieItem } from "../types";

// Mock Tauri invoke used by computeMovieProposal
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "sanitize_filename_cmd") {
      // Echo back the filename to keep behavior simple for tests
      return args.filename;
    }
    if (cmd === "compute_movie_destinations") {
      const items = args.request?.items || [];
      // For these tests, simulate a grouped folder structure under the library root
      return items.map((item: any) => ({
        rating_key: item.rating_key,
        proposed: `A-D/Nolan/${item.base_name}`,
      }));
    }
    throw new Error(`Unexpected invoke: ${cmd}`);
  }),
}));

const baseSettings: any = {
  general: {
    safety: {
      pathLengthCheck: true,
      reservedNamesCheck: true,
      permissionsCheck: true,
    },
    encoding: {
      highlightNonLatin: false,
    },
  },
  movies: {
    ownFolderPerMovie: true,
    alphaArticleHandling: "keep",
    collections: {
      enabled: false,
    },
    specials: {
      markISO: false,
      moveExtras: false,
    },
    editions: {
      mode: "none",
      createFromFilenames: false,
      createMultipleTags: false,
      parsers: [],
    },
    ids: "none",
  },
  tv: {
    seasonFolders: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    specials: {
      markISO: false,
    },
  },
  music: {},
  misc: {
    characterReplacement: {},
  },
};

describe("Movie backend folder integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves nested grouping when marking ISO files", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-iso",
      title: "Inception",
      year: 2010,
      file: "/media/Movies/A-D/Nolan/Inception.iso",
      plexPath: "/media/Movies/A-D/Nolan/Inception.iso",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.specials.markISO = true;

    const libraryFolder = "/mnt/Movies";
    const libraryRoots = ["/media/Movies"];

    const row = await computeMovieProposal(
      movie,
      "{title}{ext}",
      false,
      false,
      "",
      settings,
      libraryFolder,
      libraryRoots,
    );

    // Backend groups under A-D/Nolan, ISO handling appends [ISO] before extension
    expect(row.proposed).toBe("A-D/Nolan/Inception [ISO].iso");
    expect(row.flags).toContain("marked-iso");
    expect(row.status).not.toBe("error");
  });

  it("can still move extras into Extras/ while backend returns grouped paths", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-extras",
      title: "Inception extras",
      year: 2010,
      file: "/media/Movies/A-D/Nolan/Inception.extras.mkv",
      plexPath: "/media/Movies/A-D/Nolan/Inception.extras.mkv",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.specials.moveExtras = true;

    const libraryFolder = "/mnt/Movies";
    const libraryRoots = ["/media/Movies"];

    const row = await computeMovieProposal(
      movie,
      "{title}{ext}",
      false,
      false,
      "",
      settings,
      libraryFolder,
      libraryRoots,
    );

    // Extras logic should still move into Extras/, even when backend proposes a grouped path
    expect(row.proposed).toBe("Extras/Inception extras.mkv");
    expect(row.flags).toContain("moved-to-extras");
  });
});

