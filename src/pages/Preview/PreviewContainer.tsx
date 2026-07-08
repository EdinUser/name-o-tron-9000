import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
    addTemplateFavoriteEntry,
    addTemplateHistoryEntry,
    getTemplateFavoriteEntries,
    getTemplateHistoryEntries,
    removeTemplateFavoriteEntry,
    useSettings
} from "../../state/settings";
import {useTheme} from "../../state/theme";
import type {Props, MovieItem, EpisodeItem, MusicItem, PreviewRow, SectionResponse} from "./types";
import {computeMovieProposal} from "./movieProposal";
import {computeEpisodeProposal, computeMultiEpisodeProposal} from "./episodeProposal";
import {computeMusicProposal} from "./musicProposal";
import {
    parseEpisodeInfo,
    resolvePlexFilePath,
    shortenFilePath
} from "./utils";
import { generateServerId } from "../../utils/cache";
import PreviewTemplate from "./PreviewTemplate";
import { attachSubtitleOperations } from "./subtitleMapping";

// Functions are now imported from separate modules


// Plex refresh functionality temporarily disabled
// TODO: Re-enable with improved approach that doesn't trigger full library scans
// The backend infrastructure remains available for future implementation
export default function PreviewContainer({server, library, onBack}: Props) {
    const { settings, updateSettings, settingsVersion } = useSettings();
    const { resolvedTheme, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<PreviewRow[]>([]);
    const rowsRef = useRef<PreviewRow[]>([]);
    const rawItemsRef = useRef<Array<MovieItem | EpisodeItem | MusicItem>>([]);
    const reloadTriggeredRef = useRef(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const getDefaultPageSize = useCallback(() => {
        if (library.type === "show") {
            return Math.max(1, settings.general.pagination.defaultShowLimit || 20);
        }
        return Math.max(1, settings.general.pagination.defaultMovieLimit || 20);
    }, [library.type, settings.general.pagination.defaultMovieLimit, settings.general.pagination.defaultShowLimit]);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => getDefaultPageSize());
    const [moviesPaging, setMoviesPaging] = useState(() => ({ start: 0, size: getDefaultPageSize(), total: null as number | null, exhausted: false }));

    // Update pagination when user changes page size
    useEffect(() => {
        setMoviesPaging({
            start: 0,
            size: pageSize, // single-page fetch when page size changes
            total: null,
            exhausted: false
        });
        setPage(1);
    }, [pageSize]);
    useEffect(() => {
        const nextDefaultPageSize = getDefaultPageSize();
        setPageSize((current) => (current === nextDefaultPageSize ? current : nextDefaultPageSize));
    }, [getDefaultPageSize]);
    const [episodesPaging, setEpisodesPaging] = useState({ start: 0, size: 50, total: null as number | null, exhausted: false });
    const seasonLoadRequestIdRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [colWidths, setColWidths] = useState<{ current: number; proposed: number; flags: number }>({ current: 480, proposed: 480, flags: 0 });
    // Template is computed from current settings
    const template = library.type === "movie" ? settings.templates.movie :
                     library.type === "show" ? settings.templates.episode :
                     settings.templates.music;
    const serverId = generateServerId(server);
    const [libraryFolder, setLibraryFolder] = useState<string | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [showTemplateHelp, setShowTemplateHelp] = useState(false);
    const [showTemplateHistory, setShowTemplateHistory] = useState(false);
    const [editingItem, setEditingItem] = useState<PreviewRow | null>(null);
    const [renameResultModal, setRenameResultModal] = useState<{
        success: boolean;
        operations_applied: number;
        operations_failed: number;
        rollback_log_path: string;
        errors: string[];
    } | null>(null);
    const [undoResultModal, setUndoResultModal] = useState<{
        success: boolean;
        operations_applied: number;
        operations_failed: number;
        rollback_log_path: string;
        errors: string[];
    } | null>(null);
    const [previewExportModal, setPreviewExportModal] = useState<{
        success: boolean;
        path?: string;
        error?: string;
    } | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("all"); // "all", "good", "warning", "error", "unmatched"
    const [currentShow, setCurrentShow] = useState<{ ratingKey: string; title: string } | null>(null);
    const [remoteResults, setRemoteResults] = useState<PreviewRow[]>([]);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
    const [remoteQuery, setRemoteQuery] = useState<string>("");
    const [searching, setSearching] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const initialMoviePrefetch = useRef(false);
    const moviePrefetching = useRef(false);
    const prefetchedSecondPageRef = useRef(false);
    const processedCountRef = useRef(0);
    const lastSettingsVersionRef = useRef(settingsVersion);

    const MOVIE_INTELLIGENT_FLAT_THRESHOLD = 0.8;

    function computeMovieLibraryHeuristics(paths: string[]): { flatRatio: number; flatThreshold: number } {
        const roots = library.roots || [];
        if (!paths.length || !roots.length) {
            return { flatRatio: 1, flatThreshold: MOVIE_INTELLIGENT_FLAT_THRESHOLD };
        }

        const ownFolderPerMovie = !!settings.movies?.ownFolderPerMovie;
        let total = 0;
        let flat = 0;

        for (const p of paths) {
            if (!p) continue;
            const rel = shortenFilePath(p, roots);
            if (!rel || rel === p) continue;
            total += 1;
            const normalized = rel.replace(/\\/g, '/');
            const dirCount = Math.max(0, normalized.split('/').length - 1);
            const isFlatItem = dirCount === 0 || (ownFolderPerMovie && dirCount === 1);
            if (isFlatItem) flat += 1;
        }

        const flatRatio = total > 0 ? flat / total : 1;
        return { flatRatio, flatThreshold: MOVIE_INTELLIGENT_FLAT_THRESHOLD };
    }

    function extractCollectionName(item: any): string {
        const collections = item?.Collection || item?.collection || [];
        if (!Array.isArray(collections) || collections.length === 0) return "";
        return String(collections[0]?.tag || collections[0] || "").trim();
    }

    function buildMovieItem(item: any, file: string): MovieItem {
        return {
            type: "movie",
            ratingKey: String(item.ratingKey ?? item.key ?? file),
            title: String(item.title ?? "Unknown"),
            year: item.year ? Number(item.year) : undefined,
            file: String(file),
            plexPath: String(file),
            edition: String(item.edition ?? item.editionTitle ?? ""),
            genre: String(item.Genre?.[0]?.tag ?? item.genre ?? ""),
            rating: String(item.contentRating ?? ""),
            studio: String(item.studio ?? ""),
            director: String(item.Director?.[0]?.tag ?? item.director ?? ""),
            writer: String(item.writer ?? ""),
            country: String(item.country ?? ""),
            tagline: String(item.tagline ?? ""),
            summary: String(item.summary ?? ""),
            collection: extractCollectionName(item),
            guid: String(item.guid ?? ""),
            thumb: String(item.thumb ?? ""),
        };
    }

    function getMetadataSearchTexts(metadata?: MovieItem | EpisodeItem | MusicItem | null): string[] {
        if (!metadata) return [];
        if (metadata.type === "movie") {
            return [metadata.title, metadata.collection || "", metadata.genre || "", metadata.director || "", metadata.studio || ""];
        }
        if (metadata.type === "episode") {
            return [metadata.title, metadata.showTitle, metadata.grandparentTitle || "", metadata.parentTitle || ""];
        }
        return [metadata.track, metadata.artist, metadata.album, metadata.genre || ""];
    }

    function getRawItemKey(item: MovieItem | EpisodeItem | MusicItem): string {
        return `${item.type}:${item.ratingKey || item.file}`;
    }

    function mergeUniqueRawItems(
        existing: Array<MovieItem | EpisodeItem | MusicItem>,
        incoming: Array<MovieItem | EpisodeItem | MusicItem>,
    ): Array<MovieItem | EpisodeItem | MusicItem> {
        const seen = new Set(existing.map(getRawItemKey));
        const merged = [...existing];
        for (const item of incoming) {
            const key = getRawItemKey(item);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
        }
        return merged;
    }

    function mergeUniqueRows(existing: PreviewRow[], incoming: PreviewRow[]): PreviewRow[] {
        const seen = new Set(existing.map((row) => row.id));
        const merged = [...existing];
        for (const row of incoming) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
        }
        return merged;
    }

    // Apply / cleanup state
    const [applyInProgress, setApplyInProgress] = useState(false);
    const [applyOperationCount, setApplyOperationCount] = useState(0);
    const [lastApplySummary, setLastApplySummary] = useState<{
        operationsApplied: number;
        operationsFailed: number;
        rollbackLogPath: string;
        operations: {
            operation_type: string;
            original_path: string;
            new_path: string;
            backup_path: string | null;
            operation_id: string;
        }[];
    } | null>(null);
    const [cleanupInProgress, setCleanupInProgress] = useState(false);
    const [cleanupResult, setCleanupResult] = useState<{
        removed_directories: string[];
        errors: string[];
    } | null>(null);

    function clearApplySummary() {
        setLastApplySummary(null);
        setCleanupResult(null);
    }

    // Season filtering for TV shows
    const [selectedSeason, setSelectedSeason] = useState<number | "all" | null>(null);
    const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
    const [seasonList, setSeasonList] = useState<Array<{index: number, title: string, leafCount: number, ratingKey: string, key: string}>>([]);

    const [reloadTick, setReloadTick] = useState(0);
    const lastMovieReloadTickRef = useRef(0);

    // Popover state for showing Plex metadata on hover
    const [popoverData, setPopoverData] = useState<{ metadata: MovieItem | EpisodeItem | MusicItem | null; position: { x: number; y: number } }>({
        metadata: null,
        position: { x: 0, y: 0 }
    });

    // Popover hover handlers
    const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLDivElement>, row: PreviewRow) => {
        if (!row.metadata) return;

        const position = {
            x: event.clientX,
            y: event.clientY
        };

        setPopoverData({ metadata: row.metadata, position });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setPopoverData({ metadata: null, position: { x: 0, y: 0 } });
    }, []);

    // Keep a ref of rows for incremental updates
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    const templateHistoryEntries = useMemo(
        () => getTemplateHistoryEntries(settings, serverId, library.key),
        [settings, serverId, library.key],
    );
    const templateFavoriteEntries = useMemo(
        () => getTemplateFavoriteEntries(settings, serverId, library.key),
        [settings, serverId, library.key],
    );

    const commitTemplateHistory = useCallback((nextTemplate: string) => {
        const nextSettings = addTemplateHistoryEntry(settings, serverId, library.key, nextTemplate);
        if (nextSettings !== settings) {
            updateSettings(nextSettings);
        }
    }, [settings, updateSettings, serverId, library.key]);

    const saveTemplateFavorite = useCallback((nextTemplate: string) => {
        const nextSettings = addTemplateFavoriteEntry(settings, serverId, library.key, nextTemplate);
        if (nextSettings !== settings) {
            updateSettings(nextSettings);
        }
    }, [settings, updateSettings, serverId, library.key]);

    const deleteTemplateFavorite = useCallback((nextTemplate: string) => {
        const nextSettings = removeTemplateFavoriteEntry(settings, serverId, library.key, nextTemplate);
        if (nextSettings !== settings) {
            updateSettings(nextSettings);
        }
    }, [settings, updateSettings, serverId, library.key]);

    const applyTemplateValue = useCallback((nextTemplate: string) => {
        const templateKey = library.type === "movie" ? "movie" :
            library.type === "show" ? "episode" : "music";
        updateSettings({
            ...settings,
            templates: {
                ...settings.templates,
                [templateKey]: nextTemplate,
            },
        } as any);
    }, [library.type, settings, updateSettings]);

    // Load path mappings and determine the library folder for shortening paths
    useEffect(() => {
        async function loadPathMappings() {
            try {
                const settings = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
                const mappings = settings.pathMappings || [];

                const normalizeRoot = (p: string | null | undefined) =>
                    (p || "")
                        .replace(/\\/g, "/")
                        .replace(/\/+$/, "") || "";

                // Find the mapped folder for this library
                const serverId = generateServerId(server);
                const libraryRoots = (library.roots || []).map(normalizeRoot);

                // Prefer the longest matching root in case of overlaps
                let bestLocal: string | null = null;
                let bestLen = 0;

                for (const root of libraryRoots) {
                    for (const m of mappings) {
                        if (m.server_id !== serverId) continue;
                        const mappedRoot = normalizeRoot(m.plex_root);
                        if (!mappedRoot || mappedRoot !== root) continue;
                        if (mappedRoot.length > bestLen) {
                            bestLen = mappedRoot.length;
                            bestLocal = m.local_root;
                        }
                    }
                }

                setLibraryFolder(bestLocal);
            } catch (error) {
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

            const normalizeRoot = (p: string | null | undefined) =>
                (p || "")
                    .replace(/\\/g, "/")
                    .replace(/\/+$/, "") || "";

            // Find the mapped folder for this library
            const serverId = generateServerId(server);
            const libraryRoots = (library.roots || []).map(normalizeRoot);

            let bestLocal: string | null = null;
            let bestLen = 0;

            for (const root of libraryRoots) {
                for (const m of mappings) {
                    if (m.server_id !== serverId) continue;
                    const mappedRoot = normalizeRoot(m.plex_root);
                    if (!mappedRoot || mappedRoot !== root) continue;
                    if (mappedRoot.length > bestLen) {
                        bestLen = mappedRoot.length;
                        bestLocal = m.local_root;
                    }
                }
            }

            setLibraryFolder(bestLocal);
        } catch (error) {
            setLibraryFolder(null);
        }
    }, [server.address, server.machineIdentifier, library.roots]);

    // Load raw data from Plex API (minimal dependencies)
    useEffect(() => {
        async function loadRawData() {
            setLoading(true);
            setError(null);
            try {
                let token: string | null = null;
                try { token = localStorage.getItem("plexToken"); } catch {}

                const rawItems: Array<MovieItem | EpisodeItem | MusicItem> = [];

                if (library.type === "movie") {
                    const isReload = reloadTick > lastMovieReloadTickRef.current;
                    if (isReload) {
                        lastMovieReloadTickRef.current = reloadTick;
                        initialMoviePrefetch.current = false;
                        moviePrefetching.current = false;
                        prefetchedSecondPageRef.current = false;
                        processedCountRef.current = 0;
                        rawItemsRef.current = [];
                        rowsRef.current = [];
                        setRows([]);
                        setSelectedIds(new Set());
                        setRemoteResults([]);
                        setRemoteQuery("");
                        setPage(1);
                    }

                    const fetchStart = isReload ? 0 : moviesPaging.start;
                    const fetchSize = isReload ? pageSize : (moviesPaging.size || pageSize);
                    // Fetch movie items using the existing command
                    const data = await invoke<SectionResponse>("fetch_library_content", {
                        server: server.address,
                        libraryKey: library.key,
                        token: token ?? null,
                        start: fetchStart,
                        size: fetchSize,
                    });
                    const mc = data?.MediaContainer;
                    const md = mc?.Metadata ?? [];
                    const total = Number(mc?.totalSize ?? mc?.total ?? 0) || null;
                    const returned = Number(mc?.size ?? md.length);
                    const offset = Number(mc?.offset ?? fetchStart ?? 0);
                    console.log("[Preview] Movie fetch", { pageSize, fetchSize, offset, returned, total });
                    if (md.length === 0) {
                        setMoviesPaging({
                            start: offset,
                            size: pageSize,
                            total,
                            exhausted: true
                        });
                    } else {
                        const done = total ? offset + returned >= total : md.length < fetchSize;
                        setMoviesPaging({
                            start: offset + returned,
                            size: pageSize,
                            total,
                            exhausted: done
                        });
                    }
                    for (const item of md) {
                        const file = item?.Media?.[0]?.Part?.[0]?.file;
                        if (!file) continue;
                        const m: MovieItem = buildMovieItem(item, String(file));
                        rawItems.push(m);
                    }

                    // If the initial movie fetch did not fill two pages, prefetch one more page immediately
                    const neededForTwoPages = pageSize * 2;
                    const have = rawItems.length;
                    const totalForFetch = mc?.totalSize ?? mc?.total ?? total ?? null;
                    if (!initialMoviePrefetch.current && !moviePrefetching.current && have < neededForTwoPages) {
                        const nextStart = offset + returned;
                        initialMoviePrefetch.current = true;
                        moviePrefetching.current = true;
                        (async () => {
                            try {
                                const moreData = await invoke<SectionResponse>("fetch_library_content", {
                                    server: server.address,
                                    libraryKey: library.key,
                                    token: token ?? null,
                                    start: nextStart,
                                    size: pageSize,
                                });
                                const mcMore = moreData?.MediaContainer;
                                const mdMore = mcMore?.Metadata ?? [];
                                const moreTotal = Number(mcMore?.totalSize ?? mcMore?.total ?? totalForFetch ?? 0) || null;
                                const moreReturned = Number(mcMore?.size ?? mdMore.length);
                                const moreOffset = Number(mcMore?.offset ?? nextStart);
                                const moreItems: MovieItem[] = [];
                                for (const item of mdMore) {
                                    const file = item?.Media?.[0]?.Part?.[0]?.file;
                                    if (!file) continue;
                                    const m: MovieItem = buildMovieItem(item, String(file));
                                    moreItems.push(m);
                                }
                                if (moreItems.length > 0) {
                                    setRawItems(prev => mergeUniqueRawItems(prev, moreItems));
                                    setMoviesPaging(prev => {
                                        const totalFinal = moreTotal ?? prev.total ?? null;
                                        const newStart = moreOffset + moreReturned;
                                        const exhausted = totalFinal ? newStart >= totalFinal : moreReturned < pageSize;
                                        return {
                                            ...prev,
                                            start: newStart,
                                            total: totalFinal,
                                            exhausted
                                        };
                                    });
                                }
                            } catch {
                                // ignore prefetch errors
                            } finally {
                                moviePrefetching.current = false;
                            }
                        })();
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

                        const m: MusicItem = {
                            type: "music",
                            ratingKey: musicRatingKey,
                            artist: String(item.grandparentTitle ?? "Unknown Artist"),
                            album: String(item.parentTitle ?? "Unknown Album"),
                            track: String(item.title ?? "Unknown Track"),
                            trackNumber: item.index ? Number(item.index) : undefined,
                            disc: item.parentIndex ? Number(item.parentIndex) : undefined,
                            file: String(file),
                            plexPath: String(file),
                            year: item.year ? Number(item.year) : undefined,
                            genre: String(item.Genre?.[0]?.tag ?? item.genre ?? ""),
                            thumb: String(item.thumb ?? ""),
                        };
                        rawItems.push(m);
                    }
                } else if (library.type === "show") {
                    // For TV shows, check if a specific show was selected or if we have current show state
                    const initialShow = (window as any).__initialShow;
                    const showToLoad = initialShow || currentShow;

                    if (showToLoad) {
                        if (initialShow) {
                            setCurrentShow(initialShow);
                        }

                        // First, load seasons for the show (fast, usually just a few seasons)
                        if (seasonList.length === 0) {
                            console.log("[Seasons Load] Loading seasons for show:", showToLoad.title, "ratingKey:", showToLoad.ratingKey);
                            const seasonsResp = await invoke<any>("fetch_show_seasons", {
                                server: server.address,
                                showRatingKey: showToLoad.ratingKey,
                                token,
                            });

                            console.log("[Seasons Load] Seasons response received");
                            const seasons = seasonsResp?.MediaContainer?.Metadata ?? [];
                            console.log("[Seasons Load] Seasons response:", JSON.stringify(seasonsResp, null, 2));
                            console.log("[Seasons Load] Found", seasons.length, "seasons in Plex for this show");

                            const seasonData = seasons.map((season: any) => {
                                console.log("[Seasons Load] Season:", season.title, "ratingKey:", season.ratingKey, "index:", season.index, "leafCount:", season.leafCount, "key:", season.key);
                                return {
                                    index: Number(season.index) || 0,
                                    title: String(season.title || `Season ${season.index}`),
                                    leafCount: Number(season.leafCount) || 0,
                                    ratingKey: String(season.ratingKey || season.key),
                                    key: String(season.key || `/library/metadata/${season.ratingKey}/children`),
                                };
                            }).sort((a: {index: number}, b: {index: number}) => a.index - b.index);

                            console.log("[Seasons Load] Processed seasonData:", seasonData);

                            setSeasonList(seasonData);
                            setAvailableSeasons(seasonData.map((s: {index: number}) => s.index));

                            console.log("[Seasons Load] Set seasonList with", seasonData.length, "seasons");

                            // If no seasons found in Plex, fall back to loading all episodes and creating virtual seasons
                            if (seasonData.length === 0) {
                                console.log("[Seasons Load] No seasons found in Plex, trying fallback approach");
                                try {
                                    // Load all episodes for the show using the old method
                                    const epsResp = await invoke<any>("fetch_show_episodes", {
                                        server: server.address,
                                        showRatingKey: showToLoad.ratingKey,
                                        token,
                                        start: 0,
                                        size: 200, // Load more to get all episodes
                                    });

                                    const md = epsResp?.MediaContainer?.Metadata ?? [];
                                    console.log("[Fallback] Found", md.length, "episodes in Plex for this show");

                                    if (md.length > 0) {
                                        // Create virtual seasons from episode data
                                        const seasonMap = new Map<number, any[]>();
                                        for (const item of md) {
                                            const file = item?.Media?.[0]?.Part?.[0]?.file;
                                            if (!file) continue;
                                            // Plex-first: prefer Plex season (parentIndex). Only fall back to filename parsing if missing.
                                            const plexSeason = Number(item.parentIndex);
                                            const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                                            const seasonNum = Number.isFinite(plexSeason) ? plexSeason : parsed.season;
                                            if (typeof seasonNum === "number" && !seasonMap.has(seasonNum)) {
                                                seasonMap.set(seasonNum, []);
                                            }
                                            if (typeof seasonNum === "number") {
                                                seasonMap.get(seasonNum)!.push(item);
                                            }
                                        }

                                        const virtualSeasons = Array.from(seasonMap.entries())
                                            .sort(([a], [b]) => a - b)
                                            .map(([seasonNum, episodes]) => ({
                                                index: seasonNum,
                                                title: `Season ${seasonNum}`,
                                                leafCount: episodes.length,
                                                ratingKey: showToLoad.ratingKey, // Use show key for virtual seasons
                                                key: `/library/metadata/${showToLoad.ratingKey}/children`, // Use show children key for virtual seasons
                                            }));

                                        console.log("[Fallback] Created virtual seasons:", virtualSeasons);

                                        setSeasonList(virtualSeasons);
                                        setAvailableSeasons(virtualSeasons.map((s: {index: number}) => s.index));

                                        // Auto-select the first available season
                                        if (virtualSeasons.length > 0) {
                                            console.log("[Fallback] Auto-selecting first available season:", virtualSeasons[0].index);
                                            setSelectedSeason(virtualSeasons[0].index);
                                        }
                                    } else {
                                        console.log("[Fallback] No episodes found in Plex for this show");
                                        setSeasonList([]);
                                        setAvailableSeasons([]);
                                    }
                                } catch (fallbackError) {
                                    console.error("[Fallback] Error loading episodes:", fallbackError);
                                    setSeasonList([]);
                                    setAvailableSeasons([]);
                                }
                            } else {
                                // Auto-select the first season (prefer season 1 over season 0/specials)
                                if (!selectedSeason) {
                                    // Find the lowest season number > 0, or fall back to the first season
                                    const firstNonZeroSeason = seasonData.find((s: {index: number, title: string, leafCount: number, ratingKey: string, key: string}) => s.index > 0);
                                    const seasonToSelect = firstNonZeroSeason || seasonData[0];
                                    console.log("[Initial Load] Auto-selecting season:", seasonToSelect.index);
                                    setSelectedSeason(seasonToSelect.index);
                                }
                            }
                        }

                        // Episodes are loaded by the dedicated season-change effect below.

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

                // Store raw items for later proposal computation
                (window as any).__rawItems = rawItems;
                setRawItems(rawItems);
            } catch (e: any) {
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        }

        loadRawData();
    }, [server.address, library.key, library.type, reloadTick, currentShow?.ratingKey, pageSize]);

    // For TV shows, Reload should *not* clear the season selector. It should force a refetch
    // of episodes for the currently selected season and clear the preview table state.
    useEffect(() => {
        if (library.type !== "show") return;

        console.log("[TV Reload] Starting TV reload - clearing state");

        // Cancel any in-flight season loads so older responses can't overwrite the reloaded state
        seasonLoadRequestIdRef.current += 1;
        console.log("[TV Reload] Incremented requestId to:", seasonLoadRequestIdRef.current);

        // Keep seasonList + selectedSeason so the dropdown stays visible.
        setEpisodesPaging(prev => ({ ...prev, start: 0, total: null, exhausted: false }));

        processedCountRef.current = 0;
        setRawItems([]);
        setRows([]);
        setSelectedIds(new Set());
        setPage(1);

        // Immediately clear the ref too so the season effect sees the cleared state
        rawItemsRef.current = [];
        reloadTriggeredRef.current = true;

        console.log("[TV Reload] State cleared - rawItems/rows reset, page=1, selectedSeason:", selectedSeason, "seasonList count:", seasonList.length, "rawItemsRef.current.length:", rawItemsRef.current.length);
    }, [reloadTick, library.type]);

    // Handle season changes - reload episodes when user selects different season
    useEffect(() => {
        console.log("[Season Change] Effect running - library.type:", library.type, "currentShow:", !!currentShow, "seasonList.length:", seasonList.length);
        if (library.type !== "show" || !currentShow || seasonList.length === 0) {
            console.log("[Season Change] Skipping - preconditions not met");
            return;
        }

        const loadEpisodesForSeason = async () => {
            const targetSeason = selectedSeason === "all" ? null : selectedSeason;
            if (targetSeason === null) return; // Handle "all seasons" case later if needed

            const seasonData = seasonList.find(s => s.index === targetSeason);
            if (!seasonData) {
                console.log("[Season Load] No season data found for season:", targetSeason);
                return;
            }

            // Mark this request as the latest; used to ignore stale/out-of-order responses.
            const requestId = ++seasonLoadRequestIdRef.current;

            console.log("[Season Load] Loading episodes for season:", targetSeason, "using key:", seasonData.key, "requestId:", requestId);

            // Reset paging + UI state immediately to avoid mixing seasons and to keep pagination sane.
            processedCountRef.current = 0;
            setRows([]);
            setSelectedIds(new Set());
            setRawItems([]);
            setEpisodesPaging(prev => ({ ...prev, start: 0, total: null, exhausted: false }));
            setPage(1);

            setLoading(true);
            setPageLoading(true);

            try {
                // Check if this is a virtual season (key === show key + /children)
                // If so, we already have all episodes loaded, just filter them
                const showChildrenKey = `/library/metadata/${currentShow.ratingKey}/children`;
                if (seasonData.key === showChildrenKey && rawItemsRef.current.length > 0) {
                    console.log("[Season Load] Using virtual season - filtering existing episodes");
                    const filteredEpisodes = rawItemsRef.current.filter(item =>
                        item.type === "episode" && (item as EpisodeItem).season === targetSeason
                    );
                    console.log("[Season Load] Found", filteredEpisodes.length, "episodes for season", targetSeason);
                    setRawItems(filteredEpisodes);

                    setEpisodesPaging(prev => ({
                        ...prev,
                        total: filteredEpisodes.length,
                        exhausted: true,
                        start: filteredEpisodes.length,
                        size: prev.size
                    }));
                } else {
                    // Real season with its own key - make API call using the season's key directly
                    const token = localStorage.getItem("plexToken") || undefined;

                    console.log("[Season Load] Calling fetch_plex_metadata with:", {
                        server: server.address,
                        plexKey: seasonData.key,
                        token: token ? "present" : "null",
                        start: 0,
                        size: episodesPaging.size
                    });

                    const epsResp = await invoke<any>("fetch_plex_metadata", {
                        server: server.address,
                        plexKey: seasonData.key,
                        token,
                        start: 0,
                        size: 50, // Use fixed size instead of state variable
                    });

                    // Ignore out-of-order responses (user switched seasons quickly)
                    if (seasonLoadRequestIdRef.current !== requestId) {
                        console.log("[Season Load] Ignoring stale response for requestId:", requestId);
                        return;
                    }

                    console.log("[Season Load] Response received:", JSON.stringify(epsResp, null, 2));

                    const md = epsResp?.MediaContainer?.Metadata ?? [];
                    console.log("[Season Load] Found", md.length, "episodes in response");
                    console.log("[Season Load] MediaContainer exists:", !!epsResp?.MediaContainer);
                    console.log("[Season Load] Metadata exists:", !!epsResp?.MediaContainer?.Metadata);

                    const total = Number(epsResp?.MediaContainer?.totalSize ?? epsResp?.MediaContainer?.total ?? seasonData.leafCount) || null;
                    const returned = Number(epsResp?.MediaContainer?.size ?? md.length);

                    console.log("[Season Load] total:", total, "returned:", returned, "exhausted:", total ? returned >= total : md.length < episodesPaging.size);

                    setEpisodesPaging(prev => ({
                        ...prev,
                        total,
                        exhausted: total ? returned >= total : md.length < prev.size,
                        start: returned,
                        size: prev.size
                    }));

                    const newEpisodes: EpisodeItem[] = [];
                    for (const item of md) {
                        const file = item?.Media?.[0]?.Part?.[0]?.file;
                        if (!file) {
                            console.log("[Season Load] Skipping episode without file:", item.title);
                            continue;
                        }
                        // Plex-first: prefer Plex season/episode numbers; fall back to filename parsing only if missing.
                        const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                        const plexSeason = Number(item.parentIndex);
                        const plexEpisode = Number(item.index);
                        const e: EpisodeItem = {
                            type: "episode",
                            ratingKey: String(item.ratingKey ?? item.key ?? file),
                            showTitle: String(item.grandparentTitle ?? currentShow.title),
                            title: String(item.title ?? "Episode"),
                            season: Number.isFinite(plexSeason) ? plexSeason : parsed.season,
                            index: Number.isFinite(plexEpisode) ? plexEpisode : parsed.index,
                            file: String(file),
                            plexPath: String(file),
                            year: item.year ? Number(item.year) : undefined,
                            grandparentTitle: String(item.grandparentTitle ?? currentShow.title),
                            parentTitle: String(item.parentTitle ?? ""),
                            parentIndex: Number.isFinite(plexSeason) ? plexSeason : (item.parentIndex ? Number(item.parentIndex) : parsed.season),
                            thumb: String(item.thumb ?? ""),
                        };
                        newEpisodes.push(e);
                    }

                    console.log("[Season Load] Created", newEpisodes.length, "episode items");
                    setRawItems(newEpisodes);
                }
            } catch (error) {
                console.error("[Season Load] Failed to load episodes for season:", error);
                setError(`Failed to load episodes: ${error}`);
            } finally {
                // Only clear loading state if this is still the latest request
                if (seasonLoadRequestIdRef.current === requestId) {
                    setLoading(false);
                    setPageLoading(false);
                }
            }
        };

        // Check if we already have episodes loaded for this season
        const hasEpisodesForSeason = rawItemsRef.current.some(item => item.type === "episode" && (item as EpisodeItem).season === selectedSeason);
        const isFirstSeason = selectedSeason === seasonList[0]?.index;

        console.log("[Season Change] selectedSeason:", selectedSeason, "firstSeason:", seasonList[0]?.index, "hasEpisodes:", hasEpisodesForSeason, "rawItems count:", rawItemsRef.current.length, "isFirstSeason:", isFirstSeason);

        // Always reload episodes on Reload click (reloadTick), even if we previously had episodes for this season.
        // Ensures Reload (which clears rawItems) triggers a refetch.
        const shouldForceReload = rawItemsRef.current.length === 0;
        const wasReloadTriggered = reloadTriggeredRef.current;

        console.log("[Season Change] Checking if should load - selectedSeason:", selectedSeason, "shouldForceReload:", shouldForceReload, "hasEpisodes:", hasEpisodesForSeason, "isFirstSeason:", isFirstSeason, "rawItemsRef.current.length:", rawItemsRef.current.length, "wasReloadTriggered:", wasReloadTriggered);

        if (wasReloadTriggered) {
            // Reset the flag since we're handling the reload
            reloadTriggeredRef.current = false;
        }

        if (
            selectedSeason !== null &&
            selectedSeason !== undefined &&
            (
                wasReloadTriggered || // Force reload if reload was triggered
                shouldForceReload ||
                !hasEpisodesForSeason ||
                (isFirstSeason && rawItemsRef.current.length === 0)
            )
        ) {
            console.log("[Season Change] Loading episodes for season:", selectedSeason);
            loadEpisodesForSeason();
        } else {
            console.log("[Season Change] Skipping load - conditions not met");
        }
    }, [selectedSeason, seasonList, currentShow, library.type, server.address, episodesPaging.size, reloadTick]);

    // State for raw items
    const [rawItems, setRawItems] = useState<Array<MovieItem | EpisodeItem | MusicItem>>([]);

    // Keep a ref of raw items for async season loaders (prevents stale closures / racey reads)
    useEffect(() => {
        rawItemsRef.current = rawItems;
    }, [rawItems]);

    // Helper function to fetch poster images
    const fetchPoster = useCallback(async (thumb: string, ratingKey: string): Promise<string | null> => {
        if (!thumb) return null;

        try {
            let token: string | null = null;
            try { token = localStorage.getItem("plexToken"); } catch {}

            const result = await invoke<string>("fetch_plex_image", {
                serverUrl: server.address,
                imagePath: thumb.startsWith('/') ? thumb : `/library/metadata/${ratingKey}/thumb/${thumb}`,
                token: token || ""
            });

            if (typeof result === "string" && result.startsWith("data:image/jpeg;base64,")) {
                return result;
            }
        } catch (error) {
            console.warn("Failed to fetch poster:", error);
        }
        return null;
    }, [server.address]);

    const enrichRowsWithPosters = useCallback(async (inputRows: PreviewRow[]): Promise<PreviewRow[]> => {
        const isBlocksView = settings.general.viewMode[library.type === "movie" ? "movies" : "tv"] === "blocks";
        if (!isBlocksView || inputRows.length === 0) {
            return inputRows;
        }

        try {
            await Promise.all(inputRows.map(async (row) => {
                if (!row.metadata?.thumb || row.metadata.cachedPosterUrl) {
                    return;
                }

                const posterUrl = await fetchPoster(row.metadata.thumb, row.id);
                if (posterUrl) {
                    row.metadata.cachedPosterUrl = posterUrl;
                }
            }));
        } catch (posterError) {
            console.warn("Failed to fetch some posters:", posterError);
        }

        return inputRows;
    }, [fetchPoster, library.type, settings.general.viewMode]);

    // Compute proposals from raw items when settings or inputs change
    useEffect(() => {
        async function computeProposals() {
            if (rawItems.length === 0) {
                setRows([]);
                setSelectedIds(new Set());
                setPreviewLoading(false);
                processedCountRef.current = 0;
                return;
            }

            // Detect settings changes that require full recompute
            const settingsChanged = lastSettingsVersionRef.current !== settingsVersion;
            if (settingsChanged) {
                lastSettingsVersionRef.current = settingsVersion;
                processedCountRef.current = 0;
            }

            // Decide whether to recompute everything or only new items
            const startIndex =
                settingsChanged || rawItems.length <= processedCountRef.current
                    ? 0
                    : processedCountRef.current;
            const isFullRecompute = startIndex === 0;
            const itemsToProcess = rawItems.slice(startIndex);

            // Nothing new to process in incremental mode
            if (!isFullRecompute && itemsToProcess.length === 0) {
                setPreviewLoading(false);
                return;
            }

            setPreviewLoading(true);

            // Separate episodes from other items for multi-episode handling
            const episodes = itemsToProcess.filter(item => item.type === "episode") as EpisodeItem[];
            const nonEpisodes = itemsToProcess.filter(item => item.type !== "episode");

            // Group episodes by file path for multi-episode detection
            const episodesByFile: { [filePath: string]: EpisodeItem[] } = {};
            for (const episode of episodes) {
                const resolvedPath = resolvePlexFilePath(episode.file, libraryFolder);
                if (!episodesByFile[resolvedPath]) {
                    episodesByFile[resolvedPath] = [];
                }
                episodesByFile[resolvedPath].push(episode);
            }

            const movieHeuristics = computeMovieLibraryHeuristics(
                rawItems.filter((it) => it.type === "movie").map((it) => (it as MovieItem).file),
            );

            const tasks = [
                // Process non-episode items
                ...nonEpisodes.map(async (item) => {
                    if (item.type === "movie") {
                        const m = item as MovieItem;
                        const tpl = settings.templates.movie || template;
                        const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, m.collection || "", settings, libraryFolder, library.roots || [], movieHeuristics);
                        row.metadata = m;
                        return row;
                    }
                    if (item.type === "music") {
                        const m = item as MusicItem;
                        const tpl = settings.templates.music || template;
                        const row = await computeMusicProposal(m, tpl, settings, libraryFolder, library.roots || []);
                        row.metadata = m;
                        return row;
                    }
                    return null;
                }),
                // Process episodes grouped by file
                ...Object.entries(episodesByFile).map(async ([filePath, fileEpisodes]) => {
                    try {
                        const tpl = settings.templates.episode || template;
                        const useSeasonFolders = !!settings.tv.seasonFolders;

                        if (!fileEpisodes || fileEpisodes.length === 0) {
                            console.error("Empty fileEpisodes for path:", filePath);
                            return null;
                        }

                        if (fileEpisodes.length === 1) {
                            // Single episode
                            const e = fileEpisodes[0];
                            if (!e) {
                                console.error("Undefined episode in fileEpisodes");
                                return null;
                            }
                            const proposal = await computeEpisodeProposal(e, tpl, useSeasonFolders, settings, libraryFolder, library.roots || []);
                            proposal.metadata = e;
                            return proposal;
                        } else {
                            // Multi-episode file
                            const proposal = await computeMultiEpisodeProposal(fileEpisodes, tpl, useSeasonFolders, settings, libraryFolder, library.roots || []);
                            proposal.metadata = fileEpisodes[0];
                            return proposal;
                        }
                    } catch (error) {
                        console.error("Error processing episodes for file:", filePath, error);
                        return null;
                    }
                })
            ];

            const newRows = (await Promise.all(tasks)).filter(Boolean) as PreviewRow[];

            // Process subtitle operations for the new rows only
            try {
                const filePaths = newRows.map(row => row.filePath);
                if (filePaths.length > 0) {
                    const previewResult = await invoke<any>("preview_video_renames", {
                        request: {
                            library_id: library.key,
                            scope: filePaths,
                            settings: settings,
                            server_id: generateServerId(server),
                        }
                    });

                    attachSubtitleOperations(newRows, previewResult);
                }
            } catch (subtitleError) {
                // Continue without subtitle operations
            }

            await enrichRowsWithPosters(newRows);

            if (isFullRecompute) {
                // Replace rows on full recompute
                setRows(newRows);
                setSelectedIds(new Set());
            } else {
                // Append rows incrementally
                const combined = mergeUniqueRows(rowsRef.current, newRows);
                setRows(combined);
            }

            processedCountRef.current = rawItems.length;

            // Seasons are now loaded from API, no need to extract from episodes
        
            setPreviewLoading(false);
        }

        computeProposals();
    }, [rawItems, settingsVersion,
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
        settings.templates.music,
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
        settings.general.safety.permissionsCheck,
        template
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
        let results = rows;

        // Apply search filter if query exists
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase();
            const libraryRoots = library.roots || [];
            results = results.filter(r => {
                const currentPath = shortenFilePath(r.filePath, libraryRoots).toLowerCase();
                const proposedName = r.proposed.toLowerCase();
                const fullPath = r.filePath.toLowerCase();
                const metadataMatches = getMetadataSearchTexts(r.metadata).some(text => text.toLowerCase().includes(query));
                return currentPath.includes(query) || proposedName.includes(query) || fullPath.includes(query) || metadataMatches;
            });
        }

        // Apply status filter if not "all"
        if (statusFilter !== "all") {
            results = results.filter(r => r.status === statusFilter);
        }

        // Apply season filter for TV shows
        if (library.type === "show" && selectedSeason !== "all") {
            const targetSeason = selectedSeason === null ? 1 : selectedSeason;
            results = results.filter(r => {
                if (r.kind !== "episode") return true;
                const episode = r.metadata as EpisodeItem;
                return episode?.season === targetSeason;
            });
        }

        return results;
    }, [rows, debouncedSearchQuery, statusFilter, library.roots, library.type, selectedSeason]);

    // Trigger remote (API) search for all queries
    useEffect(() => {
        const q = debouncedSearchQuery.trim();
        if (!q) {
            setRemoteResults([]);
            setRemoteQuery("");
            setSearching(false);
            return;
        }
        let isCancelled = false;
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

                // Filter hubs to only include those from the current library section
                // Note: Plex API may return results from all libraries despite sectionId parameter
                // We need additional filtering here to ensure only current library results are shown

                for (const hub of hubs) {
                    // Check if this hub belongs to our current library section
                    // The hub might contain section information that we can use for filtering
                    const hubSectionId = hub.sectionId || hub.librarySectionID;
                    // Filter hubs to only include those from the current library section
                    // If hub has section info and it doesn't match our section, skip it
                    if (hubSectionId && hubSectionId != sectionNum) {
                        continue;
                    }

                    const items = hub.Directory || hub.Metadata || [];
                    if (!Array.isArray(items)) continue;
                    for (const item of items) {
                        let detailedItem = item;
                        let filePath = "";
                        try { filePath = String(item?.Media?.[0]?.Part?.[0]?.file || ""); } catch {}

                        if (!filePath && (item?.key || item?.ratingKey)) {
                            try {
                                const plexKey = String(item.key || `/library/metadata/${item.ratingKey}`);
                                const detailedResp = await invoke<any>("fetch_plex_metadata", {
                                    server: server.address,
                                    plexKey,
                                    token,
                                    start: 0,
                                    size: 1,
                                });
                                detailedItem = detailedResp?.MediaContainer?.Metadata?.[0] || detailedResp?.MediaContainer?.Directory?.[0] || item;
                                filePath = String(detailedItem?.Media?.[0]?.Part?.[0]?.file || "");
                            } catch {
                                detailedItem = item;
                            }
                        }

                        // Skip items that don't have actual file paths (API endpoints, metadata, etc.)
                        if (!filePath || filePath.startsWith('/library/') || filePath.includes('?') || !filePath.includes('.')) {
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
                                continue;
                            }
                        }

                        if (library.type === "movie") {
                            // Ensure we have a valid file path before proceeding
                            if (!filePath || filePath.length === 0) {
                                continue;
                            }
                            const m: MovieItem = buildMovieItem(detailedItem, filePath);
                            const tpl = settings.templates.movie || template;
                            const movieHeuristics = computeMovieLibraryHeuristics(
                                rawItemsRef.current
                                    .filter((it) => it.type === "movie")
                                    .map((it) => (it as MovieItem).file)
                                    .concat([filePath]),
                            );
                            const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, m.collection || "", settings, libraryFolder, library.roots || [], movieHeuristics);
                            row.metadata = m; // Store original metadata for popover
                            row.flags.push("remote-search");
                            newRows.push(row);
                        } else {
                            // TV episode
                            // Ensure we have a valid file path before proceeding
                            if (!filePath || filePath.length === 0) {
                                continue;
                            }

                            const showTitle = String(item.grandparentTitle || item.parentTitle || item.title || "Unknown Show");
                            const seasonNum = typeof item.parentIndex === "number" ? item.parentIndex : (item.parentIndex ? Number(item.parentIndex) : undefined);
                            const epIndex = typeof item.index === "number" ? item.index : (item.index ? Number(item.index) : undefined);
                            const e: EpisodeItem = {
                                type: "episode",
                                ratingKey: String(detailedItem.ratingKey || item.ratingKey || item.key || filePath || Math.random()),
                                showTitle,
                                title: String(detailedItem.title || item.title || "Episode"),
                                season: seasonNum,
                                index: epIndex,
                                file: filePath,
                                plexPath: filePath,
                                year: detailedItem.year ? Number(detailedItem.year) : (item.year ? Number(item.year) : undefined),
                                grandparentTitle: String(detailedItem.grandparentTitle ?? item.grandparentTitle ?? showTitle),
                                parentTitle: String(detailedItem.parentTitle ?? item.parentTitle ?? ""),
                                parentIndex: detailedItem.parentIndex ? Number(detailedItem.parentIndex) : (item.parentIndex ? Number(item.parentIndex) : seasonNum),
                                thumb: String(detailedItem.thumb ?? item.thumb ?? ""),
                            };
                            const tpl = settings.templates.episode || template;
                            const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings, libraryFolder, library.roots || []);
                            row.metadata = e; // Store original metadata for popover
                            row.flags.push("remote-search");
                            newRows.push(row);
                        }
                    }
                }
                setRemoteResults(newRows);
                setRemoteQuery(q);
            } catch (e) {
                setRemoteResults([]);
                setRemoteQuery(q);
            } finally {
                if (!isCancelled) setSearching(false);
            }
        })();
        return () => { isCancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        debouncedSearchQuery,
        library.key,
        library.type,
        server.address,
        libraryFolder,
        settingsVersion,
        template,
    ]);

    // Final rows to display - combine local and remote results
    const displayRows = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return filteredRows;

        const combined: PreviewRow[] = [];
        const seen = new Set<string>();

        for (const row of filteredRows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            combined.push(row);
        }

        if (remoteQuery === debouncedSearchQuery) {
            for (const row of remoteResults) {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
                combined.push(row);
            }
        }

        return combined;
    }, [filteredRows, remoteResults, debouncedSearchQuery, remoteQuery]);

    const anyRedSelected = useMemo(() => displayRows.some(r => r.status === "error" && selectedIds.has(r.id)), [displayRows, selectedIds]);
    const totalItemsForPaging = useMemo(() => {
        if (debouncedSearchQuery.trim()) {
            return displayRows.length;
        }
        if (library.type === "movie" && moviesPaging.total) {
            return moviesPaging.total;
        }
        if (library.type === "show") {
            if (episodesPaging.exhausted) {
                return displayRows.length;
            }
            if (episodesPaging.total) {
                return Math.max(episodesPaging.total, displayRows.length);
            }
        }
        return displayRows.length;
    }, [debouncedSearchQuery, library.type, moviesPaging.total, episodesPaging.total, episodesPaging.exhausted, displayRows.length]);
    const totalPages = Math.max(1, Math.ceil(totalItemsForPaging / pageSize));
    const pageRows = useMemo(() => displayRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [displayRows, page, pageSize]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

    // One-time background prefetch of the second page for movies after the first page is ready
    useEffect(() => {
        if (library.type !== "movie") return;
        if (prefetchedSecondPageRef.current) return;
        if (moviesPaging.exhausted) return;
        // We need at least one full page of rows before prefetching the next
        if (rows.length < pageSize) return;
        // Avoid overlapping with an explicit load or initial loading
        if (loading || pageLoading) return;

        prefetchedSecondPageRef.current = true;
        loadMoreMovies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [library.type, rows.length, pageSize, moviesPaging.exhausted, loading, pageLoading]);

    const pageTransitionLoading = useMemo(() => {
        // Only blank later pages if we still do not have rows for that page.
        if (page <= 1) return false;
        const need = page * pageSize;
        const hasRowsForRequestedPage = pageRows.length > 0;
        if (hasRowsForRequestedPage) return false;
        return pageLoading || loading || previewLoading || rows.length < need;
    }, [page, pageSize, pageLoading, loading, previewLoading, rows.length, pageRows.length]);

    // Auto-load more movies when navigating to a page that requires more items than we have loaded
    useEffect(() => {
        if (library.type !== "movie") return;
        if (page <= 1) return;
        const needed = page * pageSize;
        // If we already fetched two pages in the initial request, do not refetch when going to page 2
        if (page === 2 && rows.length >= pageSize * 2) return;
        if (!moviesPaging.exhausted && rows.length < needed && !loading) {
            setPageLoading(true);
            loadMoreMovies().finally(() => setPageLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, rows.length, moviesPaging.exhausted, library.type, loading]);

    useEffect(() => {
        if (library.type !== "show") return;
        if (page <= 1) return;
        const needed = page * pageSize;
        if (!episodesPaging.exhausted && rows.length < needed && !loading && !pageLoading && !previewLoading) {
            setPageLoading(true);
            loadMoreEpisodes().finally(() => setPageLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, rows.length, episodesPaging.exhausted, library.type, loading, pageLoading, previewLoading]);

    const pageAllSelected = useMemo(
        () => pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id)),
        [pageRows, selectedIds]
    );

    function toggle(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function skipReds() {
        // Prefer current filtered view so behaviour matches what user sees
        setSelectedIds(new Set(filteredRows.filter(r => r.status !== "error").map(r => r.id)));
    }

    function togglePageSelection() {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = pageRows.length > 0 && pageRows.every(r => next.has(r.id));

            if (allSelected) {
                pageRows.forEach(r => next.delete(r.id));
            } else {
                pageRows.forEach(r => next.add(r.id));
            }

            return next;
        });
    }

    async function applyRename() {
        // Extra guard – button is already disabled when anyRedSelected
        if (anyRedSelected) {
            alert("Cannot proceed while any selected items are red. Use “Skip Reds” or fix blocking issues first.");
            return;
        }

        console.log("[Preview] Proceed clicked", {
            totalRows: rows.length,
            visibleRows: displayRows.length,
            selectedIds: Array.from(selectedIds),
        });

        setLoading(true);
        try {
            // Collect all operations (video + subtitle)
            const operations: {
                operation_type: string;
                original_path: string;
                new_path: string;
                backup_path: string | null;
                operation_id: string;
            }[] = [];

            // Only operate on the current filtered set (season/search/status)
            for (const row of pageRows) {
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

            if (operations.length === 0) {
                alert("No items are selected to rename. Toggle at least one row on this page and try again.");
                return;
            }

            setApplyInProgress(true);
            setApplyOperationCount(operations.length);

            const result = await invoke<any>("apply_video_renames", {
                request: {
                    operations,
                    server_id: generateServerId(server),
                    _settings: settings,
                }
            });

            setLastApplySummary({
                operationsApplied: result.operations_applied,
                operationsFailed: result.operations_failed,
                rollbackLogPath: result.rollback_log_path,
                operations,
            });

            // Refresh Plex metadata after successful renames
            // TEMPORARILY DISABLED: Path-based refresh triggers unwanted full library scans
            // TODO: Re-enable once we have a better approach that doesn't cause full scans
            if (result.success && result.operations_applied > 0) {
                console.log("[Preview] Plex refresh temporarily disabled to avoid triggering full library scans");
                console.log("[Preview] Rename operations completed successfully - files may appear as 'Unavailable' in Plex until manual refresh");

                // Future: Re-enable with improved approach
                // console.log("[Preview] Waiting 2 seconds before Plex refresh to ensure filesystem operations are committed...");
                // await new Promise(resolve => setTimeout(resolve, 2000));
                // try {
                //     await refreshPlexMetadataAfterRenames(operations, server, library);
                // } catch (refreshError) {
                //     console.warn("[Preview] Failed to refresh Plex metadata:", refreshError);
                //     if (String(refreshError).includes("401") || String(refreshError).includes("Unauthorized")) {
                //         console.warn("[Preview] Plex refresh failed due to authentication. Please log in to Plex first.");
                //         alert("⚠️ Plex Refresh Failed\n\nThe rename operation succeeded, but Plex couldn't be updated because you're not logged in.\n\nPlease go back to the Home screen and authenticate with Plex first for automatic refreshes to work.");
                //     }
                // }
            }

            if (!result.success) {
                // Log detailed errors to console
                console.error("Failed to apply renames:", {
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors
                });

                setRenameResultModal({
                    success: result.success,
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors || []
                });
            }
        } catch (error) {
            console.error("Failed to apply renames:", error);
            setRenameResultModal({
                success: false,
                operations_applied: 0,
                operations_failed: 0,
                rollback_log_path: "",
                errors: [String(error)]
            });
        } finally {
            setLoading(false);
            setApplyInProgress(false);
        }
    }

    async function removeEmptyFolders() {
        if (!lastApplySummary) return;

        setCleanupInProgress(true);
        setCleanupResult(null);
        try {
            const originalPaths = lastApplySummary.operations
                .filter(op => op.operation_type === "rename")
                .map(op => op.original_path);

            if (originalPaths.length === 0) {
                setCleanupResult({
                    removed_directories: [],
                    errors: ["No rename operations available to derive directories from."],
                });
                return;
            }

            const result = await invoke<any>("cleanup_empty_folders", {
                request: {
                    server_id: generateServerId(server),
                    original_paths: originalPaths,
                }
            });

            setCleanupResult({
                removed_directories: result.removed_directories || [],
                errors: result.errors || [],
            });
        } catch (error) {
            console.error("Failed to remove empty folders:", error);
            setCleanupResult({
                removed_directories: [],
                errors: [String(error)],
            });
        } finally {
            setCleanupInProgress(false);
        }
    }

    async function undoLastRename() {
        setShowUndoConfirm(true);
    }

    async function handleUndoConfirm() {
        setShowUndoConfirm(false);
        setLoading(true);
        try {
            const result = await invoke<any>("undo_last_rename");

            if (result.success) {
                setUndoResultModal({
                    success: true,
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors || []
                });
                // Reload the page to reflect changes
                setReloadTick(t => t + 1);
            } else {
                // Log detailed errors to console
                console.error("Failed to undo renames:", {
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors
                });

                setUndoResultModal({
                    success: false,
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors || []
                });
            }
        } catch (error) {
            console.error("Failed to undo renames:", error);
            setUndoResultModal({
                success: false,
                operations_applied: 0,
                operations_failed: 0,
                rollback_log_path: "",
                errors: [String(error)]
            });
        } finally {
            setLoading(false);
        }
    }

    async function exportPreviewSnapshot() {
        try {
            const snapshot = {
                server: {
                    name: server.name,
                    address: server.address,
                },
                library: {
                    key: library.key,
                    title: library.title,
                    type: library.type,
                },
                currentShow,
                page,
                pageSize,
                statusFilter,
                searchQuery,
                selectedSeason,
                availableSeasons,
                settings: {
                    general: {
                        encoding: settings.general.encoding,
                        conflictHandling: settings.general.conflictHandling,
                        safety: settings.general.safety,
                    },
                    templates: settings.templates,
                    movies: settings.movies,
                    tv: settings.tv,
                    music: settings.music,
                    misc: settings.misc,
                },
                preview: {
                    total_rows: displayRows.length,
                    rows: displayRows.map((r) => ({
                        id: r.id,
                        kind: r.kind,
                        status: r.status,
                        flags: r.flags,
                        filePath: r.filePath,
                        proposed: r.proposed,
                        metadata: r.metadata
                            ? {
                                  type: (r.metadata as any).type,
                                  ratingKey: (r.metadata as any).ratingKey,
                                  title:
                                      (r.metadata as any).title ||
                                      (r.metadata as any).track ||
                                      undefined,
                                  showTitle: (r.metadata as any).showTitle,
                                  season: (r.metadata as any).season,
                                  index: (r.metadata as any).index,
                              }
                            : null,
                    })),
                },
            };

            const path = await invoke<string>("export_preview_snapshot", { snapshot });
            setPreviewExportModal({
                success: true,
                path: path
            });
        } catch (error) {
            setPreviewExportModal({
                success: false,
                error: String(error)
            });
        }
    }

    function handleUndoCancel() {
        setShowUndoConfirm(false);
    }

    // Column resizing + fluid width support (only in table view)
    useEffect(() => {
        const isTableView = settings.general.viewMode[library.type === "movie" ? "movies" : "tv"] === "table";
        if (!isTableView) return;

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
    }, [settings.general.viewMode, library.type]);

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

    // Load more functions
    const loadMoreMovies = useCallback(async () => {
        if (moviesPaging.exhausted) return;
        const nextStart = moviesPaging.start;
        const pageSizeLocal = pageSize;
        if (moviesPaging.total && nextStart >= moviesPaging.total) {
            setMoviesPaging(prev => ({ ...prev, exhausted: true }));
            return;
        }

        setLoading(true);
        setPageLoading(true);
        try {
            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
            const data = await invoke<SectionResponse>("fetch_library_content", {
                server: server.address,
                libraryKey: library.key,
                token,
                start: nextStart,
                size: pageSizeLocal,
            });
            const mc = data?.MediaContainer;
            const md = mc?.Metadata ?? [];
            const total = Number(mc?.totalSize ?? mc?.total ?? 0) || moviesPaging.total;
            const returned = Number(mc?.size ?? md.length);
            const offset = Number(mc?.offset ?? nextStart);
            console.log("[Preview] Load more movies", { pageSize: pageSizeLocal, offset, returned, total });
            if (md.length === 0) {
                setMoviesPaging(prev => ({ ...prev, total, exhausted: true }));
            } else {
                const done = total ? offset + returned >= total : md.length < pageSizeLocal;
                setMoviesPaging(prev => ({ ...prev, total, exhausted: done, start: offset + returned, size: pageSizeLocal }));
            }
            const more: PreviewRow[] = [];
            for (const item of md) {
                const file = item?.Media?.[0]?.Part?.[0]?.file;
                if (!file) continue;
                const m: MovieItem = buildMovieItem(item, resolvePlexFilePath(String(file), libraryFolder));
                const tpl = settings.templates.movie || template;
                const movieHeuristics = computeMovieLibraryHeuristics(
                    rowsRef.current
                        .filter((r) => r.kind === "movie")
                        .map((r) => r.plexPath || r.filePath)
                        .concat([String(file)]),
                );
                const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, m.collection || "", settings, libraryFolder, library.roots || [], movieHeuristics);
                row.metadata = m; // Store original metadata for popover
                more.push(row);
            }
            await enrichRowsWithPosters(more);
            setRows(prev => mergeUniqueRows(prev, more));
        } catch (e) {
        } finally {
            setPageLoading(false);
            setLoading(false);
        }
    }, [server.address, library.key, moviesPaging.exhausted, moviesPaging.total, moviesPaging.start, libraryFolder, settings, template, pageSize, enrichRowsWithPosters]);

    const loadMoreEpisodes = useCallback(async () => {
        if (library.type !== "show" || !currentShow) return;
        if (episodesPaging.exhausted) return;

        const targetSeason = selectedSeason === "all" ? null : selectedSeason;
        if (targetSeason === null || targetSeason === undefined) return;

        const seasonData = seasonList.find((season) => season.index === targetSeason);
        if (!seasonData?.key) return;

        const nextStart = episodesPaging.start;
        const fetchSize = Math.max(pageSize, episodesPaging.size);
        if (episodesPaging.total && nextStart >= episodesPaging.total) {
            setEpisodesPaging((prev) => ({ ...prev, exhausted: true }));
            return;
        }

        setLoading(true);
        setPageLoading(true);
        try {
            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
            const epsResp = await invoke<any>("fetch_plex_metadata", {
                server: server.address,
                plexKey: seasonData.key,
                token,
                start: nextStart,
                size: fetchSize,
            });
            const md = epsResp?.MediaContainer?.Metadata ?? [];
            const total = Number(epsResp?.MediaContainer?.totalSize ?? epsResp?.MediaContainer?.total ?? seasonData.leafCount) || episodesPaging.total;
            const returned = Number(epsResp?.MediaContainer?.size ?? md.length);
            const offset = Number(epsResp?.MediaContainer?.offset ?? nextStart);

            const moreEpisodes: EpisodeItem[] = [];
            for (const item of md) {
                const file = item?.Media?.[0]?.Part?.[0]?.file;
                if (!file) continue;

                const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                const plexSeason = Number(item.parentIndex);
                const plexEpisode = Number(item.index);
                moreEpisodes.push({
                    type: "episode",
                    ratingKey: String(item.ratingKey ?? item.key ?? file),
                    showTitle: String(item.grandparentTitle ?? currentShow.title),
                    title: String(item.title ?? "Episode"),
                    season: Number.isFinite(plexSeason) ? plexSeason : parsed.season,
                    index: Number.isFinite(plexEpisode) ? plexEpisode : parsed.index,
                    file: String(file),
                    plexPath: String(file),
                    year: item.year ? Number(item.year) : undefined,
                    grandparentTitle: String(item.grandparentTitle ?? currentShow.title),
                    parentTitle: String(item.parentTitle ?? ""),
                    parentIndex: Number.isFinite(plexSeason) ? plexSeason : (item.parentIndex ? Number(item.parentIndex) : parsed.season),
                    thumb: String(item.thumb ?? ""),
                });
            }

            setEpisodesPaging((prev) => ({
                ...prev,
                total,
                exhausted: total ? offset + returned >= total : md.length < fetchSize,
                start: offset + returned,
                size: fetchSize,
            }));

            if (moreEpisodes.length > 0) {
                setRawItems((prev) => [...prev, ...moreEpisodes]);
            }
        } catch (e) {
            setError(`Failed to load more episodes: ${e}`);
        } finally {
            setPageLoading(false);
            setLoading(false);
        }
    }, [
        library.type,
        currentShow,
        episodesPaging.exhausted,
        episodesPaging.start,
        episodesPaging.size,
        episodesPaging.total,
        pageSize,
        selectedSeason,
        seasonList,
        server.address,
    ]);

    const loadMoreMusic = useCallback(async () => {
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

                const m: MusicItem = {
                    type: "music",
                    ratingKey: musicRatingKey,
                    artist: String(item.grandparentTitle ?? "Unknown Artist"),
                    album: String(item.parentTitle ?? "Unknown Album"),
                    track: String(item.title ?? "Unknown Track"),
                    trackNumber: item.index ? Number(item.index) : undefined,
                    disc: item.parentIndex ? Number(item.parentIndex) : undefined,
                            file: resolvePlexFilePath(String(file), libraryFolder),
                    year: item.year ? Number(item.year) : undefined,
                    genre: String(item.genre ?? ""),
                    thumb: String(item.thumb ?? ""),
                };
                const tpl = settings.templates.music || template;
                const row = await computeMusicProposal(m, tpl, settings, libraryFolder, library.roots || []);
                row.metadata = m; // Store original metadata for popover
                more.push(row);
            }
            setRows(prev => [...prev, ...more]);
        } catch (e) {
        } finally {
            setLoading(false);
        }
    }, [rows.length, server.address, library.key, moviesPaging.size, libraryFolder, settings, template]);


    return (
    <PreviewTemplate
      server={server}
      library={library}
      currentShow={currentShow}
      loading={loading}
      pageLoading={pageLoading}
      pageTransitionLoading={pageTransitionLoading}
      searching={searching}
      error={error}
      rows={rows}
      displayRows={displayRows}
      pageRows={pageRows}
      selectedIds={selectedIds}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      selectedSeason={selectedSeason}
      availableSeasons={availableSeasons}
      seasonList={seasonList}
            anyRedSelected={anyRedSelected}
            libraryFolder={libraryFolder}
            template={template}
            gridTemplate={gridTemplate}
            showMapModal={showMapModal}
            showTemplateHelp={showTemplateHelp}
            showTemplateHistory={showTemplateHistory}
            templateHistoryEntries={templateHistoryEntries}
            templateFavoriteEntries={templateFavoriteEntries}
            editingItem={editingItem}
            renameResultModal={renameResultModal}
            undoResultModal={undoResultModal}
            previewExportModal={previewExportModal}
            onCloseRenameResultModal={() => setRenameResultModal(null)}
            onCloseUndoResultModal={() => setUndoResultModal(null)}
            onClosePreviewExportModal={() => setPreviewExportModal(null)}
            popoverData={popoverData}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            resolvedTheme={resolvedTheme}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            onBack={onBack}
            onToggle={toggle}
            onSkipReds={skipReds}
            onApplyRename={applyRename}
            onUndoLastRename={undoLastRename}
            showUndoConfirm={showUndoConfirm}
            onUndoConfirm={handleUndoConfirm}
            onUndoCancel={handleUndoCancel}
            onSetSearchQuery={setSearchQuery}
            onSetStatusFilter={setStatusFilter}
            onSetPage={setPage}
            onSetPageSize={setPageSize}
            onSetShowMapModal={setShowMapModal}
            onSetShowTemplateHelp={setShowTemplateHelp}
            onSetShowTemplateHistory={setShowTemplateHistory}
            onApplyTemplateValue={applyTemplateValue}
            onCommitTemplateHistory={commitTemplateHistory}
            onSaveTemplateFavorite={saveTemplateFavorite}
            onDeleteTemplateFavorite={deleteTemplateFavorite}
            onSetEditingItem={setEditingItem}
            onStartResize={startResize}
            onHandleMouseEnter={handleMouseEnter}
            onHandleMouseLeave={handleMouseLeave}
            onRefreshPathMappings={refreshPathMappings}
            onToggleTheme={toggleTheme}
            onUpdateSettings={updateSettings}
            onSetReloadTick={(fn) => setReloadTick(fn)}
            settings={settings}
            previewLoading={previewLoading}
            pageAllSelected={pageAllSelected}
            onTogglePageSelection={togglePageSelection}
            onExportPreviewSnapshot={exportPreviewSnapshot}
            onLoadMoreMusic={() => loadMoreMusic()}
            onSetSelectedSeason={setSelectedSeason}
            applyInProgress={applyInProgress}
            applyOperationCount={applyOperationCount}
            lastApplySummary={lastApplySummary}
            cleanupInProgress={cleanupInProgress}
            cleanupResult={cleanupResult}
            onRemoveEmptyFolders={removeEmptyFolders}
            onCloseApplySummary={clearApplySummary}
        />
    );
}
