import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeEpisodeProposal } from "../episodeProposal";
import type { EpisodeItem } from "../types";

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
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
    ids: "none",
    specials: {
      moveExtras: true,
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
    characterReplacement: {},
  },
  templates: {
    episode: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}",
  },
  manualFixes: [],
};

describe("TV extras detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not move numbered episodes to Extras just because filename contains extras keywords", async () => {
    const episode: EpisodeItem = {
      type: "episode",
      ratingKey: "e1",
      showTitle: "Family Guy",
      title: "A Hero Sits Next Door",
      season: 1,
      index: 5,
      file: "/media/TV/Family Guy/Season 01/Family Guy - S01E05 - A Hero Sits Next Door (Uncensored + PEZ Scene).mkv",
      plexPath: "/media/TV/Family Guy/Season 01/Family Guy - S01E05 - A Hero Sits Next Door (Uncensored + PEZ Scene).mkv",
      year: 1999,
    };

    const row = await computeEpisodeProposal(
      episode,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed.startsWith("Extras/")).toBe(false);
  });

  it("still allows moving Season 00 extras to Extras/", async () => {
    const episode: EpisodeItem = {
      type: "episode",
      ratingKey: "e2",
      showTitle: "Family Guy",
      title: "Trailer",
      season: 0,
      index: 1,
      file: "/media/TV/Family Guy/Season 00/Family Guy - S00E01 - Trailer.mkv",
      plexPath: "/media/TV/Family Guy/Season 00/Family Guy - S00E01 - Trailer.mkv",
      year: 1999,
    };

    const row = await computeEpisodeProposal(
      episode,
      baseSettings.templates.episode,
      true,
      baseSettings,
      null,
      ["/media/TV"],
    );

    expect(row.proposed.startsWith("Family Guy/Extras/")).toBe(true);
    expect(row.flags).toContain("moved-to-extras");
  });
});
