import { describe, it, expect } from "vitest";
import type { PreviewRow } from "../types";
import { attachSubtitleOperations } from "../subtitleMapping";

describe("attachSubtitleOperations", () => {
  function makeRow(overrides: Partial<PreviewRow> = {}): PreviewRow {
    return {
      id: "rk1",
      kind: "episode",
      filePath:
        "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.mp4",
      plexPath:
        "/share/CACHEDEV1_DATA/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.mp4",
      proposed:
        "/mnt/Series/Band Of Brothers/S01E10 - Currahee - 2001.mkv",
      status: "good",
      flags: [],
      ...overrides,
    };
  }

  it("attaches subtitle operations based on original video basename", () => {
    const rows: PreviewRow[] = [makeRow()];

    const previewResult = {
      subtitle_operations: [
        {
          original_path:
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.bul.srt",
          new_path: "",
          operation_type: "rename",
        },
        {
          // Different episode – should not be attached
          original_path:
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E09.1080p.BluRay.x265-RARBG.eng.srt",
          new_path: "",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    expect(rows[0].subtitleOperations).toBeDefined();
    expect(rows[0].subtitleOperations!.length).toBe(1);
    expect(rows[0].subtitleOperations![0].originalPath).toContain(
      "S01E10.1080p.BluRay.x265-RARBG.bul.srt",
    );
  });

  it("derives subtitle target path from proposed video path and preserves language code", () => {
    const rows: PreviewRow[] = [makeRow()];

    const previewResult = {
      subtitle_operations: [
        {
          original_path:
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.bul.srt",
          new_path: "",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    const subOps = rows[0].subtitleOperations!;
    expect(subOps.length).toBe(1);

    const target = subOps[0].proposedPath;
    expect(target).toContain(
      "/mnt/Series/Band Of Brothers/S01E10 - Currahee - 2001.bul.srt",
    );
  });

  it("handles subtitles without explicit language code", () => {
    const rows: PreviewRow[] = [makeRow()];

    const previewResult = {
      subtitle_operations: [
        {
          original_path:
            "/mnt/Series/Band Of Brothers/Band.of.Brothers.S01E10.1080p.BluRay.x265-RARBG.srt",
          new_path: "",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    const subOps = rows[0].subtitleOperations!;
    expect(subOps.length).toBe(1);

    const target = subOps[0].proposedPath;
    expect(target).toContain(
      "/mnt/Series/Band Of Brothers/S01E10 - Currahee - 2001.srt",
    );
  });
});

