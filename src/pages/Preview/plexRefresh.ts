import type { PreviewRow } from "./types";

export type RefreshPathMapping = {
    server_id: string;
    plex_root: string;
    local_root: string;
    platform?: string | null;
};

export type RefreshOperation = {
    operation_type: string;
    original_path: string;
    new_path: string;
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
}

function hostOnly(id: string): string {
    const withoutScheme = id.includes("://") ? id.split("://")[1] : id;
    return withoutScheme.split(":")[0];
}

function serverIdsMatch(mappingId: string, serverId: string): boolean {
    return mappingId === serverId || hostOnly(mappingId) === hostOnly(serverId);
}

export function dirnamePlexPath(path: string): string {
    const normalized = normalizePath(path);
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) return normalized;
    return normalized.slice(0, lastSlash);
}

export function collectAutomaticRefreshTargets(libraryType: string, renamedRows: PreviewRow[]): string[] {
    if (libraryType === "movie") {
        return Array.from(
            new Set(
                renamedRows
                    .filter((row) => row.kind === "movie")
                    .map((row) => dirnamePlexPath(row.plexPath || row.filePath))
                    .filter(Boolean),
            ),
        );
    }

    if (libraryType === "show") {
        const episodeRows = renamedRows.filter((row) => row.kind === "episode");
        const useShowFolders = episodeRows.length > 2;

        return Array.from(
            new Set(
                episodeRows
                    .map((row) => {
                        const episodeDir = dirnamePlexPath(row.plexPath || row.filePath);
                        return useShowFolders ? dirnamePlexPath(episodeDir) : episodeDir;
                    })
                    .filter(Boolean),
            ),
        );
    }

    return [];
}

export function localPathToPlexPath(
    localPath: string,
    mappings: RefreshPathMapping[],
    serverId: string,
): string | null {
    const normalizedLocalPath = normalizePath(localPath);
    let bestMapping: RefreshPathMapping | null = null;
    let bestLength = -1;

    for (const mapping of mappings) {
        if (!serverIdsMatch(mapping.server_id, serverId)) continue;

        const normalizedLocalRoot = normalizePath(mapping.local_root);
        if (
            normalizedLocalPath !== normalizedLocalRoot &&
            !normalizedLocalPath.startsWith(`${normalizedLocalRoot}/`)
        ) {
            continue;
        }

        if (normalizedLocalRoot.length > bestLength) {
            bestLength = normalizedLocalRoot.length;
            bestMapping = mapping;
        }
    }

    if (!bestMapping) return null;

    const normalizedLocalRoot = normalizePath(bestMapping.local_root);
    const normalizedPlexRoot = normalizePath(bestMapping.plex_root);
    const suffix = normalizedLocalPath.slice(normalizedLocalRoot.length).replace(/^\/+/, "");

    return suffix ? `${normalizedPlexRoot}/${suffix}` : normalizedPlexRoot;
}

export function collectUndoRefreshTargets(
    libraryType: string,
    operations: RefreshOperation[],
    mappings: RefreshPathMapping[],
    serverId: string,
): string[] {
    const renameOperations = operations.filter(
        (operation) => operation.operation_type === "rename" || operation.operation_type === "move",
    );

    if (libraryType === "movie") {
        return Array.from(
            new Set(
                renameOperations
                    .map((operation) => localPathToPlexPath(operation.original_path, mappings, serverId))
                    .filter((path): path is string => Boolean(path))
                    .map((path) => dirnamePlexPath(path)),
            ),
        );
    }

    if (libraryType === "show") {
        const episodePaths = renameOperations
            .map((operation) => localPathToPlexPath(operation.original_path, mappings, serverId))
            .filter((path): path is string => Boolean(path))
            .map((path) => dirnamePlexPath(path));

        const useShowFolders = episodePaths.length > 2;

        return Array.from(
            new Set(
                episodePaths
                    .map((path) => (useShowFolders ? dirnamePlexPath(path) : path))
                    .filter(Boolean),
            ),
        );
    }

    return [];
}
