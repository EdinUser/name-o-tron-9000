import type { PreviewRow } from "./types";

type BackendSubtitleOp = {
  original_path: string;
  new_path: string;
  operation_type: string;
  warning_flags?: string[];
};

type PreviewResult = {
  subtitle_operations?: BackendSubtitleOp[];
};

function extractVideoBase(path: string | undefined): string {
  if (!path) return "";
  const fileName = path.split(/[\\/]/).pop() || "";
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeSubtitleMatchBase(value: string): string {
  return value
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Attach subtitle operations returned from the backend preview
 * to the corresponding preview rows. Matching is based on the
 * original video basename so it works across Plex/local path
 * differences, and proposed subtitle paths are derived from
 * the row's proposed video path.
 */
export function attachSubtitleOperations(
  rows: PreviewRow[],
  previewResult: PreviewResult
): PreviewRow[] {
  const ops = previewResult.subtitle_operations || [];
  if (!ops.length) return rows;

  rows.forEach((row) => {
    const rawVideoBases = [extractVideoBase(row.filePath), extractVideoBase(row.plexPath)]
      .filter(Boolean);
    const videoBases = Array.from(new Set(rawVideoBases));
    const normalizedVideoBases = videoBases.map(normalizeSubtitleMatchBase);

    const subtitleOps = ops.filter((op) => {
      const originalPath = op.original_path;
      const subName = originalPath.split(/[\\/]/).pop() || originalPath;
      if (videoBases.some((videoBase) => subName.startsWith(videoBase))) {
        return true;
      }

      const normalizedSubtitleName = normalizeSubtitleMatchBase(subName);
      return normalizedVideoBases.some(
        (videoBase) => videoBase && normalizedSubtitleName.startsWith(videoBase),
      );
    });

    if (!subtitleOps.length) {
      return;
    }

    row.subtitleOperations = subtitleOps.map((op) => {
      const originalPath = op.original_path;
      const subFileName = originalPath.split(/[\\/]/).pop() || originalPath;

      // Derive language and extension from the subtitle filename.
      // Mirror the Rust pattern: {basename}.{lang?}.{ext}, where lang is 2–3 letters.
      let langPart: string | null = null;
      let extPart: string | null = null;

      const langPattern = /^(.+)\.([a-zA-Z]{2,3}(?:\.\w+)?)\.([a-zA-Z0-9]+)$/;
      const langMatch = subFileName.match(langPattern);
      if (langMatch) {
        langPart = langMatch[2];
        extPart = langMatch[3];
      } else {
        const simpleMatch = subFileName.match(/^(.+)\.([a-zA-Z0-9]+)$/);
        if (simpleMatch) {
          langPart = null;
          extPart = simpleMatch[2];
        }
      }

      const proposedVideoPath = row.proposed;
      const videoLastSlash = proposedVideoPath.lastIndexOf("/");
      const targetDir =
        videoLastSlash >= 0
          ? proposedVideoPath.substring(0, videoLastSlash)
          : "";
      const videoFileName =
        videoLastSlash >= 0
          ? proposedVideoPath.substring(videoLastSlash + 1)
          : proposedVideoPath;
      const videoStem = videoFileName.replace(/\.[^.]+$/, "");

      let targetFileName: string;
      if (extPart) {
        if (langPart) {
          targetFileName = `${videoStem}.${langPart}.${extPart}`;
        } else {
          targetFileName = `${videoStem}.${extPart}`;
        }
      } else {
        targetFileName = subFileName;
      }

      const proposedPath = targetDir
        ? `${targetDir}/${targetFileName}`
        : targetFileName;

      return {
        originalPath,
        proposedPath,
        operationType: op.operation_type,
        warningFlags: op.warning_flags || [],
      };
    });
  });

  return rows;
}
