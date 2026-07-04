import { VIDEO_EXTS } from "./constants";
import type { EpisodeItem, PreviewRow } from "./types";
import {
    basename,
    extname,
    getRelativePathUnderRoots,
    hasNonLatin,
    isItemMapped,
    normalizePathForComparison,
    normalizeUnicode,
    resolvePlexFilePath,
    safeFolderName,
    sanitizeProposal,
} from "./utils";
import { extractImdbId, extractTvdbId, extractTmdbId, renderTemplate } from "../../utils/template";

export async function computeMultiEpisodeProposal(
    episodes: EpisodeItem[],
    template: string,
    useSeasonFolders: boolean,
    settings: any,
    libraryFolder: string | null,
    libraryRoots: string[]
): Promise<PreviewRow> {
    if (episodes.length === 0) {
        throw new Error("Cannot compute multi-episode proposal with no episodes");
    }

    if (!episodes[0]) {
        throw new Error("First episode is undefined");
    }

    // All episodes should share the same file path
    const filePath = episodes[0].file;
    if (!filePath) {
        throw new Error("Episode file path is undefined");
    }

    const resolvedFilePath = resolvePlexFilePath(filePath, libraryFolder);
    const ext = extname(filePath) || ".mkv";

    // Verify all episodes have the same file (be lenient - if not, process as single episode)
    const mismatchedEpisodes = episodes.filter(episode => episode.file !== filePath);
    if (mismatchedEpisodes.length > 0) {
        console.warn("Episodes have different file paths, processing as single episode");
        return computeEpisodeProposal(episodes[0], template, useSeasonFolders, settings, libraryFolder, libraryRoots);
    }

    // Use the first episode as the primary episode for most metadata
    const primaryEpisode = episodes[0];
    const showTitle = primaryEpisode.showTitle;
    const season = primaryEpisode.season;

    // Extract IDs from the primary episode's GUID
    const imdbId = primaryEpisode.guid ? extractImdbId(primaryEpisode.guid) : null;
    const thetvdbId = primaryEpisode.guid ? extractTvdbId(primaryEpisode.guid) : null;
    const tmdbId = primaryEpisode.guid ? extractTmdbId(primaryEpisode.guid) : null;

    // Detect multi-episode range from filename or Plex data
    const filename = basename(filePath);
    const multiEpisodePattern = /S(\d{1,2})E(\d{1,2})-?E?(\d{1,2})/i;
    const match = filename.match(multiEpisodePattern);

    const flags: string[] = ["multi-episode"];

    let startEpisode = 1;
    let endEpisode = episodes.length;
    let detectedTitle = primaryEpisode.title;

    if (match) {
        const seasonFromFile = parseInt(match[1], 10);
        startEpisode = parseInt(match[2], 10);
        endEpisode = parseInt(match[3], 10);

        // Verify the season matches and episodes make sense
        if (seasonFromFile === season && endEpisode > startEpisode) {
            // Create a combined title for all episodes
            const episodeTitles = episodes.map(e => e.title).filter(Boolean);
            if (episodeTitles.length > 0) {
                detectedTitle = episodeTitles.join(" / ");
            }
            flags.push("multi-episode-detected");
        }
    }

    // Fallback: use the episode range from Plex data
    if (startEpisode === 1 && endEpisode === episodes.length) {
        const episodeNumbers = episodes.map(e => e.index).filter(n => n !== undefined).sort((a, b) => a - b);
        if (episodeNumbers.length > 1) {
            startEpisode = episodeNumbers[0];
            endEpisode = episodeNumbers[episodeNumbers.length - 1];
        }
    }

    // Apply TV detection settings (using primary episode data)
    let detectedSeason = season;
    let detectedIndex = startEpisode;

    // Handle specials (Season 0)
    if (settings.tv.detectOVAsSeason00) {
        const fileName = basename(filePath).toLowerCase();
        const ovaPatterns = [
            /\bova\b/, /\bovas\b/, /\bspecial\b/, /\bspecials\b/,
            /\bextra\b/, /\bextras\b/, /\bprologue\b/, /\bepilogue\b/
        ];

        if (ovaPatterns.some(pattern => pattern.test(fileName))) {
            detectedSeason = 0;
            flags.push("ova-detected");
        }
    }

    // Build dynamic template based on settings
    let dynamicTemplate = template;

    // Apply ID settings to template
    if (settings.tv.ids === "none") {
        dynamicTemplate = dynamicTemplate.replace(/\{imdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{thetvdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{tmdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{ids\}/g, '');
    }

    // Process IDs based on user settings
    let processedIds = "";
    if (settings.tv.ids === "preserve") {
        const currentFileName = basename(filePath);
        const idPatterns = [
            /\{imdb-tt\d+\}/g,
            /\{tvdb-\d+\}/g,
            /\{tmdb-\d+\}/g,
            /imdb-tt\d+/g,
            /tvdb-\d+/g,
            /tmdb-\d+/g
        ];

        for (const pattern of idPatterns) {
            const matches = currentFileName.match(pattern);
            if (matches) {
                processedIds += ` ${matches[0]}`;
            }
        }
    } else if (settings.tv.ids === "auto_append_all") {
        if (imdbId) processedIds += ` {imdb}`;
        if (thetvdbId) processedIds += ` {thetvdb}`;
        if (tmdbId) processedIds += ` {tmdb}`;
    }

    // Apply folder structure settings
    let showFolderName = "";
    let folderPrefix = "";

    // For "Keep unchanged" ID setting, preserve existing show folder structure
    if (settings.tv.ids === "preserve") {
        const allParts = filePath.split('/').filter(Boolean);
        const dirParts = allParts.slice(0, -1);

        if (dirParts.length >= 1) {
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normShow = normalize(showTitle);
            let showFolder: string | null = null;

            // Find show folder segment
            for (let i = 0; i < dirParts.length; i++) {
                const partNorm = normalize(dirParts[i]);
                if (partNorm.includes(normShow) || normShow.includes(partNorm)) {
                    showFolder = dirParts[i];
                    break;
                }
            }

            // Fallback to season folder detection
            if (!showFolder) {
                const seasonIdx = dirParts.findIndex(p => /^(season[\s._-]*\d{1,2}|s\d{1,2})$/i.test(p));
                if (seasonIdx > 0) {
                    showFolder = dirParts[seasonIdx - 1];
                }
            }

            // Final fallback
            if (!showFolder) {
                showFolder = safeFolderName(showTitle);
            }

            // Preserve ID tags
            showFolder = showFolder.replace(/\((imdb-tt\d+|tvdb-\d+|tmdb-\d+)\)/g, '{$1}');

            showFolderName = showFolder;

            if (useSeasonFolders) {
                const seasonLabel = typeof detectedSeason === "number" ? `Season ${String(detectedSeason).padStart(2, "0")}` : "Season 00";
                folderPrefix = `${showFolder}/${seasonLabel}/`;
            } else {
                folderPrefix = `${showFolder}/`;
            }
        }
    } else {
        // For other ID settings, create standard folder structure
        showFolderName = safeFolderName(showTitle);
        if (useSeasonFolders) {
            const seasonLabel = typeof detectedSeason === "number" ? `Season ${String(detectedSeason).padStart(2, "0")}` : "Season 00";
            folderPrefix = `${showFolderName}/${seasonLabel}/`;
        } else {
            folderPrefix = `${showFolderName}/`;
        }
    }

    // Build template context for multi-episode
    const ctx = {
        showTitle: showTitle,
        title: detectedTitle,
        season: typeof detectedSeason === "number" ? detectedSeason : 0,
        episode: detectedIndex,
        // Multi-episode specific context
        multiEpisodeStart: startEpisode,
        multiEpisodeEnd: endEpisode,
        multiEpisodeRange: endEpisode > startEpisode ? `E${String(startEpisode).padStart(2, "0")}-E${String(endEpisode).padStart(2, "0")}` : `E${String(startEpisode).padStart(2, "0")}`,
        ext,
        year: primaryEpisode.year ?? "",
        grandparentTitle: primaryEpisode.grandparentTitle ?? showTitle,
        parentTitle: primaryEpisode.parentTitle ?? "",
        parentIndex: primaryEpisode.parentIndex ?? detectedSeason ?? 0,
        // ID fields
        imdb: imdbId ?? "",
        thetvdb: thetvdbId ?? "",
        tmdb: tmdbId ?? "",
        ids: processedIds,
    } as any;

    let templateResult = "";
    try {
        templateResult = renderTemplate(dynamicTemplate, ctx);
    } catch (error) {
        console.error("Error rendering multi-episode template:", error);
        templateResult = `${showTitle} - S${String(detectedSeason || 0).padStart(2, "0")}${ctx.multiEpisodeRange} - ${detectedTitle}`;
    }

    let proposed = templateResult;
    if (!proposed.endsWith(ext)) proposed += ext;

    // Apply folder structure
    if (folderPrefix) {
        proposed = folderPrefix + proposed;
    }
    proposed = normalizeUnicode(proposed);

    // Handle specials
    if (settings.tv.specials.moveExtras) {
        const filename = basename(filePath).toLowerCase();
        const looksLikeNumberedEpisode = /\bs\d{1,2}e\d{1,2}\b/i.test(filename);
        const extrasPatterns = [
            /\bextra\b/, /\bextras\b/, /\bdeleted\b/, /\bscene\b/, /\bbehind.the.scenes\b/,
            /\binterview\b/, /\btrailer\b/, /\bfeaturette\b/, /\bbloopers?\b/,
            /\bcommentary\b/, /\bintro\b/, /\boutro\b/, /\bending\b/
        ];

        const isExtras = extrasPatterns.some(pattern => pattern.test(filename));
        if (isExtras) {
            // Avoid false positives for normal numbered episodes like "S01E05 ... (Deleted Scene).mkv"
            // Only move to Extras when this is Season 00 (specials) or the filename doesn't look like a standard episode.
            if (detectedSeason === 0 || !looksLikeNumberedEpisode) {
                const fileName = basename(proposed);
                const extrasFolder = showFolderName ? `${showFolderName}/Extras/` : "Extras/";
                proposed = `${extrasFolder}${fileName}`;
                flags.push("moved-to-extras");
            }
        }
    }

    // Mark ISO files
    if (settings.tv.specials.markISO && ext.toLowerCase() === ".iso") {
        const fileName = basename(proposed);
        const nameWithoutExt = fileName.replace(/\.iso$/i, "");
        proposed = proposed.replace(fileName, `${nameWithoutExt} [ISO].iso`);
        flags.push("marked-iso");
    }

    const sanitizeResult = await sanitizeProposal(basename(proposed), settings);
    const {ok, reason, sanitized} = sanitizeResult;
    if (sanitized) {
        proposed = proposed.replace(basename(proposed), sanitized);
    }

    // Compliance check: if current relative path matches proposed, treat as no-op
    const currentRel = getRelativePathUnderRoots(filePath, libraryRoots);
    if (currentRel) {
        const proposedNorm = normalizePathForComparison(proposed);
        const currentNorm = normalizePathForComparison(currentRel);
        if (proposedNorm === currentNorm) {
            proposed = currentRel;
            flags.push("already-compliant");
        }
    }

    let status: PreviewRow["status"] = "good";
    if (!VIDEO_EXTS.has(ext)) {
        status = "warning";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "error";
        if (reason) flags.push(reason);
    }
    const highlight2 = settings.general.encoding.highlightNonLatin;
    if (highlight2 && hasNonLatin(proposed) && status !== "error") {
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

    // Check if item is mapped
    if (!isItemMapped(filePath, libraryRoots)) {
        status = "unmatched";
        flags.push("unmapped");
    }

    // Use the primary episode's rating key (multi-episode files are treated as one unit)
    return {
        id: primaryEpisode.ratingKey,
        kind: "episode",
        filePath: resolvedFilePath,
        plexPath: filePath,
        proposed,
        status,
        flags
    };
}

export async function computeEpisodeProposal(
    e: EpisodeItem,
    template: string,
    useSeasonFolders: boolean,
    settings: any,
    libraryFolder: string | null,
    libraryRoots: string[]
): Promise<PreviewRow> {
    const ext = extname(e.file) || ".mkv";

    // Check for manual fix first
    const manualFix = settings.manualFixes?.find((fix: any) => fix.ratingKey === e.ratingKey);
    if (manualFix && manualFix.mediaType === "episode") {
        // Apply manual overrides
        if (manualFix.overrides.episodeTitle) e.title = manualFix.overrides.episodeTitle;
        if (manualFix.overrides.showTitle) e.showTitle = manualFix.overrides.showTitle;
        if (manualFix.overrides.season) e.season = manualFix.overrides.season;
        if (manualFix.overrides.episode) e.index = manualFix.overrides.episode;
    }

    // Extract IDs from GUID
    const imdbId = e.guid ? extractImdbId(e.guid) : null;
    const thetvdbId = e.guid ? extractTvdbId(e.guid) : null;
    const tmdbId = e.guid ? extractTmdbId(e.guid) : null;

    // Apply TV detection settings
    let detectedSeason = e.season;
    let detectedIndex = e.index;
    let detectedTitle = e.title;
    const flags: string[] = [];

    // Detect OVA/Specials and suggest Season 00
    if (settings.tv.detectOVAsSeason00) {
        const fileName = basename(e.file).toLowerCase();
        const ovaPatterns = [
            /\bova\b/, /\bovas\b/, /\bspecial\b/, /\bspecials\b/,
            /\bextra\b/, /\bextras\b/, /\bprologue\b/, /\bepilogue\b/
        ];

        if (ovaPatterns.some(pattern => pattern.test(fileName))) {
            detectedSeason = 0; // Season 00
            flags.push("ova-detected");
        }
    }

    // Detect multi-episode files and normalize
    if (settings.tv.normalizeMultiEpisode) {
        const fileName = basename(e.file);
        const multiEpisodePattern = /S(\d{1,2})E(\d{1,2})-E?(\d{1,2})/i;
        const match = fileName.match(multiEpisodePattern);
        if (match) {
            const season = parseInt(match[1], 10);
            const startEp = parseInt(match[2], 10);
            const endEp = parseInt(match[3], 10);

            if (season === e.season && startEp === e.index) {
                // Normalize to SXXEXX format for consecutive episodes
                detectedIndex = startEp;
                detectedTitle = `${detectedTitle} (Episodes ${startEp}-${endEp})`;
                flags.push("multi-episode-normalized");
            }
        }
    }

    // Detect cuts/editions in filename
    if (settings.tv.detectCuts) {
        const fileName = basename(e.file).toLowerCase();
        const cutPatterns = [
            /\bextended\b/, /\buncut\b/, /\bdirectors?\s*cut\b/,
            /\btheatrical\b/, /\bunrated\b/, /\bremastered\b/
        ];

        if (cutPatterns.some(pattern => pattern.test(fileName))) {
            flags.push("cut-detected");
        }
    }

    // Warn if episode count doesn't match Plex DB (basic implementation)
    // This would need full show metadata to properly implement
    if (settings.tv.warnEpisodeCountMismatch) {
        // For now, just flag if episode number seems unusually high
        if (detectedIndex && detectedIndex > 50) {
            flags.push("high-episode-number");
        }
    }

    // Build dynamic template based on settings
    let dynamicTemplate = template;

    // Apply ID settings to template
    if (settings.tv.ids === "none") {
        // Remove ID placeholders from template when IDs are disabled
        dynamicTemplate = dynamicTemplate.replace(/\{imdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{thetvdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{tmdb[^}]*\}/g, '');
        dynamicTemplate = dynamicTemplate.replace(/\{ids\}/g, '');
    }

    // Process IDs based on user settings
    let processedIds = "";
    if (settings.tv.ids === "preserve") {
        // For "Keep unchanged": check if current filename already contains IDs and preserve them
        const currentFileName = basename(e.file);
        const idPatterns = [
            /\{imdb-tt\d+\}/g,
            /\{tvdb-\d+\}/g,
            /\{tmdb-\d+\}/g,
            /imdb-tt\d+/g,
            /tvdb-\d+/g,
            /tmdb-\d+/g
        ];

        for (const pattern of idPatterns) {
            const matches = currentFileName.match(pattern);
            if (matches) {
                processedIds += ` ${matches[0]}`;
            }
        }
    } else if (settings.tv.ids === "auto_append_all") {
        // Auto-append all available IDs from Plex metadata
        if (imdbId) processedIds += ` {imdb}`;
        if (thetvdbId) processedIds += ` {thetvdb}`;
        if (tmdbId) processedIds += ` {tmdb}`;
    }

    // Apply folder structure settings BEFORE template rendering
    let showFolderName = "";
    let folderPrefix = "";

    // For "Keep unchanged" ID setting, preserve existing show folder structure
    if (settings.tv.ids === "preserve") {
        // Extract the show folder from current path (should contain the IDs)
        const allParts = e.file.split('/').filter(Boolean);
        const dirParts = allParts.slice(0, -1); // exclude filename

        if (dirParts.length >= 1) {
            // Prefer the actual show folder segment, not NAS roots like "share"
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normShow = normalize(e.showTitle);
            let showFolder: string | null = null;

            // 1) Try to find a segment that matches or contains the normalized show title
            for (let i = 0; i < dirParts.length; i++) {
                const partNorm = normalize(dirParts[i]);
                if (partNorm.includes(normShow) || normShow.includes(partNorm)) {
                    showFolder = dirParts[i];
                    break;
                }
            }

            // 2) If not found, look for a season folder and take the previous segment as the show folder
            if (!showFolder) {
                const seasonIdx = dirParts.findIndex(p => /^(season[\s._-]*\d{1,2}|s\d{1,2})$/i.test(p));
                if (seasonIdx > 0) {
                    showFolder = dirParts[seasonIdx - 1];
                }
            }

            // 3) Final fallback: use sanitized show title as the folder (never use top-level like "share")
            if (!showFolder) {
                showFolder = safeFolderName(e.showTitle);
            }

            // Preserve ID tags if present in parentheses in the picked folder
            showFolder = showFolder.replace(/\((imdb-tt\d+|tvdb-\d+|tmdb-\d+)\)/g, '{$1}');

            showFolderName = showFolder;

            if (useSeasonFolders) {
                // Create Series/Season XX/ structure
                const seasonLabel = typeof detectedSeason === "number" ? `Season ${String(detectedSeason).padStart(2, "0")}` : "Season 00";
                folderPrefix = `${showFolder}/${seasonLabel}/`;
            } else {
                // Create Series/Episode structure (no season folders)
                folderPrefix = `${showFolder}/`;
            }
        }
    } else {
        // For other ID settings, ALWAYS create Series folder
        showFolderName = safeFolderName(e.showTitle);
        if (useSeasonFolders) {
            // Create Series/Season XX/ structure
            const seasonLabel = typeof detectedSeason === "number" ? `Season ${String(detectedSeason).padStart(2, "0")}` : "Season 00";
            folderPrefix = `${showFolderName}/${seasonLabel}/`;
        } else {
            // Create Series/Episode structure (no season folders)
            folderPrefix = `${showFolderName}/`;
        }
    }

    const ctx = {
        showTitle: e.showTitle,
        title: detectedTitle,
        season: typeof detectedSeason === "number" ? detectedSeason : 0,
        episode: typeof detectedIndex === "number" ? detectedIndex : 0,
        ext,
        year: e.year ?? "",
        grandparentTitle: e.grandparentTitle ?? e.showTitle,
        parentTitle: e.parentTitle ?? "",
        parentIndex: e.parentIndex ?? detectedSeason ?? 0,
        // ID fields
        imdb: imdbId ?? "",
        thetvdb: thetvdbId ?? "",
        tmdb: tmdbId ?? "",
        ids: processedIds,
    } as any;

    let templateResult = "";
    try {
        templateResult = renderTemplate(dynamicTemplate, ctx);
    } catch (error) {
        console.error("Error rendering episode template:", error);
        templateResult = `${e.showTitle} - S${String(detectedSeason || 0).padStart(2, "0")}E${String(detectedIndex || 0).padStart(2, "0")} - ${detectedTitle}`;
    }

    let proposed = templateResult;
    if (!proposed.endsWith(ext)) proposed += ext;

    // TV Series folder structure MUST always be enforced
    // The template cannot override the series folder requirement
    if (folderPrefix) {
        proposed = folderPrefix + proposed;
    }
    proposed = normalizeUnicode(proposed);

    // Handle special cases for extras and ISO files (TV episodes)
    if (settings.tv.specials.moveExtras) {
        // Check if this looks like an extras file (common patterns)
        const filename = basename(e.file).toLowerCase();
        const looksLikeNumberedEpisode = /\bs\d{1,2}e\d{1,2}\b/i.test(filename);
        const extrasPatterns = [
            /\bextra\b/, /\bextras\b/, /\bdeleted\b/, /\bscene\b/, /\bbehind.the.scenes\b/,
            /\binterview\b/, /\btrailer\b/, /\bfeaturette\b/, /\bbloopers?\b/,
            /\bcommentary\b/, /\bintro\b/, /\boutro\b/, /\bending\b/
        ];

        const isExtras = extrasPatterns.some(pattern => pattern.test(filename));
        if (isExtras) {
            // Avoid false positives for normal numbered episodes like "S01E05 ... (Deleted Scene).mkv"
            // Only move to Extras when this is Season 00 (specials) or the filename doesn't look like a standard episode.
            if (detectedSeason === 0 || !looksLikeNumberedEpisode) {
                // Move to Extras folder under the show folder (not at library root)
                const fileName = basename(proposed);
                const extrasFolder = showFolderName ? `${showFolderName}/Extras/` : "Extras/";
                proposed = `${extrasFolder}${fileName}`;
                flags.push("moved-to-extras");
            }
        }
    }

    // Mark ISO files
    if (settings.tv.specials.markISO && ext.toLowerCase() === ".iso") {
        const fileName = basename(proposed);
        const nameWithoutExt = fileName.replace(/\.iso$/i, "");
        proposed = proposed.replace(fileName, `${nameWithoutExt} [ISO].iso`);
        flags.push("marked-iso");
    }

    const sanitizeResult = await sanitizeProposal(basename(proposed), settings);
    const {ok, reason, sanitized} = sanitizeResult;
    if (sanitized) {
        // Use the sanitized filename instead of the original
        proposed = proposed.replace(basename(proposed), sanitized);
    }

    // Compliance check: if current relative path matches proposed, treat as no-op
    const currentRel = getRelativePathUnderRoots(e.file, libraryRoots);
    if (currentRel) {
        const proposedNorm = normalizePathForComparison(proposed);
        const currentNorm = normalizePathForComparison(currentRel);
        if (proposedNorm === currentNorm) {
            proposed = currentRel;
            flags.push("already-compliant");
        }
    }

    let status: PreviewRow["status"] = "good";
    if (!VIDEO_EXTS.has(ext)) {
        status = "warning";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "error";
        if (reason) flags.push(reason);
    }
    const highlight2 = settings.general.encoding.highlightNonLatin;
    if (highlight2 && hasNonLatin(proposed) && status !== "error") {
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
    if (!isItemMapped(e.file, libraryRoots)) {
        status = "unmatched";
        flags.push("unmapped");
    }

    return {
        id: e.ratingKey,
        kind: "episode",
        filePath: resolvePlexFilePath(e.file, libraryFolder),
        plexPath: e.plexPath || e.file, // Original Plex path
        proposed,
        status,
        flags
    };
}
