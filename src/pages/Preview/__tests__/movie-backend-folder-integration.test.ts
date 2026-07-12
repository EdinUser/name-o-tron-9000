import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeMovieProposal } from "../movieProposal";
import type { MovieItem } from "../types";
import { buildMovieProposalItem } from "../../../testUtils/mockPlexFixtures";

// Mock Tauri invoke used by sanitizeProposal
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "sanitize_filename_cmd") {
      // Echo back the filename to keep behavior simple for tests
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
    ownFolderPerMovie: true,
    ownFolderWithinSharedFolder: "add_movie_folder",
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

    // Preserve existing grouping, add the dedicated movie folder, then append [ISO] before extension
    expect(row.proposed).toBe("A-D/Nolan/Inception/Inception [ISO].iso");
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

    // Extras logic should still move into Extras/, even when current path is grouped
    expect(row.proposed).toBe("Extras/Inception extras.mkv");
    expect(row.flags).toContain("moved-to-extras");
  });

  it("uses the collection folder as the primary grouping when collections are enabled", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-collection",
      title: "Inception",
      year: 2010,
      file: "/media/Movies/A-D/Inception (2010).mkv",
      plexPath: "/media/Movies/A-D/Inception (2010).mkv",
      collection: "Nolan Collection",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.collections.enabled = true;
    settings.movies.folderStructure = "alpha";

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      true,
      true,
      "Nolan Collection",
      settings,
      "/mnt/Movies",
      ["/media/Movies"],
    );

    expect(row.proposed).toBe("Nolan Collection/Inception/Inception (2010).mkv");
  });

  it("keeps collection items directly under the collection folder when ownFolderPerMovie is disabled", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-collection-flat",
      title: "Inception",
      year: 2010,
      file: "/media/Movies/A-D/Inception (2010).mkv",
      plexPath: "/media/Movies/A-D/Inception (2010).mkv",
      collection: "Nolan Collection",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.collections.enabled = true;
    settings.movies.folderStructure = "alpha";
    settings.movies.ownFolderPerMovie = false;

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      false,
      true,
      "Nolan Collection",
      settings,
      "/mnt/Movies",
      ["/media/Movies"],
    );

    expect(row.proposed).toBe("Nolan Collection/Inception (2010).mkv");
  });

  it("adds a movie folder inside an existing shared folder by default", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-shared-folder",
      title: "One Piece Film Z",
      year: 2012,
      file: "/media/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
      plexPath: "/media/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.folderStructureBehavior = "preserve_existing";

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      true,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/media/Movies"],
    );

    expect(row.proposed).toBe("J-R/One Piece/One Piece Film Z/One Piece Film Z (2012).mkv");
  });

  it("can keep the shared folder as the final folder when configured", async () => {
    const movie: MovieItem = {
      type: "movie",
      ratingKey: "rk-shared-folder-keep",
      title: "One Piece Film Z",
      year: 2012,
      file: "/media/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
      plexPath: "/media/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
    } as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.folderStructureBehavior = "preserve_existing";
    settings.movies.ownFolderWithinSharedFolder = "keep_shared_folder";

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})]{ext}",
      true,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/media/Movies"],
    );

    expect(row.proposed).toBe("J-R/One Piece/One Piece Film Z (2012).mkv");
  });

  it("renders Plex-style imdb token placeholders when the mock metadata exposes an imdb guid", async () => {
    const movie: MovieItem = buildMovieProposalItem("101") as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.ids = "preserve";
    settings.movies.ownFolderPerMovie = false;

    const row = await computeMovieProposal(
      movie,
      "{title} {imdbToken}{ext}",
      false,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/mount/server/HDD1/Movies"],
    );

    expect(row.proposed).toBe("Incoming/Interstellar {imdb-tt0816692}.mkv");
  });

  it("renders explicit ids placeholders from metadata even when automatic movie IDs are disabled", async () => {
    const movie: MovieItem = {
      ...(buildMovieProposalItem("101") as MovieItem),
      guid: "plex://movie/mock imdb://tt0816692 tmdb://157336",
    };

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.ids = "none";
    settings.movies.ownFolderPerMovie = false;

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})][ {ids}]{ext}",
      false,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/mount/server/HDD1/Movies"],
    );

    expect(row.proposed).toBe("Incoming/Interstellar (2014) {imdb-tt0816692} {tmdb-157336}.mkv");
  });

  it("renders imdbToken when imdb is available through additional Plex GUID metadata", async () => {
    const movie: MovieItem = {
      ...(buildMovieProposalItem("101") as MovieItem),
      guid: "plex://movie/mock tmdb://157336 imdb://tt0816692",
    };

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.ids = "none";
    settings.movies.ownFolderPerMovie = false;

    const row = await computeMovieProposal(
      movie,
      "{title} {imdbToken}{ext}",
      false,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/mount/server/HDD1/Movies"],
    );

    expect(row.proposed).toBe("Incoming/Interstellar {imdb-tt0816692}.mkv");
  });

  it("renders plexIds as a space-separated list of available Plex-style provider tags", async () => {
    const movie: MovieItem = buildMovieProposalItem("101") as any;

    const settings = JSON.parse(JSON.stringify(baseSettings));
    settings.movies.ids = "auto_append_all";
    settings.movies.ownFolderPerMovie = false;

    const row = await computeMovieProposal(
      movie,
      "{title}[ ({year})][ {plexIds}]{ext}",
      false,
      false,
      "",
      settings,
      "/mnt/Movies",
      ["/mount/server/HDD1/Movies"],
    );

    expect(row.proposed).toBe("Incoming/Interstellar (2014) {imdb-tt0816692}.mkv");
  });
});
