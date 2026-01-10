import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeMovieProposal } from "../movieProposal";
import type { MovieItem } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "sanitize_filename_cmd") {
      return args.filename;
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
    ownFolderPerMovie: false,
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

describe("Preview proposals – mapping and safety flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats items under a library root as mapped (no unmatched flag)", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk1",
      title: "Inception",
      year: 2010,
      file: "/media/Movies/Inception (2010).mkv",
      plexPath: "/media/Movies/Inception (2010).mkv",
    };

    const settings = { ...baseSettings };
    const libraryFolder = "/mnt/Movies";
    const libraryRoots = ["/media/Movies"];

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      false,
      false,
      "",
      settings,
      libraryFolder,
      libraryRoots,
    );

    expect(row.status).not.toBe("unmatched");
    expect(row.flags).not.toContain("unmapped");
    expect(row.filePath).toBe(movie.file);
  });

  it("marks items outside library roots as unmatched", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk2",
      title: "Inception",
      year: 2010,
      file: "/other/Movies/Inception (2010).mkv",
      plexPath: "/other/Movies/Inception (2010).mkv",
    };

    const settings = { ...baseSettings };
    const libraryFolder = "/mnt/Movies";
    const libraryRoots = ["/media/Movies"];

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      false,
      false,
      "",
      settings,
      libraryFolder,
      libraryRoots,
    );

    expect(row.status).toBe("unmatched");
    expect(row.flags).toContain("unmapped");
  });

  it("respects pathLengthCheck toggle for long paths", async () => {
    const longBase = "A".repeat(260);
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk4",
      title: longBase,
      year: 2020,
      file: `/media/Movies/${longBase}.mkv`,
      plexPath: `/media/Movies/${longBase}.mkv`,
    };

    const settingsWithLength = {
      ...baseSettings,
      general: {
        ...baseSettings.general,
        safety: {
          ...baseSettings.general.safety,
          pathLengthCheck: true,
        },
      },
    };

    const settingsWithoutLength = {
      ...baseSettings,
      general: {
        ...baseSettings.general,
        safety: {
          ...baseSettings.general.safety,
          pathLengthCheck: false,
        },
      },
    };

    const libraryFolder = "/mnt/Movies";
    const libraryRoots = ["/media/Movies"];

    const rowWith = await computeMovieProposal(
      movie,
      "{title}{ext}",
      false,
      false,
      "",
      settingsWithLength,
      libraryFolder,
      libraryRoots,
    );
    expect(rowWith.flags).toContain(">255 path");

    const rowWithout = await computeMovieProposal(
      movie,
      "{title}{ext}",
      false,
      false,
      "",
      settingsWithoutLength,
      libraryFolder,
      libraryRoots,
    );
    expect(rowWithout.flags).not.toContain(">255 path");
  });
});
