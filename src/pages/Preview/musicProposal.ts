import type { MusicItem, PreviewRow } from "./types";
import {
    basename,
    extname,
    hasNonLatin,
    isItemMapped,
    normalizeUnicode,
    resolvePlexFilePath,
    sanitizeProposal,
} from "./utils";
import { extractImdbId, extractTvdbId, extractTmdbId, renderTemplate } from "../../utils/template";

export async function computeMusicProposal(
    m: MusicItem,
    template: string,
    settings: any,
    libraryFolder: string | null,
    libraryRoots: string[]
): Promise<PreviewRow> {
    const ext = extname(m.file) || ".mp3";

    // Check for manual fix first
    const manualFix = settings.manualFixes?.find((fix: any) => fix.ratingKey === m.ratingKey);
    if (manualFix && manualFix.mediaType === "music") {
        // Apply manual overrides
        if (manualFix.overrides.track) m.track = manualFix.overrides.track;
    }

    // Extract IDs from GUID if available
    const imdbId = m.guid ? extractImdbId(m.guid) : null;
    const thetvdbId = m.guid ? extractTvdbId(m.guid) : null;
    const tmdbId = m.guid ? extractTmdbId(m.guid) : null;

    // Apply music-specific settings
    let trackNumber = m.trackNumber;
    let discNumber = m.disc;

    // Normalize track numbers if enabled
    if (settings.music.normalizeTrackNumbers && trackNumber) {
        trackNumber = Math.max(1, Math.min(999, trackNumber));
    }

    // Apply disc subfolders if enabled
    let folderPrefix = "";
    if (settings.music.discSubfolders && discNumber && discNumber > 1) {
        folderPrefix = `Disc ${discNumber}/`;
    }

    // Apply format AAT (Artist - Album - Track) if enabled
    let dynamicTemplate = template;
    if (settings.music.formatAAT) {
        // For AAT format, ensure we have artist/album/track structure
        if (!template.includes('{artist}') || !template.includes('{album}') || !template.includes('{track}')) {
            // If template doesn't include all AAT components, use a default AAT structure
            dynamicTemplate = "{artist}/{album}/{trackNumber:02} - {track}{ext}";
        }
    }

    // Build template context
    const ctx = {
        artist: m.artist,
        album: m.album,
        track: m.track,
        trackNumber: trackNumber ?? "",
        disc: discNumber ?? "",
        ext,
        year: m.year ?? "",
        genre: m.genre ?? "",
        // ID fields
        imdb: imdbId ?? "",
        thetvdb: thetvdbId ?? "",
        tmdb: tmdbId ?? "",
    } as any;

    let proposed = "";
    try {
        proposed = renderTemplate(dynamicTemplate, ctx);
    } catch (error) {
        console.error("Error rendering music template:", error);
        proposed = `${m.artist}/${m.album}/${String(trackNumber || "").padStart(2, "0")} - ${m.track}`;
    }

    if (!proposed.endsWith(ext)) proposed += ext;

    // Apply folder structure
    if (folderPrefix) {
        proposed = folderPrefix + proposed;
    }

    proposed = normalizeUnicode(proposed);

    // Handle special cases for extras and non-audio files
    const flags: string[] = [];

    // Check for non-audio extensions
    const audioExts = new Set([".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".wma"]);
    if (!audioExts.has(ext.toLowerCase())) {
        flags.push("non-audio-ext");
    }

    const sanitizeResult = await sanitizeProposal(basename(proposed), settings);
    const {ok, reason, sanitized} = sanitizeResult;
    if (sanitized) {
        // Use the sanitized filename instead of the original
        proposed = proposed.replace(basename(proposed), sanitized);
    }

    let status: PreviewRow["status"] = "good";
    if (!ok) {
        status = "error";
        if (reason) flags.push(reason);
    }
    const highlight = settings.general.encoding.highlightNonLatin;
    if (highlight && hasNonLatin(proposed) && status !== "error") {
        status = status === "good" ? "warning" : status;
        flags.push("non-latin");
    }
    const pathLengthCheck =
        settings.general?.safety?.pathLengthCheck ?? true;
    if (pathLengthCheck) {
        if (proposed.length > 255) {
            status = "error";
            flags.push(">255 path");
        } else if (proposed.length > 200 && status !== "error") {
            status = "warning";
            flags.push(">200 path");
        }
    }

    // Check if item is mapped (not in a mapped folder)
    if (!isItemMapped(m.file, libraryRoots)) {
        status = "unmatched";
        flags.push("unmapped");
    }

    return {
        id: m.ratingKey,
        kind: "music",
        filePath: resolvePlexFilePath(m.file, libraryFolder),
        plexPath: m.plexPath || m.file, // Original Plex path
        proposed,
        status,
        flags
    };
}
