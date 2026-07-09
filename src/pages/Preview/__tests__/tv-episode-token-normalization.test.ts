import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeEpisodeProposal, computeMultiEpisodeProposal } from "../episodeProposal";
import type { EpisodeItem } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "sanitize_filename_cmd") {
      return String(args.filename).replace(/[\\/:*?"<>|]/g, "-");
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
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
    ids: "none",
    specials: {
      moveExtras: false,
      markISO: false,
    },
    subtitles: {
      flattenPerEpisodeSubfolders: true,
      handleNonMatchingNames: true,
      multiSubHandling: "preserve",
    },
  },
  movies: {},
  music: {},
  misc: {
    characterReplacement: {
      separators: "-",
      quotes: "'",
      wildcards: "-",
      brackets: "()",
      general: "-",
    },
  },
  templates: {
    episode: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}",
  },
  manualFixes: [],
};

describe("TV episode token normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes grouped compact multi-episode files to Plex dashed tokens", async () => {
    const episodes: EpisodeItem[] = [
      {
        type: "episode",
        ratingKey: "e3",
        showTitle: "Abyssal Gate",
        title: "The Divide",
        season: 1,
        index: 3,
        file: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03E04 - Combined.mkv",
        plexPath: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03E04 - Combined.mkv",
        year: 2023,
      },
      {
        type: "episode",
        ratingKey: "e4",
        showTitle: "Abyssal Gate",
        title: "No Return",
        season: 1,
        index: 4,
        file: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03E04 - Combined.mkv",
        plexPath: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03E04 - Combined.mkv",
        year: 2023,
      },
    ];

    const row = await computeMultiEpisodeProposal(
      episodes,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed).toContain("Abyssal Gate - S01E03-E04 - The Divide - No Return.mkv");
    expect(row.proposed).not.toContain("S01E03E04");
    expect(row.proposed).not.toContain(" / ");
  });

  it("keeps Plex dashed multi-episode output in the episode token instead of the title", async () => {
    const episode: EpisodeItem = {
      type: "episode",
      ratingKey: "e5",
      showTitle: "Abyssal Gate",
      title: "The Divide / No Return",
      season: 1,
      index: 3,
      file: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03-E04 - Combined.mkv",
      plexPath: "/media/TV/Abyssal Gate/Season 01/Abyssal Gate - S01E03-E04 - Combined.mkv",
      year: 2023,
    };

    const row = await computeEpisodeProposal(
      episode,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed).toContain("Abyssal Gate - S01E03-E04 - The Divide - No Return.mkv");
    expect(row.proposed).not.toContain("(Episodes 3-4)");
    expect(row.proposed).not.toContain(" / ");
  });

  it("replaces slash separators when combined episode titles would create an invalid filename", async () => {
    const episodes: EpisodeItem[] = [
      {
        type: "episode",
        ratingKey: "e7",
        showTitle: "Battlestar Galactica",
        title: "Daybreak (1)",
        season: 4,
        index: 19,
        file: "/media/TV/Battlestar Galactica/Season 04/Battlestar Galactica - S04E19E20 - Combined.mkv",
        plexPath: "/media/TV/Battlestar Galactica/Season 04/Battlestar Galactica - S04E19E20 - Combined.mkv",
        year: 2009,
      },
      {
        type: "episode",
        ratingKey: "e8",
        showTitle: "Battlestar Galactica",
        title: "Daybreak (2)",
        season: 4,
        index: 20,
        file: "/media/TV/Battlestar Galactica/Season 04/Battlestar Galactica - S04E19E20 - Combined.mkv",
        plexPath: "/media/TV/Battlestar Galactica/Season 04/Battlestar Galactica - S04E19E20 - Combined.mkv",
        year: 2009,
      },
    ];

    const row = await computeMultiEpisodeProposal(
      episodes,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed).toContain("Battlestar Galactica - S04E19-E20 - Daybreak (1) - Daybreak (2).mkv");
    expect(row.proposed).not.toContain(" / ");
    expect(row.status).not.toBe("error");
  });

  it("preserves supported split-part suffixes", async () => {
    const episode: EpisodeItem = {
      type: "episode",
      ratingKey: "e6",
      showTitle: "Grey's Anatomy",
      title: "A Hard Day's Night",
      season: 1,
      index: 1,
      file: "/media/TV/Grey's Anatomy/Season 01/Grey's Anatomy - S01E01 - pt1.mkv",
      plexPath: "/media/TV/Grey's Anatomy/Season 01/Grey's Anatomy - S01E01 - pt1.mkv",
      year: 2005,
    };

    const row = await computeEpisodeProposal(
      episode,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed).toContain("Grey's Anatomy - S01E01 - A Hard Day's Night - pt1.mkv");
    expect(row.proposed).not.toContain("S01E01-E");
  });
});
