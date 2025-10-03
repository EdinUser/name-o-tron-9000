import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconBolt, IconHome, IconInfo, IconQuestionCircle, IconRefresh, IconSelectOff, IconSettings, IconSearch, IconStatusGood, IconStatusWarning, IconStatusError} from "../components/icons";
import PathMappingModal from "../components/PathMappingModal";
import TemplateHelpModal from "../components/TemplateHelpModal";
import PlexPopoverCard from "../components/PlexPopoverCard";
import Toggle from "../components/Toggle";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {useSettings} from "../state/settings";
import {renderTemplate, detectEditionFromPathWithPriority, type DetectedEdition, extractImdbId, extractTvdbId, extractTmdbId, mapEditionTokenToTitle} from "../utils/template";

type Props = {
    server: PlexServer;
    library: PlexLibrary;
    onBack: () => void;
};

type MovieItem = {
    type: "movie";
    ratingKey: string;
    title: string;
    year?: number;
    file: string;
    edition?: string;
    editionTitle?: string;
    genre?: string;
    rating?: string;
    studio?: string;
    director?: string;
    writer?: string;
    country?: string;
    tagline?: string;
    summary?: string;
    guid?: string;
    imdbId?: string;
    thetvdbId?: string;
    thumb?: string;
};

type EpisodeItem = {
    type: "episode";
    ratingKey: string;
    showTitle: string;
    title: string;
    season?: number;
    index?: number; // episode number
    file: string;
    grandparentTitle?: string;
    parentTitle?: string;
    parentIndex?: number;
    year?: number;
    guid?: string;
    imdbId?: string;
    thetvdbId?: string;
    thumb?: string;
};

type MusicItem = {
    type: "music";
    ratingKey: string;
    artist: string;
    album: string;
    track: string;
    trackNumber?: number;
    disc?: number;
    file: string;
    year?: number;
    genre?: string;
    guid?: string;
    thumb?: string;
};

type PreviewRow = {
    id: string;
    kind: "movie" | "episode" | "music";
    filePath: string;
    proposed: string;
    status: "good" | "warning" | "error" | "unmatched";
    flags: string[];
    // Original Plex metadata for popover display
    metadata?: MovieItem | EpisodeItem | MusicItem;
    // Subtitle operations for this file
    subtitleOperations?: Array<{
        originalPath: string;
        proposedPath: string;
        operationType: string;
        warningFlags: string[];
    }>;
};

type SectionResponse = any; // shape varies by library type (mock fixtures)

const RESERVED = new Set([
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
]);

const VIDEO_EXTS = new Set([".mkv", ".mp4", ".avi", ".mov", ".iso", ".m4v"]);

function extname(p: string) {
    const m = p.match(/\.[^.\\/]+$/);
    return m ? m[0] : "";
}

// @ts-ignore
function basename(p: string) {
    const m = p.match(/[^\\/]+$/);
    return m ? m[0] : p;
}

// Priority order for edition types (higher number = higher priority)
const EDITION_PRIORITY: Record<string, number> = {
    // Common content editions (highest priority)
    "directors": 100,
    "dc": 100,
    "extended": 95,
    "uncut": 95,
    "unrated": 95,
    "theatrical": 90,
    "remastered": 85,
    "restored": 85,
    "special": 80,
    "se": 80,
    "collectors": 75,
    "ce": 75,
    "deluxe": 70,
    "de": 70,
    "anniversary": 65,
    "ae": 65,
    "ultimate": 60,
    "ue": 60,
    "diamond": 55,
    "platinum": 50,
    "gold": 45,
    "silver": 40,
    "steelbook": 35,
    "criterion": 30,
    "cc": 30,

    // Technical editions (lower priority)
    "imax": 25,
    "4k": 20,
    "uhd": 20,
    "hdr": 15,
    "hdr10": 15,
    "dolby": 15,
    "atmos": 15,
    "bluray": 10,
    "blu": 10,
    "bd": 10,
    "dvd": 5,
    "web": 1,
    "hdtv": 1,
};

function getHighestPriorityEdition(editionToken: string): string {
    if (!editionToken.startsWith('{edition-')) return editionToken;

    const editions = editionToken.replace(/\{edition-/, '').replace('}', '').split(',');
    if (editions.length <= 1) return editionToken;

    // Sort by priority (highest first)
    const sortedEditions = editions.sort((a, b) => {
        const priorityA = EDITION_PRIORITY[a.toLowerCase()] || 0;
        const priorityB = EDITION_PRIORITY[b.toLowerCase()] || 0;
        return priorityB - priorityA;
    });

    return `{edition-${sortedEditions[0]}}`;
}

function sortEditionsByPriority(editionToken: string): string {
    if (!editionToken.startsWith('{edition-')) return editionToken;

    const editions = editionToken.replace(/\{edition-/, '').replace('}', '').split(',');
    if (editions.length <= 1) return editionToken;

    // Sort by priority (highest first)
    const sortedEditions = editions.sort((a, b) => {
        const priorityA = EDITION_PRIORITY[a.toLowerCase()] || 0;
        const priorityB = EDITION_PRIORITY[b.toLowerCase()] || 0;
        return priorityB - priorityA;
    });

    return `{edition-${sortedEditions.join(',')}}`;
}


async function sanitizeProposal(name: string, settings: any): Promise<{ ok: boolean; reason?: string; sanitized?: string }> {
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const sanitized = await invoke<string>("sanitize_filename_cmd", {
            filename: name,
            settings: settings.misc.characterReplacement
        });

        // Check if the sanitized name still contains invalid characters
        if (/[\\/:*?"<>|]/.test(sanitized)) {
            return {ok: false, reason: "invalid-chars", sanitized};
        }

        // Check for reserved names (after sanitization)
        const base = sanitized.replace(/\.[^.]+$/, "");
        if (RESERVED.has(base.toUpperCase())) {
            return {ok: false, reason: "reserved-name", sanitized};
        }

        return {ok: true, sanitized};
    } catch (error) {
        console.error("Failed to sanitize filename:", error);
        // Fallback to basic validation if backend fails
        if (/[\\/:*?"<>|]/.test(name)) return {ok: false, reason: "invalid-chars"};
        const base = name.replace(/\.[^.]+$/, "");
        if (RESERVED.has(base.toUpperCase())) return {ok: false, reason: "reserved-name"};
        return {ok: true, sanitized: name};
    }
}

function normalizeUnicode(name: string) {
    try {
        return name.normalize("NFC");
    } catch {
        return name;
    }
}

function hasNonLatin(name: string) {
    // Anything outside basic ASCII range
    return /[^\u0000-\u007F]/.test(name);
}

function safeFolderName(name: string) { return name.replace(/[\\/:*?"<>|]/g, "_"); }

// Apply collection naming style from settings
function formatCollectionFolderName(rawName: string, settings: any): string {
    const style = settings.movies?.collections?.naming || "original";
    let label = String(rawName || "").trim();
    switch (style) {
        case "prefix_":
            label = `_${label}`;
            break;
        case "prefix_collection":
            label = `Collection - ${label}`;
            break;
        case "suffix_collection":
            label = `${label} (Collection)`;
            break;
        case "original":
        default:
            // keep as-is
            break;
    }
    return safeFolderName(label);
}

function normalizeShowTitle(raw: string) {
    return raw.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

function shortenFilePath(filePath: string, libraryRoots: string[]): string {
    if (!libraryRoots.length) return filePath;

    // Normalize paths for comparison (handle both forward and backward slashes)
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Find the longest matching library root
    let bestMatch = '';
    let bestMatchLength = 0;

    for (const root of libraryRoots) {
        const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
        if (normalizedFilePath.startsWith(normalizedRoot + '/') && normalizedRoot.length > bestMatchLength) {
            bestMatch = normalizedRoot;
            bestMatchLength = normalizedRoot.length;
        }
    }

    // If we found a match, remove the root part
    if (bestMatch) {
        return normalizedFilePath.substring(bestMatch.length + 1);
    }

    return filePath;
}

function parseEpisodeInfo(filePath: string, fallbackTitle: string): { showTitle: string; season?: number; index?: number } {
    const file = basename(filePath).replace(/\.[^.]+$/, "");
    const seMatch = file.match(/S(\d{1,2})E(\d{1,2})/i);
    let season: number | undefined;
    let index: number | undefined;
    if (seMatch) {
        season = parseInt(seMatch[1], 10);
        index = parseInt(seMatch[2], 10);
    }
    let head = file;
    if (seMatch && seMatch.index != null) head = file.slice(0, seMatch.index);
    let showTitle = normalizeShowTitle(head);
    if (!showTitle) {
        // Try from the item title before " - "
        const tHead = String(fallbackTitle || "").split(" - ")[0];
        showTitle = normalizeShowTitle(tHead) || "Unknown Show";
    }
    return { showTitle, season, index };
}

async function computeMovieProposal(m: MovieItem, template: string, ownFolderPerMovie: boolean, collectionsEnabled: boolean, collectionName: string, settings: any): Promise<PreviewRow> {
    const ext = extname(m.file) || ".mkv";

    // Get edition from Plex API or detect from file path
    let editionToken: string | undefined = m.edition || undefined;
    let editionTitle: string | undefined = m.editionTitle || undefined;

    // Detect from path (folders/filename) when enabled
    if (settings.movies.editions.createFromFilenames) {
        const detected: DetectedEdition | null = detectEditionFromPathWithPriority(m.file, settings.movies.editions.parsers);
        if (detected) {
            editionToken = detected.token || editionToken;
            editionTitle = detected.title || editionTitle;

            // Only log for the specific file the user is asking about
            if (m.file.toLowerCase().includes('40-year-old virgin') || m.file.toLowerCase().includes('unrated')) {
                console.log(`🎯 DEBUG: File ${m.file} - Detected edition:`, detected);
            }
        }
    }

    // Extract IDs from GUID
    const imdbId = m.guid ? extractImdbId(m.guid) : null;
    const thetvdbId = m.guid ? extractTvdbId(m.guid) : null;
    const tmdbId = m.guid ? extractTmdbId(m.guid) : null;

    // Process IDs based on user settings
    let processedIds = "";
    if (settings.movies.ids === "preserve") {
        // Preserve existing IDs in the filename
        if (imdbId) processedIds += ` {imdb}`;
        if (thetvdbId) processedIds += ` {thetvdb}`;
        if (tmdbId) processedIds += ` {tmdb}`;
    } else if (settings.movies.ids === "auto_append_all") {
        // Auto-append all available IDs
        if (imdbId) processedIds += ` {imdb}`;
        if (thetvdbId) processedIds += ` {thetvdb}`;
        if (tmdbId) processedIds += ` {tmdb}`;
    }

    // Process edition based on user settings
    let editionDisplay = "";

    // Determine whether to include edition information
    let shouldIncludeEdition = settings.movies.editions.mode !== "none" && (editionToken || editionTitle);

    if (shouldIncludeEdition) {
        if (!settings.movies.editions.createMultipleTags) {
            // When "Create multiple tags" is OFF: only include the highest priority edition
            if (editionToken) {
                editionToken = getHighestPriorityEdition(editionToken);
                const tokenPart = editionToken.replace(/\{edition-/, '').replace('}', '');
                editionDisplay = mapEditionTokenToTitle(tokenPart) || editionToken;
            } else if (editionTitle) {
                // For titles, we need to apply priority logic too
                // Split by common separators and find the highest priority
                const titleParts = editionTitle.split(/[-\s]+/);
                let highestPriorityPart = titleParts[0]; // default to first
                let highestPriority = EDITION_PRIORITY[highestPriorityPart.toLowerCase()] || 0;

                for (const part of titleParts) {
                    const priority = EDITION_PRIORITY[part.toLowerCase()] || 0;
                    if (priority > highestPriority) {
                        highestPriority = priority;
                        highestPriorityPart = part;
                    }
                }
                editionDisplay = mapEditionTokenToTitle(highestPriorityPart) || highestPriorityPart;
            }
        } else {
            // When "Create multiple tags" is ON: use all detected editions, but sort by priority
            if (editionToken) {
                editionToken = sortEditionsByPriority(editionToken);
            }
            editionDisplay = editionToken || editionTitle || "";
        }

        // Apply edition mode formatting
        if (settings.movies.editions.mode === "preserve") {
            // Use the Plex edition token as-is
            editionDisplay = editionToken || "";
        } else if (settings.movies.editions.mode === "expand") {
            // Use human-readable version (if editionTitle is available, otherwise use the token)
            editionDisplay = editionTitle ? ` - ${editionTitle}` : (editionToken || "");
        } else if (settings.movies.editions.mode === "both") {
            // Include both human-readable and token
            const humanReadable = editionTitle ? ` - ${editionTitle}` : "";
            editionDisplay = `${humanReadable} ${editionToken || ""}`.trim();
        }
    }

    // Log debug info for files with editions to understand the behavior
    if (editionToken || editionTitle) {
        console.log(`🎯 DEBUG: ${m.file}`);
        console.log(`  Settings: createFromFilenames=${settings.movies.editions.createFromFilenames}, createMultipleTags=${settings.movies.editions.createMultipleTags}`);
        console.log(`  Plex data: token=${m.edition}, title=${m.editionTitle}`);
        console.log(`  Detected: token=${editionToken}, title=${editionTitle}`);
        console.log(`  Final: display=${editionDisplay}`);
    }

    // Expanded context for movies
    const ctx = {
        title: m.title,
        year: m.year ?? "",
        ext,
        edition: editionDisplay,
        editionToken: editionToken || "",
        editionTitle: editionTitle || "",
        genre: m.genre ?? "",
        rating: m.rating ?? "",
        studio: m.studio ?? "",
        director: m.director ?? "",
        writer: m.writer ?? "",
        country: m.country ?? "",
        tagline: m.tagline ?? "",
        summary: m.summary ?? "",
        collection: collectionName,
        // ID fields
        imdb: imdbId ?? "",
        thetvdb: thetvdbId ?? "",
        tmdb: tmdbId ?? "",
        ids: processedIds,
    } as any;
    let proposed = renderTemplate(template, ctx);
    if (!proposed.endsWith(ext)) proposed += ext; // safety net if template omitted {ext}

    // If user selected an edition mode and the template did not include any edition
    // placeholders, enforce insertion before the extension (only if edition should be included).
    if (editionDisplay && settings.movies.editions.mode !== "none") {
        const lower = proposed.toLowerCase();
        const hasEditionAlready = lower.includes("{edition-") ||
            (editionTitle ? lower.includes(editionTitle.toLowerCase()) : false) ||
            lower.includes(editionToken?.toLowerCase() || "");
        if (!hasEditionAlready) {
            let injection = editionDisplay.startsWith(" - ") ? editionDisplay : ` ${editionDisplay}`;
            const dot = proposed.lastIndexOf(ext);
            if (dot > 0) {
                proposed = proposed.slice(0, dot) + injection + proposed.slice(dot);
            } else {
                proposed += injection;
            }
        }
    }

    // Analyze current file path to understand existing folder structure
    const currentPath = m.file;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const currentFolders = currentDir.split('/').filter(Boolean);

    // Apply folder structure logic based on settings
    const folderStructure = settings.movies.folderStructure;
    const chronologicalPrefix = settings.movies.chronologicalPrefix;
    const folderStructureBehavior = settings.movies.folderStructureBehavior;

    // Helper function to get folder organization path
    // Helper function to get the sorting title (ignoring articles if configured)
function getSortingTitle(title: string, alphaArticleHandling: string): string {
    if (alphaArticleHandling === "ignore") {
        // Remove common articles from the beginning for sorting purposes
        const articles = /^(the|a|an)\s+/i;
        return title.replace(articles, "");
    }
    return title;
}

// Helper function to detect existing folder structure patterns
function detectExistingFolderStructure(folders: string[]): {
    type: 'none' | 'alpha' | 'alpha_ranges' | 'year_decade' | 'genre' | 'custom';
    pattern?: string;
    confidence: number;
} {
    if (folders.length === 0) return { type: 'none', confidence: 1.0 };

    const topFolder = folders[0].toLowerCase();

    // Check for alphabetical patterns
    if (/^[a-z]$/.test(topFolder)) {
        return { type: 'alpha', pattern: topFolder, confidence: 0.9 };
    }

    // Check for alphabet ranges
    if (/^[a-z]-[a-z]$/.test(topFolder) || /^(a-d|e-h|i-l|m-p|q-t|u-z)$/.test(topFolder)) {
        return { type: 'alpha_ranges', pattern: topFolder, confidence: 0.9 };
    }

    // Check for year/decade patterns
    if (/^\d{4}s$/.test(topFolder)) {
        return { type: 'year_decade', pattern: topFolder, confidence: 0.8 };
    }

    // Check for common genre patterns (heuristic)
    const genrePatterns = ['action', 'adventure', 'comedy', 'drama', 'horror', 'sci-fi', 'thriller', 'documentary'];
    if (genrePatterns.some(g => topFolder.includes(g) || topFolder === g)) {
        return { type: 'genre', pattern: topFolder, confidence: 0.7 };
    }

    // Check for chronological prefixes in folder names
    if (/^\d{4}\s*-\s*.+/.test(folders[folders.length - 1] || '')) {
        return { type: 'custom', pattern: 'chronological', confidence: 0.6 };
    }

    return { type: 'custom', confidence: 0.3 };
}

function getOrganizedPath(title: string, year?: number, genre?: string): string {
        const baseFolderName = safeFolderName(title);
        let organizedPath = "";

        switch (folderStructure) {
            case "none":
                // No additional folder structure - just use individual folders if enabled
                break;

            case "alpha":
                // Alphabetical organization - use first letter
                const sortingTitle = getSortingTitle(title, settings.movies.alphaArticleHandling);
                const firstLetter = sortingTitle.charAt(0).toUpperCase();
                if (firstLetter >= 'A' && firstLetter <= 'Z') {
                    organizedPath = `${firstLetter}/${baseFolderName}`;
                } else {
                    organizedPath = `Other/${baseFolderName}`;
                }
                break;

            case "alpha_ranges":
                // Alphabet ranges (A-D, E-H, etc.)
                const sortingTitleRanges = getSortingTitle(title, settings.movies.alphaArticleHandling);
                const letterRanges = sortingTitleRanges.charAt(0).toUpperCase();
                if (letterRanges >= 'A' && letterRanges <= 'D') {
                    organizedPath = `A-D/${baseFolderName}`;
                } else if (letterRanges >= 'E' && letterRanges <= 'H') {
                    organizedPath = `E-H/${baseFolderName}`;
                } else if (letterRanges >= 'I' && letterRanges <= 'L') {
                    organizedPath = `I-L/${baseFolderName}`;
                } else if (letterRanges >= 'M' && letterRanges <= 'P') {
                    organizedPath = `M-P/${baseFolderName}`;
                } else if (letterRanges >= 'Q' && letterRanges <= 'T') {
                    organizedPath = `Q-T/${baseFolderName}`;
                } else if (letterRanges >= 'U' && letterRanges <= 'Z') {
                    organizedPath = `U-Z/${baseFolderName}`;
                } else {
                    organizedPath = `Other/${baseFolderName}`;
                }
                break;

            case "genre":
                // Organize by genre
                if (genre && genre.trim()) {
                    const genreFolder = safeFolderName(genre);
                    organizedPath = `${genreFolder}/${baseFolderName}`;
                } else {
                    organizedPath = `Unknown Genre/${baseFolderName}`;
                }
                break;

            case "year_decade":
                // Organize by decade (1980s, 1990s, etc.)
                if (year) {
                    const decade = Math.floor(year / 10) * 10;
                    organizedPath = `${decade}s/${baseFolderName}`;
                } else {
                    organizedPath = `Unknown Year/${baseFolderName}`;
                }
                break;
        }

        return organizedPath;
    }

    // Helper function to apply chronological prefix
    function applyChronologicalPrefix(path: string, year?: number): string {
        if (chronologicalPrefix === "none" || !year) return path;

        let prefix = "";
        if (chronologicalPrefix === "year") {
            prefix = `${year} - `;
        } else if (chronologicalPrefix === "collection_order") {
            // For collection order, we'd need collection metadata - for now just use year
            prefix = `${year} - `;
        }

        if (prefix) {
            // Insert prefix at the beginning of the path
            if (path.includes('/')) {
                const lastSlash = path.lastIndexOf('/');
                return path.substring(0, lastSlash + 1) + prefix + path.substring(lastSlash + 1);
            } else {
                return prefix + path;
            }
        }

        return path;
    }

    // Detect existing folder structure
    const existingStructure = detectExistingFolderStructure(currentFolders);

    // Handle collection-based folders if collections are enabled and movie has a collection
    if (collectionsEnabled && collectionName && collectionName.trim()) {
        const collectionFolderName = formatCollectionFolderName(collectionName, settings);
        // When collections are enabled, always use collection as the top-level folder
        // This overrides any template folder structure
        if (!proposed.includes('/')) {
            // Template doesn't include folders, so use collection as folder
            proposed = `${collectionFolderName}/${proposed}`;
        } else {
            // Template includes folders, but collections take precedence - replace entire path
            const fileName = proposed.substring(proposed.lastIndexOf('/') + 1);
            proposed = `${collectionFolderName}/${fileName}`;
        }
    }
    // If collections are disabled or movie has no collection, apply intelligent folder structure logic
    else {
        // Get desired organized path based on folder structure settings
        const desiredPath = getOrganizedPath(m.title, m.year, m.genre);

        // Make decisions based on folder structure behavior setting
        if (folderStructureBehavior === "preserve_existing") {
            // Always preserve existing folder structure
            if (proposed.includes('/')) {
                const existingBasePath = currentFolders.slice(0, -1).join('/');
                const fileName = proposed.substring(proposed.lastIndexOf('/') + 1);
                proposed = `${existingBasePath}/${fileName}`;
            }
        } else if (folderStructureBehavior === "reorganize_all") {
            // Always apply new folder structure regardless of existing structure
            if (desiredPath) {
                const prefixedPath = applyChronologicalPrefix(desiredPath, m.year);
                proposed = `${prefixedPath}/${proposed}`;
            } else if (ownFolderPerMovie && !proposed.includes('/')) {
                const folderName = safeFolderName(m.title);
                proposed = `${folderName}/${proposed}`;
            }
        } else { // intelligent (default)
            // Make intelligent decisions based on existing vs desired structure
            if (existingStructure.confidence > 0.7 && existingStructure.type === folderStructure) {
                // High confidence that existing structure matches desired structure
                // Preserve existing structure and just fix the filename
                if (proposed.includes('/')) {
                    const existingBasePath = currentFolders.slice(0, -1).join('/');
                    const fileName = proposed.substring(proposed.lastIndexOf('/') + 1);
                    proposed = `${existingBasePath}/${fileName}`;
                }
            } else if (desiredPath && !proposed.includes('/')) {
                // No existing structure or doesn't match desired - apply new structure
                const prefixedPath = applyChronologicalPrefix(desiredPath, m.year);
                proposed = `${prefixedPath}/${proposed}`;
            } else if (ownFolderPerMovie && !proposed.includes('/')) {
                // Fallback to individual movie folder if no other structure applies
                const folderName = safeFolderName(m.title);
                proposed = `${folderName}/${proposed}`;
            }
        }

        // If using intelligent mode and movie already has good structure but needs chronological prefix, add it
        if (folderStructureBehavior === "intelligent" && existingStructure.confidence > 0.7 && chronologicalPrefix !== "none" && m.year) {
            const needsPrefix = !currentFolders.some(folder => /^\d{4}\s*-/.test(folder));
            if (needsPrefix && proposed.includes('/')) {
                const lastSlash = proposed.lastIndexOf('/');
                const prefix = m.year + " - ";
                proposed = proposed.substring(0, lastSlash + 1) + prefix + proposed.substring(lastSlash + 1);
            }
        }
    }

    // Final chronological prefix application (if not already applied above)
    if (m.year && chronologicalPrefix !== "none" && folderStructureBehavior !== "preserve_existing") {
        const hasChronologicalPrefix = proposed.split('/').some(folder => /^\d{4}\s*-/.test(folder));
        if (!hasChronologicalPrefix) {
            proposed = applyChronologicalPrefix(proposed, m.year);
        }
    }

    proposed = normalizeUnicode(proposed);

    // Debug logging for folder structure decisions
    if (m.title.toLowerCase().includes('ace ventura') || m.title.toLowerCase().includes('addams family')) {
        console.log(`🎯 DEBUG: ${m.title} folder structure decision:`);
        console.log(`  Current path: ${currentPath}`);
        console.log(`  Current folders: [${currentFolders.join(', ')}]`);
        console.log(`  Existing structure: ${JSON.stringify(existingStructure)}`);
        console.log(`  Desired structure: ${folderStructure}`);
        console.log(`  Template proposed: ${proposed}`);
        console.log(`  Final proposed: ${proposed}`);
    }
    const flags: string[] = [];

    // Handle special cases for extras and ISO files
    if (settings.movies.specials.moveExtras) {
        // Check if this looks like an extras file (common patterns)
        const filename = basename(m.file).toLowerCase();
        const extrasPatterns = [
            /\bextra\b/, /\bextras\b/, /\bdeleted\b/, /\bscene\b/, /\bbehind.the.scenes\b/,
            /\binterview\b/, /\btrailer\b/, /\bfeaturette\b/, /\bbloopers?\b/,
            /\bcommentary\b/, /\bintro\b/, /\boutro\b/, /\bending\b/
        ];

        const isExtras = extrasPatterns.some(pattern => pattern.test(filename));
        if (isExtras) {
            // Move to Extras folder
            const fileName = basename(proposed);
            proposed = `Extras/${fileName}`;
            flags.push("moved-to-extras");
        }
    }

    // Mark ISO files
    if (settings.movies.specials.markISO && ext.toLowerCase() === ".iso") {
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

    let status: PreviewRow["status"] = "good";
    if (!VIDEO_EXTS.has(ext)) {
        status = "warning";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "error";
        if (reason) flags.push(reason);
    }
    const highlight = settings.general.encoding.highlightNonLatin;
    if (highlight && hasNonLatin(proposed) && status !== "error") {
        status = status === "good" ? "warning" : status;
        flags.push("non-latin");
    }
    if (proposed.length > 255) {
        status = "error";
        flags.push(">255 path");
    } else if (proposed.length > 200 && status !== "error") {
        status = "warning";
        flags.push(">200 path");
    }
    return {id: m.ratingKey, kind: "movie", filePath: m.file, proposed, status, flags};
}

async function computeEpisodeProposal(e: EpisodeItem, template: string, useSeasonFolders: boolean, settings: any): Promise<PreviewRow> {
    const ext = extname(e.file) || ".mkv";

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
    let folderPrefix = "";

    // For "Keep unchanged" ID setting, preserve existing show folder structure
    if (settings.tv.ids === "preserve") {
        // Extract the show folder from current path (should contain the IDs)
        const allParts = e.file.split('/').filter(Boolean);
        const dirParts = allParts.slice(0, -1); // exclude filename
        console.log(`🎯 DEBUG Episode: e.file="${e.file}", showTitle="${e.showTitle}", dirParts=${JSON.stringify(dirParts)}`);

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

            console.log(`🎯 DEBUG: chosen showFolder="${showFolder}", settings.tv.ids="${settings.tv.ids}"`);
            // Preserve ID tags if present in parentheses in the picked folder
            showFolder = showFolder.replace(/\(([^)]+)\)/g, '{$1}');

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
        if (useSeasonFolders) {
            // Create Series/Season XX/ structure
            const seasonLabel = typeof detectedSeason === "number" ? `Season ${String(detectedSeason).padStart(2, "0")}` : "Season 00";
            folderPrefix = `${safeFolderName(e.showTitle)}/${seasonLabel}/`;
        } else {
            // Create Series/Episode structure (no season folders)
            folderPrefix = `${safeFolderName(e.showTitle)}/`;
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

    let templateResult = renderTemplate(dynamicTemplate, ctx);
    let proposed = templateResult;
    if (!proposed.endsWith(ext)) proposed += ext;

    // TV Series folder structure MUST always be enforced
    // The template cannot override the series folder requirement
    if (folderPrefix) {
        proposed = folderPrefix + proposed;
    }
    proposed = normalizeUnicode(proposed);

    // Debug logging to understand what's happening
    console.log(`🎯 DEBUG: Template result: "${templateResult}", folderPrefix: "${folderPrefix}", final: "${proposed}"`);

    // Handle special cases for extras and ISO files (TV episodes)
    if (settings.tv.specials.moveExtras) {
        // Check if this looks like an extras file (common patterns)
        const filename = basename(e.file).toLowerCase();
        const extrasPatterns = [
            /\bextra\b/, /\bextras\b/, /\bdeleted\b/, /\bscene\b/, /\bbehind.the.scenes\b/,
            /\binterview\b/, /\btrailer\b/, /\bfeaturette\b/, /\bbloopers?\b/,
            /\bcommentary\b/, /\bintro\b/, /\boutro\b/, /\bending\b/
        ];

        const isExtras = extrasPatterns.some(pattern => pattern.test(filename));
        if (isExtras) {
            // Move to Extras folder
            const fileName = basename(proposed);
            proposed = `Extras/${fileName}`;
            flags.push("moved-to-extras");
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
    if (proposed.length > 255) {
        status = "error";
        flags.push(">255 path");
    } else if (proposed.length > 200 && status !== "error") {
        status = "warning";
        flags.push(">200 path");
    }
    return {id: e.ratingKey, kind: "episode", filePath: e.file, proposed, status, flags};
}

async function computeMusicProposal(m: MusicItem, template: string, settings: any): Promise<PreviewRow> {
    const ext = extname(m.file) || ".mp3";

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

    let proposed = renderTemplate(dynamicTemplate, ctx);
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
    if (proposed.length > 255) {
        status = "error";
        flags.push(">255 path");
    } else if (proposed.length > 200 && status !== "error") {
        status = "warning";
        flags.push(">200 path");
    }

    return {id: m.ratingKey, kind: "music", filePath: m.file, proposed, status, flags};
}

export default function Preview({server, library, onBack}: Props) {
    const { settings, updateSettings, settingsVersion } = useSettings();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<PreviewRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [moviesPaging, setMoviesPaging] = useState({ start: 0, size: settings.general.pagination.defaultMovieLimit, exhausted: false });

    // Update pagination when settings change
    useEffect(() => {
        setMoviesPaging(prev => ({ ...prev, size: settings.general.pagination.defaultMovieLimit }));
    }, [settings.general.pagination.defaultMovieLimit]);
    const [episodesPaging, setEpisodesPaging] = useState({ start: 0, size: 200, exhausted: false });
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [colWidths, setColWidths] = useState<{ current: number; proposed: number; flags: number }>({ current: 480, proposed: 480, flags: 0 });
    // Template is computed from current settings
    const template = library.type === "movie" ? settings.templates.movie :
                     library.type === "show" ? settings.templates.episode :
                     settings.templates.music;
    const [libraryFolder, setLibraryFolder] = useState<string | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [showTemplateHelp, setShowTemplateHelp] = useState(false);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
    const [currentShow, setCurrentShow] = useState<{ ratingKey: string; title: string } | null>(null);
    const [remoteResults, setRemoteResults] = useState<PreviewRow[]>([]);
    const [remoteQuery, setRemoteQuery] = useState<string>("");
    const [searching, setSearching] = useState(false);

    const [reloadTick, setReloadTick] = useState(0);

    // Popover state for showing Plex metadata on hover
    const [popoverData, setPopoverData] = useState<{ metadata: MovieItem | EpisodeItem | MusicItem | null; position: { x: number; y: number } }>({
        metadata: null,
        position: { x: 0, y: 0 }
    });

    // Popover hover handlers
    const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLDivElement>, row: PreviewRow) => {
        if (!row.metadata) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const position = {
            x: rect.left + rect.width / 2,
            y: rect.top - 10 // Position above the element
        };

        console.log("Hover Debug - Row metadata:", {
            title: row.metadata.type === "movie" ? row.metadata.title : (row.metadata as any).showTitle || (row.metadata as any).title || "Unknown",
            thumb: (row.metadata as any).thumb,
            filePath: row.filePath
        });

        setPopoverData({ metadata: row.metadata, position });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setPopoverData({ metadata: null, position: { x: 0, y: 0 } });
    }, []);

    // Load path mappings and determine the library folder for shortening paths
    useEffect(() => {
        async function loadPathMappings() {
            try {
                const settings = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
                const mappings = settings.pathMappings || [];

                // Find the mapped folder for this library
                const serverId = server.machineIdentifier || server.address;
                const libraryRoots = library.roots || [];

                for (const root of libraryRoots) {
                    const mapping = mappings.find(m => m.server_id === serverId && m.plex_root === root);
                    if (mapping) {
                        setLibraryFolder(mapping.local_root);
                        break;
                    }
                }
            } catch (error) {
                console.warn("Failed to load path mappings:", error);
                setLibraryFolder(null);
            }
        }

        loadPathMappings();
    }, [server.address, server.machineIdentifier, library.key, library.roots]);


    // Refresh path mappings when modal is saved
    const refreshPathMappings = useCallback(async () => {
        try {
            const settings = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
            const mappings = settings.pathMappings || [];

            // Find the mapped folder for this library
            const serverId = server.machineIdentifier || server.address;
            const libraryRoots = library.roots || [];

            for (const root of libraryRoots) {
                const mapping = mappings.find(m => m.server_id === serverId && m.plex_root === root);
                if (mapping) {
                    setLibraryFolder(mapping.local_root);
                    break;
                }
            }
        } catch (error) {
            console.warn("Failed to refresh path mappings:", error);
            setLibraryFolder(null);
        }
    }, [server.address, server.machineIdentifier, library.roots]);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                let token: string | null = null;
                try { token = localStorage.getItem("plexToken"); } catch {}
                
                const list: PreviewRow[] = [];
                
                if (library.type === "movie") {
                    // Fetch movie items using the existing command
                    const data = await invoke<SectionResponse>("fetch_library_content", {
                        server: server.address,
                        libraryKey: library.key,
                        token: token ?? null,
                        start: moviesPaging.start,
                        size: moviesPaging.size,
                    });
                    const mc = data?.MediaContainer;
                    const md = mc?.Metadata ?? [];
                    if (md.length === 0) {
                        setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                    } else if (md.length < moviesPaging.size) {
                        setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                    }
                    for (const item of md) {
                        const file = item?.Media?.[0]?.Part?.[0]?.file;
                        if (!file) continue;
                        const movieRatingKey = String(item.ratingKey ?? item.key ?? file);

                        console.log("Movie item fields:", {
                            title: item.title,
                            edition: item.edition,
                            genre: item.genre,
                            contentRating: item.contentRating,
                            studio: item.studio,
                            director: item.director,
                            writer: item.writer,
                            country: item.country,
                            tagline: item.tagline,
                            summary: item.summary,
                            thumb: item.thumb,
                            art: item.art,
                        });
                        console.log("Full item object:", item);
                        // Extract collection information directly from movie metadata
                        const collections = item.Collection || item.collection || [];
                        console.log(`Raw collections for ${item.title}:`, collections);
                        const collectionName = Array.isArray(collections) && collections.length > 0
                            ? (collections[0]?.tag || collections[0])
                            : "";
                        console.log(`Movie ${movieRatingKey} (${item.title}) -> Collection: "${collectionName}"`);

                        const m: MovieItem = {
                            type: "movie",
                            ratingKey: movieRatingKey,
                            title: String(item.title ?? "Unknown"),
                            year: item.year ? Number(item.year) : undefined,
                            file: String(file),
                            edition: String(item.edition ?? item.editionTitle ?? ""),
                            genre: String(item.genre ?? ""),
                            rating: String(item.contentRating ?? ""),
                            studio: String(item.studio ?? ""),
                            director: String(item.director ?? ""),
                            writer: String(item.writer ?? ""),
                            country: String(item.country ?? ""),
                            tagline: String(item.tagline ?? ""),
                            summary: String(item.summary ?? ""),
                            thumb: String(item.thumb ?? ""),
                        };
                        const tpl = settings.templates.movie || template;
                        const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings);
                        row.metadata = m; // Store original metadata for popover
                        list.push(row);
                    }
                } else if (library.type === "artist") {
                    // Fetch music tracks using the fetch_library_content command (music tracks are under Metadata)
                    const data = await invoke<SectionResponse>("fetch_library_content", {
                        server: server.address,
                        libraryKey: library.key,
                        token: token ?? null,
                        start: moviesPaging.start, // Reuse movie paging for music
                        size: moviesPaging.size,
                    });
                    const mc = data?.MediaContainer;
                    const md = mc?.Metadata ?? [];
                    if (md.length === 0) {
                        setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                    } else if (md.length < moviesPaging.size) {
                        setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                    }
                    for (const item of md) {
                        const file = item?.Media?.[0]?.Part?.[0]?.file;
                        if (!file) continue;
                        const musicRatingKey = String(item.ratingKey ?? item.key ?? file);

                        console.log("Music item fields:", {
                            title: item.title,
                            grandparentTitle: item.grandparentTitle, // Artist
                            parentTitle: item.parentTitle, // Album
                            year: item.year,
                            genre: item.genre,
                            track: item.index, // Track number
                            disc: item.parentIndex, // Disc number
                        });

                        const m: MusicItem = {
                            type: "music",
                            ratingKey: musicRatingKey,
                            artist: String(item.grandparentTitle ?? "Unknown Artist"),
                            album: String(item.parentTitle ?? "Unknown Album"),
                            track: String(item.title ?? "Unknown Track"),
                            trackNumber: item.index ? Number(item.index) : undefined,
                            disc: item.parentIndex ? Number(item.parentIndex) : undefined,
                            file: String(file),
                            year: item.year ? Number(item.year) : undefined,
                            genre: String(item.genre ?? ""),
                            thumb: String(item.thumb ?? ""),
                        };
                        const tpl = settings.templates.music || template;
                        const row = await computeMusicProposal(m, tpl, settings);
                        row.metadata = m; // Store original metadata for popover
                        list.push(row);
                    }
                } else if (library.type === "show") {
                    // For TV shows, check if a specific show was selected or if we have current show state
                    const initialShow = (window as any).__initialShow;
                    const showToLoad = initialShow || currentShow;

                    if (showToLoad) {
                        if (initialShow) {
                            setCurrentShow(initialShow);
                        }
                        // Load episodes for the selected show only
                        const epsResp = await invoke<any>("fetch_show_episodes", {
                            server: server.address,
                            showRatingKey: showToLoad.ratingKey,
                            token,
                            start: episodesPaging.start,
                            size: episodesPaging.size,
                        });
                        const md = epsResp?.MediaContainer?.Metadata ?? [];
                        if (md.length === 0) {
                            setEpisodesPaging(prev => ({ ...prev, exhausted: true }));
                        } else if (md.length < episodesPaging.size) {
                            setEpisodesPaging(prev => ({ ...prev, exhausted: true }));
                        }
                        for (const item of md) {
                            const file = item?.Media?.[0]?.Part?.[0]?.file;
                            if (!file) continue;
                            const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                            const e: EpisodeItem = {
                                type: "episode",
                                ratingKey: String(item.ratingKey ?? item.key ?? file),
                                showTitle: showToLoad.title,
                                title: String(item.title ?? "Episode"),
                                season: parsed.season,
                                index: parsed.index,
                                file: String(file),
                                year: item.year ? Number(item.year) : undefined,
                                grandparentTitle: String(item.grandparentTitle ?? showToLoad.title),
                                parentTitle: String(item.parentTitle ?? ""),
                                parentIndex: item.parentIndex ? Number(item.parentIndex) : parsed.season,
                                thumb: String(item.thumb ?? ""),
                            };
                            const tpl = settings.templates.episode || template;
                            const useSeasonFolders = !!settings.tv.seasonFolders;
                            const proposal = await computeEpisodeProposal(e, tpl, useSeasonFolders, settings);
                            proposal.metadata = e; // Store original metadata for popover
                            list.push(proposal);
                        }
                        // Clear the initial show after loading if it was from window
                        if (initialShow) {
                            delete (window as any).__initialShow;
                        }
                    }
                    // If no show selected, show message to go back to show selection
                } else if (library.type === "show") {
                    // For TV shows without a selected show, show a message
                    setRows([]);
                    setError("Please select a TV show first from the show selection page.");
                    return; // Exit early to avoid setting selected IDs on empty list
                } else {
                    // For other library types (movie, artist), this is handled above
                    // This else clause should not be reached for valid library types
                    setRows([]);
                    setError(`Unsupported library type: ${library.type}`);
                    return;
                }

                // Process subtitle operations for all files
                try {
                    const filePaths = list.map(row => row.filePath);
                    if (filePaths.length > 0) {
                        const previewResult = await invoke<any>("preview_video_renames", {
                            libraryId: library.key,
                            scope: filePaths,
                            settings: settings,
                        });

                        // Add subtitle operations to the corresponding preview rows
                        if (previewResult.subtitle_operations && previewResult.subtitle_operations.length > 0) {
                            const subtitleOpsByFile = new Map<string, any[]>();
                            for (const op of previewResult.subtitle_operations) {
                                const videoPath = op.original_path.substring(0, op.original_path.lastIndexOf('/'));
                                if (!subtitleOpsByFile.has(videoPath)) {
                                    subtitleOpsByFile.set(videoPath, []);
                                }
                                subtitleOpsByFile.get(videoPath)!.push(op);
                            }

                            // Update rows with subtitle operations
                            list.forEach(row => {
                                const videoDir = row.filePath.substring(0, row.filePath.lastIndexOf('/'));
                                const subtitleOps = subtitleOpsByFile.get(videoDir) || [];
                                if (subtitleOps.length > 0) {
                                    row.subtitleOperations = subtitleOps.map(op => ({
                                        originalPath: op.original_path,
                                        proposedPath: op.new_path,
                                        operationType: op.operation_type,
                                        warningFlags: op.warning_flags || [],
                                    }));
                                }
                            });
                        }
                    }
                } catch (subtitleError) {
                    console.warn("Failed to process subtitle operations:", subtitleError);
                    // Continue without subtitle operations
                }

                setRows(list);
                setSelectedIds(new Set(list.filter(r => r.status !== "error").map(r => r.id)));
            } catch (e: any) {
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [server.address, library.key, library.type, template, reloadTick, settingsVersion,
        settings.movies.collections.enabled,
        settings.movies.collections.mode,
        settings.movies.collections.naming,
        settings.movies.ownFolderPerMovie,
        settings.movies.folderStructure,
        settings.movies.chronologicalPrefix,
        settings.movies.alphaArticleHandling,
        settings.movies.folderStructureBehavior,
        settings.tv.seasonFolders,
        settings.general.encoding.mode,
        settings.general.encoding.highlightNonLatin,
        settings.templates.movie,
        settings.templates.episode,
        settings.movies.editions.mode,
        settings.movies.editions.createFromFilenames,
        settings.movies.editions.createMultipleTags,
        settings.movies.ids,
        settings.movies.specials.moveExtras,
        settings.movies.specials.markISO,
        settings.tv.ids,
        settings.tv.detectCuts,
        settings.tv.detectOVAsSeason00,
        settings.tv.normalizeMultiEpisode,
        settings.tv.warnEpisodeCountMismatch,
        settings.general.conflictHandling,
        settings.general.safety.pathLengthCheck,
        settings.general.safety.reservedNamesCheck,
        settings.general.safety.permissionsCheck
    ]);



    // Debounce search query to prevent excessive API calls
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Clear search results when debounced query becomes empty
    useEffect(() => {
        if (!debouncedSearchQuery.trim()) {
            // When search is cleared, ensure we only show originally loaded items
            // The filteredRows useMemo will handle showing all rows when debouncedSearchQuery is empty
        }
    }, [debouncedSearchQuery]);

    const filteredRows = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return rows;

        const query = debouncedSearchQuery.toLowerCase();
        const libraryRoots = library.roots || [];
        const results = rows.filter(r => {
            const currentPath = shortenFilePath(r.filePath, libraryRoots).toLowerCase();
            const proposedName = r.proposed.toLowerCase();
            const fullPath = r.filePath.toLowerCase();
            return currentPath.includes(query) || proposedName.includes(query) || fullPath.includes(query);
        });

        return results;
    }, [rows, debouncedSearchQuery, library.roots]);

    // Trigger remote (API) search for all queries
    useEffect(() => {
        const q = debouncedSearchQuery.trim();
        if (!q) {
            setRemoteResults([]);
            setRemoteQuery("");
            setSearching(false);
            return;
        }

        // If we're currently loading initial data, wait for it to complete
        if (loading) {
            // Effect will re-run because of dependency on `loading`
            return;
        }
        let isCancelled = false;
        console.log("SEARCH EFFECT: triggering remote search", { q, filteredCount: filteredRows.length });
        setSearching(true);
        (async () => {
            try {
                const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
                const sectionNum = (() => { const n = Number(library.key); return Number.isFinite(n) ? n : null; })();
                const libraryRoots = library.roots || [];
                const searchResults = await invoke<any>("search_content", {
                    server: server.address,
                    query: q,
                    sectionId: sectionNum,
                    limit: 50,
                    token,
                });
                if (isCancelled) return;
                const hubs = searchResults?.MediaContainer?.Hub || [];
                const newRows: PreviewRow[] = [];

                // Debug logging to understand search response structure
                console.log("SEARCH RESULTS DEBUG:", {
                    query: q,
                    libraryKey: library.key,
                    sectionNum,
                    hubsCount: hubs.length,
                    hubs: hubs.map((h: any) => ({
                        type: h.type,
                        hubIdentifier: h.hubIdentifier,
                        title: h.title,
                        itemsCount: (h.Directory || h.Metadata || []).length
                    }))
                });

                // Filter hubs to only include those from the current library section
                // Note: Plex API may return results from all libraries despite sectionId parameter
                // We need additional filtering here to ensure only current library results are shown

                for (const hub of hubs) {
                    // Check if this hub belongs to our current library section
                    // The hub might contain section information that we can use for filtering
                    const hubSectionId = hub.sectionId || hub.librarySectionID;
                    console.log("HUB DEBUG:", {
                        hubTitle: hub.title,
                        hubType: hub.type,
                        hubSectionId,
                        ourSectionId: sectionNum,
                        shouldInclude: hubSectionId == sectionNum || !hubSectionId // Include if no section info or matches our section
                    });

                    // Filter hubs to only include those from the current library section
                    // If hub has section info and it doesn't match our section, skip it
                    if (hubSectionId && hubSectionId != sectionNum) {
                        console.log(`Skipping hub "${hub.title}" - section ${hubSectionId} != ${sectionNum}`);
                        continue;
                    }

                    const items = hub.Directory || hub.Metadata || [];
                    if (!Array.isArray(items)) continue;
                    for (const item of items) {
                        let filePath = "";
                        try { filePath = String(item?.Media?.[0]?.Part?.[0]?.file || ""); } catch {}

                        // Skip items that don't have actual file paths (API endpoints, metadata, etc.)
                        if (!filePath || filePath.startsWith('/library/') || filePath.includes('?') || !filePath.includes('.')) {
                            console.log(`Skipping search result "${item.title}" - no valid file path: "${filePath}"`);
                            continue;
                        }

                        // Additional filtering: if item has a file path, check if it's in our library roots
                        if (filePath && libraryRoots.length > 0) {
                            const normalizedFilePath = filePath.replace(/\\/g, '/');
                            const isInLibrary = libraryRoots.some(root => {
                                const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
                                return normalizedFilePath.startsWith(normalizedRoot + '/');
                            });

                            if (!isInLibrary) {
                                console.log(`Skipping item "${item.title}" - file path "${filePath}" not in library roots`);
                                continue;
                            }
                        }

                        if (library.type === "movie") {
                            // Ensure we have a valid file path before proceeding
                            if (!filePath || filePath.length === 0) {
                                console.log(`Skipping movie "${item.title}" - no file path`);
                                continue;
                            }

                            const movieRatingKey = String(item.ratingKey || item.key || filePath || Math.random());
                            // Extract collection information directly from movie metadata
                            const collections = item.Collection || item.collection || [];
                            const collectionName = Array.isArray(collections) && collections.length > 0
                                ? (collections[0].tag || collections[0])
                                : "";
                            console.log(`Remote movie ${movieRatingKey} (${item.title}) -> Collection: "${collectionName}"`);

                            const m: MovieItem = {
                                type: "movie",
                                ratingKey: movieRatingKey,
                                title: String(item.title || "Unknown"),
                                year: item.year ? Number(item.year) : undefined,
                                file: filePath, // Only use actual file paths, not API endpoints
                                edition: String(item.edition ?? item.editionTitle ?? ""),
                                genre: String(item.genre ?? ""),
                                rating: String(item.contentRating ?? ""),
                                studio: String(item.studio ?? ""),
                                director: String(item.director ?? ""),
                                writer: String(item.writer ?? ""),
                                country: String(item.country ?? ""),
                                tagline: String(item.tagline ?? ""),
                                summary: String(item.summary ?? ""),
                                thumb: String(item.thumb ?? ""),
                            };
                            const tpl = settings.templates.movie || template;
                            const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings);
                            row.metadata = m; // Store original metadata for popover
                            row.flags.push("remote-search");
                            newRows.push(row);
                        } else {
                            // TV episode
                            // Ensure we have a valid file path before proceeding
                            if (!filePath || filePath.length === 0) {
                                console.log(`Skipping episode "${item.title}" - no file path`);
                                continue;
                            }

                            const showTitle = String(item.grandparentTitle || item.parentTitle || item.title || "Unknown Show");
                            const seasonNum = typeof item.parentIndex === "number" ? item.parentIndex : (item.parentIndex ? Number(item.parentIndex) : undefined);
                            const epIndex = typeof item.index === "number" ? item.index : (item.index ? Number(item.index) : undefined);
                            const e: EpisodeItem = {
                                type: "episode",
                                ratingKey: String(item.ratingKey || item.key || filePath || Math.random()),
                                showTitle,
                                title: String(item.title || "Episode"),
                                season: seasonNum,
                                index: epIndex,
                                file: filePath, // Only use actual file paths, not API endpoints
                                year: item.year ? Number(item.year) : undefined,
                                grandparentTitle: String(item.grandparentTitle ?? showTitle),
                                parentTitle: String(item.parentTitle ?? ""),
                                parentIndex: item.parentIndex ? Number(item.parentIndex) : seasonNum,
                                thumb: String(item.thumb ?? ""),
                            };
                            const tpl = settings.templates.episode || template;
                            const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings);
                            row.metadata = e; // Store original metadata for popover
                            row.flags.push("remote-search");
                            newRows.push(row);
                        }
                    }
                }
                setRemoteResults(newRows);
                setRemoteQuery(q);
            } catch (e) {
                console.warn("Remote search failed:", e);
                setRemoteResults([]);
                setRemoteQuery(q);
            } finally {
                if (!isCancelled) setSearching(false);
            }
        })();
        return () => { isCancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchQuery, filteredRows.length, library.key, server.address, loading]);

    // Final rows to display - combine local and remote results
    const displayRows = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return rows;

        // Combine local filtered results with remote results
        let combined: PreviewRow[] = [];

        // Add local results first
        if (filteredRows.length > 0) {
            combined.push(...filteredRows);
        }

        // Add remote results if they match the current query
        if (remoteQuery === debouncedSearchQuery && remoteResults.length > 0) {
            combined.push(...remoteResults);
        }

        return combined;
    }, [rows, filteredRows, remoteResults, debouncedSearchQuery, remoteQuery]);

    const anyRedSelected = useMemo(() => displayRows.some(r => r.status === "error" && selectedIds.has(r.id)), [displayRows, selectedIds]);
    const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
    const pageRows = useMemo(() => displayRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [displayRows, page, pageSize]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

    function toggle(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function skipReds() {
        setSelectedIds(new Set(rows.filter(r => r.status !== "error").map(r => r.id)));
    }

    async function applyRename() {
        if (anyRedSelected) return;

        setLoading(true);
        try {
            // Collect all operations (video + subtitle)
            const operations = [];

            for (const row of rows) {
                if (selectedIds.has(row.id)) {
                    // Add video operation
                    operations.push({
                        operation_type: "rename",
                        original_path: row.filePath,
                        new_path: row.proposed,
                        backup_path: null,
                        operation_id: `video_${row.id}`,
                    });

                    // Add subtitle operations
                    if (row.subtitleOperations) {
                        for (const subOp of row.subtitleOperations) {
                            operations.push({
                                operation_type: subOp.operationType,
                                original_path: subOp.originalPath,
                                new_path: subOp.proposedPath,
                                backup_path: subOp.operationType === "convert" ? `${subOp.originalPath}.backup` : null,
                                operation_id: `subtitle_${row.id}_${operations.length}`,
                            });
                        }
                    }
                }
            }

            if (operations.length === 0) return;

            const result = await invoke<any>("apply_video_renames", {
                operations,
                settings,
            });

            if (result.success) {
                alert(`Successfully applied ${result.operations_applied} operations.\nRollback log saved to: ${result.rollback_log_path}`);
            } else {
                alert(`Applied ${result.operations_applied} operations, but ${result.operations_failed} failed.\nCheck console for details.`);
                console.error("Apply errors:", result.errors);
            }
        } catch (error) {
            console.error("Failed to apply renames:", error);
            alert(`Failed to apply renames: ${error}`);
        } finally {
            setLoading(false);
        }
    }

    async function undoLastRename() {
        if (!confirm("This will undo the last rename operation. Continue?")) return;

        setLoading(true);
        try {
            const result = await invoke<any>("undo_last_rename");

            if (result.success) {
                alert(`Successfully undid ${result.operations_applied} operations.`);
                // Reload the page to reflect changes
                setReloadTick(t => t + 1);
            } else {
                alert(`Undid ${result.operations_applied} operations, but ${result.operations_failed} failed.\nCheck console for details.`);
                console.error("Undo errors:", result.errors);
            }
        } catch (error) {
            console.error("Failed to undo renames:", error);
            alert(`Failed to undo renames: ${error}`);
        } finally {
            setLoading(false);
        }
    }

    // Column resizing + fluid width support
    useEffect(() => {
        function distributeInitial() {
            const el = containerRef.current;
            if (!el) return;
            const containerWidth = el.clientWidth;
            const gapPx = 8; // gap-2
            const fixed = 60 + 120 + gapPx * 3; // toggle + status icon + gaps (removed flags column)
            const avail = Math.max(0, containerWidth - fixed);
            const w1 = Math.max(240, Math.floor(avail * (2.0 / 4.0))); // current path column gets more space
            const w2 = Math.max(240, Math.floor(avail * (2.0 / 4.0))); // proposed column gets more space
            setColWidths({ current: w1, proposed: w2, flags: 0 }); // flags column removed
        }

        function onResize() {
            const el = containerRef.current;
            if (!el) return;
            const containerWidth = el.clientWidth;
            const gapPx = 8;
            const fixed = 60 + 120 + gapPx * 3; // toggle + status icon + gaps
            const avail = Math.max(0, containerWidth - fixed);
            const totalFlex = colWidths.current + colWidths.proposed;
            if (avail <= 0 || totalFlex <= 0) return;
            const ratio = avail / totalFlex;
            let current = Math.max(160, Math.floor(colWidths.current * ratio));
            let proposed = Math.max(160, Math.floor(avail - current));
            setColWidths({ current, proposed, flags: 0 });
        }

        // Initial distribution and resize listener
        distributeInitial();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function startResize(which: "current" | "proposed", ev: React.MouseEvent) {
        ev.preventDefault();
        const startX = ev.clientX;
        const start = { ...colWidths };
        const el = containerRef.current;
        const gapPx = 8;
        const fixed = 60 + 120 + gapPx * 3; // toggle + status icon + gaps
        const containerWidth = el?.clientWidth ?? 0;
        const avail = Math.max(0, containerWidth - fixed);
        const min = 160;

        function onMove(e: MouseEvent) {
            const dx = e.clientX - startX;
            let current = start.current;
            let proposed = start.proposed;
            if (which === "current") {
                current = Math.max(min, Math.min(avail - min, start.current + dx));
            } else {
                proposed = Math.max(min, Math.min(avail - min, start.proposed + dx));
            }
            setColWidths({ current, proposed, flags: 0 });
        }
        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    const gridTemplate = `60px ${colWidths.current}px ${colWidths.proposed}px 120px 0px`;

    // Window title
    useEffect(() => {
        try { getCurrentWindow().setTitle(`Name-o-Tron 9000 — Preview`); } catch {}
    }, []);

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                <div className="mx-auto flex min-w-[1000px] items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconArrowBack className="h-5 w-5"/>
                            Back
                        </button>
                        <button type="button" onClick={() => (window as any).__goto_home?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconHome className="h-5 w-5"/>
                            Home
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={skipReds} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSelectOff className="h-5 w-5"/>
                            Skip Reds
                        </button>
                        <button onClick={applyRename} disabled={anyRedSelected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                            <IconBolt className="h-5 w-5"/>
                            Proceed
                        </button>
                        <button onClick={undoLastRename} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            ↶ Undo
                        </button>
                        <button title="Reload library" onClick={() => setReloadTick(t => t + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5"/>
                            Reload
                        </button>
                        <input
                            value={template}
                            onChange={(e) => {
                                const next = e.target.value;
                                const templateKey = library.type === "movie" ? "movie" :
                                                   library.type === "show" ? "episode" : "music";
                                const updated = {
                                    ...settings,
                                    templates: {
                                        ...settings.templates,
                                        [templateKey]: next,
                                    }
                                } as any;
                                updateSettings(updated);
                            }}
                            placeholder={
                                library.type === "movie" ? "Movie template" :
                                library.type === "show" ? "Episode template" : "Music template"
                            }
                            className="w-[380px] rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTemplateHelp(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                          title="Show available template fields"
                        >
                          <IconQuestionCircle className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const def = library.type === "movie"
                              ? "{title}[ ({year})]{ext}"
                              : library.type === "show"
                              ? "{showTitle} - S{season:02}E{episode:02} - {title}{ext}"
                              : "{artist}/{album}/{trackNumber:02} - {track}{ext}";
                            const templateKey = library.type === "movie" ? "movie" :
                                               library.type === "show" ? "episode" : "music";
                            const updated = {
                              ...settings,
                              templates: {
                                ...settings.templates,
                                [templateKey]: def,
                              }
                            } as any;
                            updateSettings(updated);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                        >
                          Reset
                        </button>
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                    </div>

                </div>
            </header>

            <section className="mx-auto px-6 py-6">
                {/* Library info, search, and load more buttons on the same line */}
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="text-sm text-neutral-400">
                        Server: <span className="text-neutral-200">{server.name}</span> — Library: <span className="text-neutral-200">{library.title}</span>
                        {currentShow && (
                            <>
                                {" "}— Show: <span className="text-neutral-200">{currentShow.title}</span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Load more buttons */}
                        {library.type === "movie" && !moviesPaging.exhausted && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={async () => {
                                        const nextStart = rows.length;
                                        setLoading(true);
                                        try {
                                            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
                                            const data = await invoke<SectionResponse>("fetch_library_content", {
                                                server: server.address,
                                                libraryKey: library.key,
                                                token,
                                                start: nextStart,
                                                size: moviesPaging.size,
                                            });
                                            const mc = data?.MediaContainer;
                                            const md = mc?.Metadata ?? [];
                                            if (md.length === 0) {
                                                setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                                            }
                                            const more: PreviewRow[] = [];
                                            for (const item of md) {
                                                const file = item?.Media?.[0]?.Part?.[0]?.file;
                                                if (!file) continue;
                                                const movieRatingKey = String(item.ratingKey ?? item.key ?? file);
                                                // Extract collection information directly from movie metadata
                                                const collections = item.Collection || item.collection || [];
                                                const collectionName = Array.isArray(collections) && collections.length > 0
                                                    ? (collections[0].tag || collections[0])
                                                    : "";
                                                console.log(`Load more movie ${movieRatingKey} (${item.title}) -> Collection: "${collectionName}"`);

                                                const m: MovieItem = {
                                                    type: "movie",
                                                    ratingKey: movieRatingKey,
                                                    title: String(item.title ?? "Unknown"),
                                                    year: item.year ? Number(item.year) : undefined,
                                                    file: String(file),
                                                    edition: String(item.edition ?? item.editionTitle ?? ""),
                                                    genre: String(item.genre ?? ""),
                                                    rating: String(item.contentRating ?? ""),
                                                    studio: String(item.studio ?? ""),
                                                    director: String(item.director ?? ""),
                                                    writer: String(item.writer ?? ""),
                                                    country: String(item.country ?? ""),
                                                    tagline: String(item.tagline ?? ""),
                                                    summary: String(item.summary ?? ""),
                                                    thumb: String(item.thumb ?? ""),
                                                };
                                                const tpl = settings.templates.movie || template;
                                                const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings);
                                                row.metadata = m; // Store original metadata for popover
                                                more.push(row);
                                            }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
                                            console.warn("Load more movies failed", e);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                                >
                                    Load more movies
                                </button>
                                <div className="group relative">
                                    <IconInfo className="h-4 w-4 text-neutral-400 hover:text-neutral-200 cursor-help" />
                                    <div className="invisible group-hover:visible absolute right-0 mt-2 w-48 rounded-md bg-neutral-800 p-2 text-xs text-neutral-200 shadow-lg z-20">
                                        {rows.length} movies loaded
                                    </div>
                                </div>
                            </div>
                        )}

                        {library.type === "artist" && !moviesPaging.exhausted && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={async () => {
                                        const nextStart = rows.length;
                                        setLoading(true);
                                        try {
                                            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
                                            const data = await invoke<SectionResponse>("fetch_library_content", {
                                                server: server.address,
                                                libraryKey: library.key,
                                                token,
                                                start: nextStart,
                                                size: moviesPaging.size,
                                            });
                                            const mc = data?.MediaContainer;
                                            const md = mc?.Metadata ?? [];
                                            if (md.length === 0) {
                                                setMoviesPaging(prev => ({ ...prev, exhausted: true }));
                                            }
                                            const more: PreviewRow[] = [];
                                            for (const item of md) {
                                                const file = item?.Media?.[0]?.Part?.[0]?.file;
                                                if (!file) continue;
                                                const musicRatingKey = String(item.ratingKey ?? item.key ?? file);

                                                console.log("Load more music item fields:", {
                                                    title: item.title,
                                                    grandparentTitle: item.grandparentTitle, // Artist
                                                    parentTitle: item.parentTitle, // Album
                                                    year: item.year,
                                                    genre: item.genre,
                                                    track: item.index, // Track number
                                                    disc: item.parentIndex, // Disc number
                                                });

                                                const m: MusicItem = {
                                                    type: "music",
                                                    ratingKey: musicRatingKey,
                                                    artist: String(item.grandparentTitle ?? "Unknown Artist"),
                                                    album: String(item.parentTitle ?? "Unknown Album"),
                                                    track: String(item.title ?? "Unknown Track"),
                                                    trackNumber: item.index ? Number(item.index) : undefined,
                                                    disc: item.parentIndex ? Number(item.parentIndex) : undefined,
                                                    file: String(file),
                                                    year: item.year ? Number(item.year) : undefined,
                                                    genre: String(item.genre ?? ""),
                                                    thumb: String(item.thumb ?? ""),
                                                };
                                                const tpl = settings.templates.music || template;
                                                const row = await computeMusicProposal(m, tpl, settings);
                                                row.metadata = m; // Store original metadata for popover
                                                more.push(row);
                                            }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
                                            console.warn("Load more music tracks failed", e);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                                >
                                    Load more tracks
                                </button>
                                <div className="group relative">
                                    <IconInfo className="h-4 w-4 text-neutral-400 hover:text-neutral-200 cursor-help" />
                                    <div className="invisible group-hover:visible absolute right-0 mt-2 w-48 rounded-md bg-neutral-800 p-2 text-xs text-neutral-200 shadow-lg z-20">
                                        {rows.length} tracks loaded
                                    </div>
                                </div>
                            </div>
                        )}

                        {library.type === "show" && currentShow && !episodesPaging.exhausted && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={async () => {
                                        const nextStart = rows.length;
                                        setLoading(true);
                                        try {
                                            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
                                            const epsResp = await invoke<any>("fetch_show_episodes", {
                                                server: server.address,
                                                showRatingKey: currentShow.ratingKey,
                                                token,
                                                start: nextStart,
                                                size: episodesPaging.size,
                                                });
                                                const md = epsResp?.MediaContainer?.Metadata ?? [];
                                            if (md.length === 0) {
                                                setEpisodesPaging(prev => ({ ...prev, exhausted: true }));
                                            }
                                            const more: PreviewRow[] = [];
                                                for (const item of md) {
                                                    const file = item?.Media?.[0]?.Part?.[0]?.file;
                                                    if (!file) continue;
                                                    const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                                                    const e: EpisodeItem = {
                                                        type: "episode",
                                                        ratingKey: String(item.ratingKey ?? item.key ?? file),
                                                        showTitle: currentShow.title,
                                                        title: String(item.title ?? "Episode"),
                                                        season: parsed.season,
                                                        index: parsed.index,
                                                        file: String(file),
                                                        year: item.year ? Number(item.year) : undefined,
                                                        grandparentTitle: String(item.grandparentTitle ?? currentShow.title),
                                                        parentTitle: String(item.parentTitle ?? ""),
                                                        parentIndex: item.parentIndex ? Number(item.parentIndex) : parsed.season,
                                                        thumb: String(item.thumb ?? ""),
                                                    };
                                                    const tpl = settings.templates.episode || template;
                                                    const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings);
                                                    row.metadata = e; // Store original metadata for popover
                                                    more.push(row);
                                                }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
                                            console.warn("Load more episodes failed", e);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                                >
                                    Load more episodes
                                </button>
                                <div className="group relative">
                                    <IconInfo className="h-4 w-4 text-neutral-400 hover:text-neutral-200 cursor-help" />
                                    <div className="invisible group-hover:visible absolute right-0 mt-2 w-48 rounded-md bg-neutral-800 p-2 text-xs text-neutral-200 shadow-lg z-20">
                                        {rows.length} episodes loaded
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search files..."
                                className="w-[300px] rounded-md border border-neutral-700 bg-neutral-900 pl-8 pr-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div>
                </div>


                {(loading || searching) && (
                    <p className="text-center text-neutral-400">
                        {debouncedSearchQuery.trim() || searching ? 'Searching…' : 'Loading preview…'}
                    </p>
                )}
                {error && <p className="text-center text-red-300">Error: {error}</p>}

                {!loading && !error && (
                    <div ref={containerRef} className="overflow-auto rounded-xl border border-neutral-800">
                        <div className="grid items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm font-semibold" style={{gridTemplateColumns: gridTemplate}}>
                            <div/>
                            <div className="relative select-none">
                                <span>Current</span>
                                <span onMouseDown={(e) => startResize("current", e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize"/>
                            </div>
                            <div className="relative select-none">
                                <span>Proposed</span>
                                <span onMouseDown={(e) => startResize("proposed", e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize"/>
                            </div>
                            <div></div>
                        </div>
                        {pageRows.map((r) => (
                            <>
                                <div key={r.id} className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40" style={{gridTemplateColumns: gridTemplate}}>
                                    <Toggle checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)}/>
                                    <div
                                        className="truncate cursor-pointer hover:bg-neutral-700/50 rounded px-1 py-0.5 transition-colors"
                                        title={r.filePath}
                                        onMouseEnter={(e) => handleMouseEnter(e, r)}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        {shortenFilePath(r.filePath, library.roots || [])}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="relative cursor-help"
                                            title={r.flags.length > 0 ? `Status: ${r.status} | Issues: ${r.flags.join(", ")}` : `Status: ${r.status}`}
                                        >
                                            {r.status === "good" && <IconStatusGood className="w-5 h-5" />}
                                            {r.status === "warning" && <IconStatusWarning className="w-5 h-5" />}
                                            {r.status === "error" && <IconStatusError className="w-5 h-5" />}
                                            {r.status === "unmatched" && <IconQuestionCircle className="w-5 h-5 text-gray-400" />}
                                        </div>
                                        <div className="truncate" title={r.proposed}>{r.proposed}</div>
                                    </div>
                                    <div></div>
                                </div>
                                {/* Subtitle operations */}
                                {r.subtitleOperations && r.subtitleOperations.length > 0 && (
                                    <div className="ml-7 border-l-2 border-neutral-700 pl-3">
                                        {r.subtitleOperations.map((subOp, idx) => (
                                            <div key={idx} className="grid items-center gap-2 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800/20" style={{gridTemplateColumns: gridTemplate}}>
                                                <div className="text-xs">📝</div>
                                                <div className="truncate text-xs" title={subOp.originalPath}>
                                                    {subOp.originalPath.split('/').pop()}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="relative cursor-help">
                                                        {subOp.warningFlags.length > 0 && <span className="text-amber-300">⚠️</span>}
                                                        <span className="text-cyan-400">→</span>
                                                    </div>
                                                    <div className="truncate text-xs" title={subOp.proposedPath}>
                                                        {subOp.proposedPath.split('/').pop()}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-neutral-500">
                                                    {subOp.operationType}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ))}
                        {displayRows.length === 0 && <p className="px-3 py-2 text-neutral-400">No items to preview.</p>}
                    </div>
                )}

                {/* Library folder mapping helper - show the actual mapped local folder */}
                <div className="mt-3 flex items-center justify-between text-sm text-neutral-300">
                    <div>
                        <span className="text-neutral-400">Local folder:</span>{" "}
                        <span className="text-neutral-200">{libraryFolder ?? "Not mapped"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowMapModal(true)}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                        >
                            Map Paths
                        </button>
                    </div>
                </div>

                {rows.length > pageSize && (
                    <div className="mt-3 flex items-center justify-between text-sm text-neutral-300">
                        <div className="flex items-center gap-2">
                            <span>Rows per page</span>
                            <div className="inline-block">
                                <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
                                        className="appearance-none px-2 py-1 text-sm bg-neutral-900/70 border border-neutral-700/70 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-cyan-600/40 hover:bg-neutral-800/70 pr-7">
                                    {[10, 25, 50, 100].map(n => <option key={n} value={n} className="bg-neutral-900 text-neutral-200">{n}</option>)}
                                </select>
                                <span className="pointer-events-none -ml-6 text-neutral-400">▾</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>{filteredRows.length} results • Page {page} / {totalPages}</span>
                            <button className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-50" disabled={page <= 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}>Prev
                            </button>
                            <button className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-50" disabled={page >= totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next
                            </button>
                        </div>
                    </div>
                )}
            </section>
            {showMapModal && (
                <PathMappingModal
                    serverId={server.machineIdentifier || server.address}
                    plexRoots={library.roots || []}
                    onClose={() => setShowMapModal(false)}
                    onSaved={refreshPathMappings}
                />
            )}
            {showTemplateHelp && (
                <TemplateHelpModal
                    libraryType={library.type as "movie" | "show" | "artist"}
                    onClose={() => setShowTemplateHelp(false)}
                />
            )}

            {/* Plex metadata popover */}
            <PlexPopoverCard
                metadata={popoverData.metadata as any}
                isVisible={!!popoverData.metadata}
                position={popoverData.position}
                plexServerUrl={server.address}
            />
        </main>
    );
}
