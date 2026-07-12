import { RESERVED, EDITION_PRIORITY } from "./constants";

// File extension utility
export function extname(p: string) {
    const m = p.match(/\.[^.\\/]+$/);
    return m ? m[0] : "";
}

// @ts-ignore
export function basename(p: string) {
    const m = p.match(/[^\\/]+$/);
    return m ? m[0] : p;
}

function normalizeSlashes(p: string): string {
    return p.replace(/\\/g, '/');
}

function isLikelyWindowsPath(p: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\');
}

export function normalizePathForComparison(p: string): string {
    const withForwardSlashes = normalizeSlashes(p).replace(/\/+/g, '/');
    return isLikelyWindowsPath(p) ? withForwardSlashes.toLowerCase() : withForwardSlashes;
}

export function splitPathSegments(p: string): string[] {
    return normalizeSlashes(p).split('/').filter(Boolean);
}

export function getRelativePathUnderRoots(filePath: string, libraryRoots: string[]): string | null {
    const shortened = shortenFilePath(filePath, libraryRoots);
    if (!shortened || shortened === filePath) return null;
    return normalizeSlashes(shortened);
}

// Edition priority utilities
export function getHighestPriorityEdition(editionToken: string): string {
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

export function sortEditionsByPriority(editionToken: string): string {
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

// Path sanitization utilities
export async function sanitizeProposal(
    name: string,
    _settings: any,
): Promise<{ ok: boolean; reason?: string; sanitized?: string }> {
    try {
        const reservedNamesCheck = _settings?.general?.safety?.reservedNamesCheck ?? true;

        const { invoke } = await import("@tauri-apps/api/core");
        const sanitized = await invoke<string>("sanitize_filename_cmd", {
            filename: name,
            settings: _settings.misc.characterReplacement
        });

        // Check if the sanitized name still contains invalid characters
        if (/[\\/:*?"<>|]/.test(sanitized)) {
            return {ok: false, reason: "invalid-chars", sanitized};
        }

        // Check for reserved names (after sanitization) when enabled
        if (reservedNamesCheck) {
            const base = sanitized.replace(/\.[^.]+$/, "");
            if (RESERVED.has(base.toUpperCase())) {
                return { ok: false, reason: "reserved-name", sanitized };
            }
        }

        return {ok: true, sanitized};
    } catch (error) {
        const reservedNamesCheck = _settings?.general?.safety?.reservedNamesCheck ?? true;

        // Fallback to basic validation if backend fails
        if (/[\\/:*?"<>|]/.test(name)) return {ok: false, reason: "invalid-chars"};
        if (reservedNamesCheck) {
            const base = name.replace(/\.[^.]+$/, "");
            if (RESERVED.has(base.toUpperCase())) {
                return { ok: false, reason: "reserved-name" };
            }
        }
        return {ok: true, sanitized: name};
    }
}

export function normalizeUnicode(name: string) {
    try {
        return name.normalize("NFC");
    } catch {
        return name;
    }
}

export function hasNonLatin(name: string) {
    // Anything outside basic ASCII range
    return /[^\u0000-\u007F]/.test(name);
}

export function safeFolderName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, "_");
}

export function stripDeprecatedExtTokenFromTemplate(template: string) {
    return String(template || "").replace(/\{ext\}/g, "");
}

export function finalizeRenderedStem(stem: string) {
    return String(stem || "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Apply collection naming style from settings
export function formatCollectionFolderName(rawName: string, settings: any): string {
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

export function normalizeShowTitle(raw: string) {
    return raw.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

export function getSortingTitle(title: string, alphaArticleHandling: string): string {
    if (alphaArticleHandling === "ignore") {
        const articles = /^(the|a|an)\s+/i;
        return title.replace(articles, "");
    }
    return title;
}

export function computeAlphaRangeFolder(title: string, alphaArticleHandling: string): string {
    const sortingTitle = getSortingTitle(title, alphaArticleHandling).trim();
    const firstLetter = sortingTitle.charAt(0).toUpperCase();
    if (!(firstLetter >= "A" && firstLetter <= "Z")) return "Other";
    if (firstLetter >= "A" && firstLetter <= "D") return "A-D";
    if (firstLetter >= "E" && firstLetter <= "H") return "E-H";
    if (firstLetter >= "I" && firstLetter <= "L") return "I-L";
    if (firstLetter >= "M" && firstLetter <= "P") return "M-P";
    if (firstLetter >= "Q" && firstLetter <= "T") return "Q-T";
    return "U-Z";
}

// Function to resolve relative Plex paths to absolute local paths
export function resolvePlexFilePath(relativePath: string, libraryFolder: string | null): string {
    if (!libraryFolder) return relativePath;

    // If it's already an absolute path, return as-is
    if (relativePath.startsWith('/') || relativePath.match(/^[A-Za-z]:/)) {
        return relativePath;
    }

    // Remove any leading slashes or backslashes from relative path
    const cleanRelativePath = relativePath.replace(/^[/\\]+/, '');

    // Combine library folder with relative path
    return `${libraryFolder}/${cleanRelativePath}`.replace(/\\/g, '/');
}

export function shortenFilePath(filePath: string, libraryRoots: string[]): string {
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

export function getItemRootFolder(filePath: string, libraryRoots: string[]): string | null {
    if (!libraryRoots.length) return null;

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

    return bestMatch || null;
}

export function isItemMapped(filePath: string, libraryRoots: string[]): boolean {
    const itemRoot = getItemRootFolder(filePath, libraryRoots);
    return itemRoot !== null;
}

export function parseEpisodeInfo(filePath: string, fallbackTitle: string): { showTitle: string; season?: number; index?: number } {
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
