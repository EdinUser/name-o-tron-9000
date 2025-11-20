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
export async function sanitizeProposal(name: string, _settings: any): Promise<{ ok: boolean; reason?: string; sanitized?: string }> {
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const sanitized = await invoke<string>("sanitize_filename_cmd", {
            filename: name,
            settings: _settings.misc.characterReplacement
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
        // Fallback to basic validation if backend fails
        if (/[\\/:*?"<>|]/.test(name)) return {ok: false, reason: "invalid-chars"};
        const base = name.replace(/\.[^.]+$/, "");
        if (RESERVED.has(base.toUpperCase())) return {ok: false, reason: "reserved-name"};
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
