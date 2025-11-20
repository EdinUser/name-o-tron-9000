import { VIDEO_EXTS, EDITION_PRIORITY } from "./constants";
import type { MovieItem, PreviewRow } from "./types";
import {
    basename,
    extname,
    formatCollectionFolderName,
    getHighestPriorityEdition,
    hasNonLatin,
    isItemMapped,
    normalizeUnicode,
    resolvePlexFilePath,
    safeFolderName,
    sanitizeProposal,
    sortEditionsByPriority,
} from "./utils";
import { extractImdbId, extractTvdbId, extractTmdbId, mapEditionTokenToTitle, detectEditionFromPathWithPriority, renderTemplate } from "../../utils/template";

// Helper function to get sorting title (ignoring articles if configured)
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

function getOrganizedPath(title: string, folderStructure: string, settings: any, year?: number, genre?: string): string {
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
function applyChronologicalPrefix(path: string, year?: number, chronologicalPrefix: string = "year"): string {
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

export async function computeMovieProposal(
    m: MovieItem,
    template: string,
    ownFolderPerMovie: boolean,
    collectionsEnabled: boolean,
    collectionName: string,
    settings: any,
    libraryFolder: string | null,
    libraryRoots: string[]
): Promise<PreviewRow> {
    const ext = extname(m.file) || ".mkv";

    // Check for manual fix first
    const manualFix = settings.manualFixes?.find((fix: any) => fix.ratingKey === m.ratingKey);
    if (manualFix && manualFix.mediaType === "movie") {
        // Apply manual overrides
        if (manualFix.overrides.title) m.title = manualFix.overrides.title;
        if (manualFix.overrides.year) m.year = manualFix.overrides.year;
        if (manualFix.overrides.edition) m.edition = manualFix.overrides.edition;
        if (manualFix.overrides.editionTitle) m.editionTitle = manualFix.overrides.editionTitle;
    }

    // Get edition from Plex API or detect from file path
    let editionToken: string | undefined = m.edition || undefined;
    let editionTitle: string | undefined = m.editionTitle || undefined;

    // Detect from path (folders/filename) when enabled
    if (settings.movies.editions.createFromFilenames) {
        const detected = detectEditionFromPathWithPriority(m.file, settings.movies.editions.parsers);
        if (detected) {
            editionToken = detected.token || editionToken;
            editionTitle = detected.title || editionTitle;
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
                let highestPriority = 0;

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

    let proposed = "";
    try {
        proposed = renderTemplate(template, ctx);
    } catch (error) {
        console.error("Error rendering movie template:", error);
        proposed = `${m.title}${ext}`;
    }

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
        const desiredPath = getOrganizedPath(m.title, folderStructure, settings, m.year, m.genre);

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
                const prefixedPath = applyChronologicalPrefix(desiredPath, m.year, chronologicalPrefix);
                proposed = `${prefixedPath}/${proposed}`;
            } else if (ownFolderPerMovie && !proposed.includes('/')) {
                const folderName = safeFolderName(m.title);
                proposed = `${folderName}/${proposed}`;
            }
        } else { // intelligent (default)
            // Make intelligent decisions based on existing vs desired structure
            const existingStructure = detectExistingFolderStructure(currentFolders);

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
                const prefixedPath = applyChronologicalPrefix(desiredPath, m.year, chronologicalPrefix);
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
            proposed = applyChronologicalPrefix(proposed, m.year, chronologicalPrefix);
        }
    }

    proposed = normalizeUnicode(proposed);

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

    // Check if item is mapped (not in a mapped folder)
    if (!isItemMapped(m.file, libraryRoots)) {
        status = "unmatched";
        flags.push("unmapped");
    }

    return {
        id: m.ratingKey,
        kind: "movie",
        filePath: resolvePlexFilePath(m.file, libraryFolder),
        plexPath: m.plexPath || m.file, // Original Plex path
        proposed,
        status,
        flags
    };
}
