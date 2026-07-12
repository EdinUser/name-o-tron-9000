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

  it("attaches subtitle operations for flat TV layouts without season folders in the source path", () => {
    const rows: PreviewRow[] = [
      makeRow({
        filePath: "/mnt/Series/Two Broke Girls/Two_Broke_Girls.S01E01.mkv",
        plexPath: "/share/plex/Series/Two_Broke_Girls/Two_Broke_Girls.S01E01.mkv",
        proposed:
          "/mnt/Series/Two Broke Girls/Two Broke Girls - S01E01 - And the Soft Opening.mkv",
      }),
    ];

    const previewResult = {
      subtitle_operations: [
        {
          original_path: "/mnt/Series/Two Broke Girls/Two_Broke_Girls.S01E01.eng.srt",
          new_path: "",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    expect(rows[0].subtitleOperations).toBeDefined();
    expect(rows[0].subtitleOperations![0].proposedPath).toContain(
      "/mnt/Series/Two Broke Girls/Two Broke Girls - S01E01 - And the Soft Opening.eng.srt",
    );
  });

  it("moves movie subtitles into the newly created movie folder", () => {
    const rows: PreviewRow[] = [
      makeRow({
        id: "movie-1",
        kind: "movie",
        filePath: "/mnt/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
        plexPath: "/share/Movies/J-R/One Piece/One Piece Film Z (2012).mkv",
        proposed:
          "J-R/One Piece/One Piece Film Z/One Piece Film Z (2012).mkv",
      }),
    ];

    const previewResult = {
      subtitle_operations: [
        {
          original_path:
            "/mnt/Movies/J-R/One Piece/One Piece Film Z (2012).eng.srt",
          new_path:
            "/mnt/Movies/J-R/One Piece/One Piece Film Z (2012).eng.srt",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    expect(rows[0].subtitleOperations).toBeDefined();
    expect(rows[0].subtitleOperations![0].proposedPath).toBe(
      "J-R/One Piece/One Piece Film Z/One Piece Film Z (2012).eng.srt",
    );
  });

  it("matches subtitles using the local video filename when Plex and local names differ", () => {
    const rows: PreviewRow[] = [
      makeRow({
        id: "movie-2",
        kind: "movie",
        filePath:
          "/mnt/Movies/J-R/One Piece/One Piece 3D- Straw Hat Chase (2011) .mkv",
        plexPath:
          "/share/Movies/J-R/One Piece/One Piece 3D_ Straw Hat Chase (2011).mkv",
        proposed:
          "J-R/One Piece/One Piece 3D_ Straw Hat Chase/One Piece 3D_ Straw Hat Chase (2011).mkv",
      }),
    ];

    const previewResult = {
      subtitle_operations: [
        {
          original_path:
            "/mnt/Movies/J-R/One Piece/One Piece 3D- Straw Hat Chase (2011) .eng.srt",
          new_path:
            "/mnt/Movies/J-R/One Piece/One Piece 3D- Straw Hat Chase (2011) .eng.srt",
          operation_type: "rename",
        },
      ],
    };

    attachSubtitleOperations(rows, previewResult);

    expect(rows[0].subtitleOperations).toBeDefined();
    expect(rows[0].subtitleOperations![0].proposedPath).toBe(
      "J-R/One Piece/One Piece 3D_ Straw Hat Chase/One Piece 3D_ Straw Hat Chase (2011).eng.srt",
    );
  });
});
