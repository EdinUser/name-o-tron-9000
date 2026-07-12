import {EDITION_PRIORITY, VIDEO_EXTS} from "./constants";
import type {MovieItem, PreviewRow} from "./types";
import {
    basename,
    computeAlphaRangeFolder,
    extname,
    formatCollectionFolderName,
    getHighestPriorityEdition,
    getRelativePathUnderRoots,
    getSortingTitle,
    hasNonLatin,
    isItemMapped,
    normalizePathForComparison,
    normalizeUnicode,
    resolvePlexFilePath,
    safeFolderName,
    sanitizeProposal,
    stripDeprecatedExtTokenFromTemplate,
    finalizeRenderedStem,
    sortEditionsByPriority,
    splitPathSegments,
} from "./utils";
import {
    buildPlexIdTokens,
    detectEditionFromPathWithPriority,
    extractImdbId,
    extractTmdbId,
    extractTvdbId,
    formatPlexIdToken,
    mapEditionTokenToTitle,
    renderTemplate,
} from "../../utils/template";

// Helper function to detect existing folder structure patterns
export function detectExistingFolderStructure(folders: string[]): {
    type: 'none' | 'alpha' | 'alpha_ranges' | 'year_decade' | 'genre' | 'custom';
    pattern?: string;
    confidence: number;
} {
    if (folders.length === 0) return {type: 'none', confidence: 1.0};

    const topFolder = folders[0].toLowerCase();

    // Check for alphabetical patterns
    if (/^[a-z]$/.test(topFolder)) {
        return {type: 'alpha', pattern: topFolder, confidence: 0.9};
    }

    // Check for alphabet ranges
    if (/^[a-z]-[a-z]$/.test(topFolder) || /^(a-d|e-h|i-l|m-p|q-t|u-z)$/.test(topFolder)) {
        return {type: 'alpha_ranges', pattern: topFolder, confidence: 0.9};
    }

    // Check for year/decade patterns
    if (/^\d{4}s$/.test(topFolder)) {
        return {type: 'year_decade', pattern: topFolder, confidence: 0.8};
    }

    // Check for common genre patterns (heuristic)
    const genrePatterns = ['action', 'adventure', 'comedy', 'drama', 'horror', 'sci-fi', 'thriller', 'documentary'];
    if (genrePatterns.some(g => topFolder.includes(g) || topFolder === g)) {
        return {type: 'genre', pattern: topFolder, confidence: 0.7};
    }

    // Check for chronological prefixes in folder names
    if (/^\d{4}\s*-\s*.+/.test(folders[folders.length - 1] || '')) {
        return {type: 'custom', pattern: 'chronological', confidence: 0.6};
    }

    return {type: 'custom', confidence: 0.3};
}

export function getOrganizedPath(title: string, folderStructure: string, settings: any, year?: number, genre?: string): string {
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
export function applyChronologicalPrefix(path: string, year?: number, chronologicalPrefix: string = "year"): string {
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

type MovieLibraryHeuristics = {
    flatRatio: number;
    flatThreshold: number;
};

function safeJoinPath(segments: string[]): string {
    return segments.filter(Boolean).join("/").replace(/\/+/g, "/");
}

function shouldAddMovieFolderInsideSharedFolder(settings: any): boolean {
    return (settings.movies?.ownFolderWithinSharedFolder || "add_movie_folder") === "add_movie_folder";
}

function isDedicatedMovieLeafFolder(currentDirs: string[], movie: MovieItem): boolean {
    if (currentDirs.length === 0) return false;
    const leafDir = currentDirs[currentDirs.length - 1] || "";
    const titleFolder = safeFolderName(movie.title).toLowerCase();
    const fileStemFolder = safeFolderName(basename(movie.file).slice(0, Math.max(0, basename(movie.file).length - extname(movie.file).length))).toLowerCase();
    const normalizedLeaf = safeFolderName(leafDir).toLowerCase();
    return normalizedLeaf === titleFolder || normalizedLeaf === fileStemFolder;
}

function getMovieFolderSegments(
    m: MovieItem,
    settings: any,
    collectionName: string,
    libraryRoots: string[],
    heuristics?: MovieLibraryHeuristics,
    templateRelativeDirs?: string[],
): { segments: string[]; decision: "preserved" | "reorganized" | "template"; currentRel: string | null } {
    const currentRel = getRelativePathUnderRoots(m.file, libraryRoots);
    const currentDirs = currentRel ? splitPathSegments(currentRel).slice(0, -1) : [];

    const behavior: string = settings.movies?.folderStructureBehavior || "intelligent";
    const mode: string = settings.movies?.folderStructure || "none";
    const ownFolderPerMovie: boolean = !!settings.movies?.ownFolderPerMovie;
    const addMovieFolderInsideSharedFolder = shouldAddMovieFolderInsideSharedFolder(settings);
    const effectiveCollectionName = String(collectionName || m.collection || "").trim();
    const collectionsEnabled: boolean = !!settings.movies?.collections?.enabled && effectiveCollectionName.length > 0;
    const hasDedicatedLeafFolder = isDedicatedMovieLeafFolder(currentDirs, m);

    const shouldConsiderReorg =
        behavior === "reorganize_all" ||
        (behavior === "intelligent" && (heuristics?.flatRatio ?? 0) >= (heuristics?.flatThreshold ?? 0.8));

    const currentDirCount = currentDirs.length;
    const isFlatItem = currentDirCount === 0 || (ownFolderPerMovie && currentDirCount === 1);

    if (collectionsEnabled) {
        const segments = [formatCollectionFolderName(effectiveCollectionName, settings)];
        if (ownFolderPerMovie) {
            segments.push(safeFolderName(m.title));
        }
        return { segments, decision: "reorganized", currentRel };
    }

    if (behavior === "preserve_existing" || (behavior === "intelligent" && !shouldConsiderReorg)) {
        if (currentDirs.length > 0) {
            if (ownFolderPerMovie && addMovieFolderInsideSharedFolder && !hasDedicatedLeafFolder) {
                return { segments: [...currentDirs, safeFolderName(m.title)], decision: "preserved", currentRel };
            }
            return { segments: currentDirs, decision: "preserved", currentRel };
        }
        if (ownFolderPerMovie) {
            return { segments: [safeFolderName(m.title)], decision: "preserved", currentRel };
        }
        if (templateRelativeDirs?.length) {
            return { segments: templateRelativeDirs.map(safeFolderName), decision: "template", currentRel };
        }
        return { segments: [], decision: "preserved", currentRel };
    }

    if (behavior === "intelligent" && !isFlatItem) {
        if (ownFolderPerMovie && addMovieFolderInsideSharedFolder && currentDirs.length > 0 && !hasDedicatedLeafFolder) {
            return { segments: [...currentDirs, safeFolderName(m.title)], decision: "preserved", currentRel };
        }
        return { segments: currentDirs, decision: "preserved", currentRel };
    }

    const segments: string[] = [];

    if (mode === "alpha") {
        const sortingTitle = getSortingTitle(m.title, settings.movies?.alphaArticleHandling || "ignore");
        const firstLetter = sortingTitle.charAt(0).toUpperCase();
        const alphaFolder = firstLetter >= "A" && firstLetter <= "Z" ? firstLetter : "Other";
        segments.push(alphaFolder);
    } else if (mode === "alpha_ranges") {
        segments.push(computeAlphaRangeFolder(m.title, settings.movies?.alphaArticleHandling || "ignore"));
    } else if (mode === "genre") {
        const rawGenre = String(m.genre || "").split(/[,/]/).map((s) => s.trim()).filter(Boolean)[0] || "Unknown Genre";
        segments.push(safeFolderName(rawGenre));
    } else if (mode === "year_decade") {
        if (m.year) {
            const decade = Math.floor(m.year / 10) * 10;
            segments.push(`${decade}s`);
        } else {
            segments.push("Unknown Year");
        }
    }

    if (ownFolderPerMovie) {
        segments.push(safeFolderName(m.title));
    }

    return { segments, decision: "reorganized", currentRel };
}

export async function computeMovieProposal(
    m: MovieItem,
    template: string,
    ownFolderPerMovie: boolean,
    collectionsEnabled: boolean,
    collectionName: string,
    settings: any,
    libraryFolder: string | null,
    libraryRoots: string[],
    heuristics?: MovieLibraryHeuristics,
): Promise<PreviewRow> {

    const ext = extname(m.file) || ".mkv";

    const effectiveCollectionName = String(collectionName || m.collection || "").trim();

    // Mark unused parameters as intentionally unused (backwards compatibility)
    void ownFolderPerMovie;
    void collectionsEnabled;

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
        processedIds = buildPlexIdTokens({ imdb: imdbId, tvdb: thetvdbId, tmdb: tmdbId });
    } else if (settings.movies.ids === "auto_append_all") {
        // Auto-append all available IDs
        processedIds = buildPlexIdTokens({ imdb: imdbId, tvdb: thetvdbId, tmdb: tmdbId });
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
        collection: effectiveCollectionName,
        // ID fields
        imdb: imdbId ?? "",
        imdbToken: formatPlexIdToken("imdb", imdbId),
        tvdb: thetvdbId ?? "",
        thetvdb: thetvdbId ?? "",
        tvdbToken: formatPlexIdToken("tvdb", thetvdbId),
        tmdb: tmdbId ?? "",
        tmdbToken: formatPlexIdToken("tmdb", tmdbId),
        ids: processedIds,
        plexIds: processedIds,
    } as any;

    let proposed = "";
    try {
        proposed = renderTemplate(stripDeprecatedExtTokenFromTemplate(template), ctx);
    } catch (error) {
        console.error("Error rendering movie template:", error);
        proposed = m.title;
    }

    const templateSegments = splitPathSegments(proposed);
    const templateFileName = templateSegments[templateSegments.length - 1] || proposed;
    const templateDirs = templateSegments.slice(0, -1);

    proposed = finalizeRenderedStem(templateFileName);

    // If user selected an edition mode and the template did not include any edition
    // placeholders, enforce insertion before the extension (only if edition should be included).
    if (editionDisplay && settings.movies.editions.mode !== "none") {
        const lower = proposed.toLowerCase();
        const hasEditionAlready = lower.includes("{edition-") ||
            (editionTitle ? lower.includes(editionTitle.toLowerCase()) : false) ||
            lower.includes(editionToken?.toLowerCase() || "");
        if (!hasEditionAlready) {
            let injection = editionDisplay.startsWith(" - ") ? editionDisplay : ` ${editionDisplay}`;
            proposed = finalizeRenderedStem(`${proposed}${injection}`);
        }
    }

    proposed = `${proposed}${ext}`;

    const { segments: folderSegments, currentRel } = getMovieFolderSegments(
        m,
        settings,
        effectiveCollectionName,
        libraryRoots,
        heuristics,
        templateDirs,
    );
    if (folderSegments.length) {
        proposed = safeJoinPath([...folderSegments, proposed]);
    } else if (templateDirs.length && (settings.movies?.folderStructureBehavior === "preserve_existing" || settings.movies?.folderStructure === "none")) {
        proposed = safeJoinPath([...templateDirs.map(safeFolderName), proposed]);
    }

    proposed = applyChronologicalPrefix(proposed, m.year, settings.movies?.chronologicalPrefix || "none");

    proposed = normalizeUnicode(proposed);

    const flags: string[] = [];
    if (effectiveCollectionName && settings.movies?.collections?.enabled) {
        flags.push(`collection:${effectiveCollectionName}`);
    }

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

    // Compliance check: if current relative path matches proposed, treat as no-op
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
        kind: "movie",
        filePath: resolvePlexFilePath(m.file, libraryFolder),
        plexPath: m.plexPath || m.file, // Original Plex path
        proposed,
        status,
        flags
    };
}
