import { basename } from "./utils";

type EpisodeRange = {
  season?: number;
  startEpisode: number;
  endEpisode: number;
};

const MULTI_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,2})(?:-E?(\d{1,2})|E(\d{1,2}))/i;
const SPLIT_PART_PATTERN = /^(cd\d+|disc\d+|disk\d+|dvd\d+|part\d+|pt\d+)$/i;

function padEpisodeNumber(value: number, width?: number): string {
  return width ? String(value).padStart(width, "0") : String(value);
}

function formatPrefixedEpisodeRangeValue(prefix: string, startEpisode: number, endEpisode: number, width?: number): string {
  const start = padEpisodeNumber(startEpisode, width);
  if (endEpisode <= startEpisode) {
    return `${prefix}${start}`;
  }

  const end = padEpisodeNumber(endEpisode, width);
  return `${prefix}${start}-${prefix}${end}`;
}

export function detectMultiEpisodeRangeFromFilename(filePath: string): EpisodeRange | null {
  const filename = basename(filePath);
  const match = filename.match(MULTI_EPISODE_PATTERN);
  if (!match) {
    return null;
  }

  const season = Number.parseInt(match[1], 10);
  const startEpisode = Number.parseInt(match[2], 10);
  const endEpisode = Number.parseInt(match[3] ?? match[4] ?? "", 10);
  if (!Number.isFinite(season) || !Number.isFinite(startEpisode) || !Number.isFinite(endEpisode)) {
    return null;
  }
  if (endEpisode <= startEpisode || endEpisode - startEpisode > 10) {
    return null;
  }

  return { season, startEpisode, endEpisode };
}

export function detectSplitPartSuffix(filePath: string): string | null {
  const filename = basename(filePath);
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const tailToken = nameWithoutExt.split(/[ ._-]+/).filter(Boolean).pop()?.toLowerCase() ?? null;
  return tailToken && SPLIT_PART_PATTERN.test(tailToken) ? tailToken : null;
}

export function formatEpisodeRangeValue(startEpisode: number, endEpisode: number, width?: number): string {
  const start = padEpisodeNumber(startEpisode, width);
  if (endEpisode <= startEpisode) {
    return start;
  }

  const end = padEpisodeNumber(endEpisode, width);
  return `${start}-${end}`;
}

export function renderEpisodeTemplateWithPlexTokens(
  template: string,
  range: { startEpisode: number; endEpisode: number }
): string {
  if (range.endEpisode <= range.startEpisode) {
    return template;
  }

  let rewritten = template.replace(
    /([eE])\{(episode|index)(?::(\d+))?\}/g,
    (_match, prefix: string, _field: string, width: string | undefined) =>
      formatPrefixedEpisodeRangeValue(
        prefix,
        range.startEpisode,
        range.endEpisode,
        width ? Number.parseInt(width, 10) : undefined,
      ),
  );

  rewritten = rewritten.replace(
    /\{(episode|index)(?::(\d+))?\}/g,
    (_match, _field: string, width: string | undefined) =>
      formatEpisodeRangeValue(range.startEpisode, range.endEpisode, width ? Number.parseInt(width, 10) : undefined),
  );

  return rewritten;
}

export function appendSplitPartSuffix(proposed: string, ext: string, splitPartSuffix: string | null): string {
  if (!splitPartSuffix) {
    return proposed;
  }

  const suffixPattern = new RegExp(`(?:^|\\s-\\s)${splitPartSuffix}(?=${ext.replace(".", "\\.")}$)`, "i");
  if (suffixPattern.test(proposed)) {
    return proposed;
  }

  if (ext && proposed.toLowerCase().endsWith(ext.toLowerCase())) {
    return `${proposed.slice(0, -ext.length)} - ${splitPartSuffix}${ext}`;
  }

  return `${proposed} - ${splitPartSuffix}`;
}
