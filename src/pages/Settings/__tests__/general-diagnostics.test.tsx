import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { General } from "../General";
import type { Settings } from "../../../state/settings";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { revealItemInDir as openerRevealItemInDir } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(async () => "/tmp/test-bundle.zip"),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => {}),
}));

const baseSettings: Settings = {
  general: {
    previewBeforeRename: true,
    saveRenameLog: { txt: false, csv: false, json: true },
    autoRollbackLog: true,
    authPersistence: "secure",
    theme: "dark",
    encoding: { mode: "unicode", highlightNonLatin: true },
    conflictHandling: "skip",
    safety: { pathLengthCheck: true, reservedNamesCheck: true, permissionsCheck: true },
    pagination: { defaultMovieLimit: 200, defaultShowLimit: 20, defaultMusicLimit: 200 },
    subtitles: {
      renameWithVideo: true,
      preserveLanguageCodes: true,
      languageCodeHandling: "preserve",
      skipSubtitles: false,
      convertToUtf8: false,
      backupBeforeConversion: true,
      skipUncertainEncoding: true,
    },
    viewMode: {
      movies: "table",
      tv: "blocks",
    },
  },
  movies: {
    collections: { enabled: true, mode: "always", naming: "original" },
    chronologicalPrefix: "none",
    folderStructure: "none",
    alphaArticleHandling: "ignore",
    folderStructureBehavior: "intelligent",
    ownFolderPerMovie: true,
    editions: {
      mode: "preserve",
      createFromFilenames: true,
      createMultipleTags: true,
      parsers: [],
    },
    ids: "preserve",
    specials: { moveExtras: true, markISO: true },
    subtitles: { forcedSdhHandling: "preserve", unknownSubtitleHandling: "preserve" },
  },
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
    ids: "preserve",
    specials: { moveExtras: true, markISO: true },
    subtitles: {
      flattenPerEpisodeSubfolders: true,
      handleNonMatchingNames: true,
      multiSubHandling: "preserve",
    },
  },
  music: {
    formatAAT: true,
    discSubfolders: true,
    normalizeTrackNumbers: true,
  },
  misc: {
    unmatchedHandling: "leave",
    nonMediaHandling: "skip",
    warnings: { pathLength: true, reservedNames: true, nonMediaDetection: true },
    characterReplacement: {
      separators: "-",
      quotes: "'",
      wildcards: "-",
      brackets: "()",
      general: "-",
    },
  },
  templates: {
    movie: "{title}[ ({year})]{ext}",
    episode: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}",
    music: "{artist}/{album}/{trackNumber:02} - {track}{ext}",
  },
  manualFixes: [],
};

describe("Settings General diagnostics", () => {
  beforeEach(() => {
    (tauriInvoke as any).mockReset();
    (dialogSave as any).mockReset();
    (openerRevealItemInDir as any).mockReset();
  });

  it("calls export_diagnostic_bundle_zip with targetPath from save dialog", async () => {
    (dialogSave as any).mockResolvedValue("/tmp/diag.zip");
    (tauriInvoke as any).mockResolvedValue("/tmp/diag.zip");

    render(<General s={baseSettings} onChange={() => {}} />);

    const button = screen.getByText("Export bundle");
    await fireEvent.click(button);

    expect(dialogSave).toHaveBeenCalled();
    expect(tauriInvoke).toHaveBeenCalledWith("export_diagnostic_bundle_zip", { targetPath: "/tmp/diag.zip" });
  });

  it("opens logs folder via revealItemInDir", async () => {
    (tauriInvoke as any).mockImplementation(async (cmd: string) => {
      if (cmd === "get_logs_directory_path") return "/tmp/logs";
      return null;
    });

    render(<General s={baseSettings} onChange={() => {}} />);

    const button = screen.getByText("Open logs folder");
    await fireEvent.click(button);

    expect(tauriInvoke).toHaveBeenCalledWith("get_logs_directory_path");
    expect(openerRevealItemInDir).toHaveBeenCalledWith("/tmp/logs");
  });
});
