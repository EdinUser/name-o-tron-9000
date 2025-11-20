import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {useSettings} from "../../state/settings";
import {useTheme} from "../../state/theme";
import type {Props, MovieItem, EpisodeItem, MusicItem, PreviewRow, SectionResponse} from "./types";
import {computeMovieProposal} from "./movieProposal";
import {computeEpisodeProposal} from "./episodeProposal";
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

export default function PreviewContainer({server, library, onBack}: Props) {
    const { settings, updateSettings, settingsVersion } = useSettings();
    const { resolvedTheme, toggleTheme } = useTheme();
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
    const containerRef = useRef<HTMLDivElement>(null);
    const [colWidths, setColWidths] = useState<{ current: number; proposed: number; flags: number }>({ current: 480, proposed: 480, flags: 0 });
    // Template is computed from current settings
    const template = library.type === "movie" ? settings.templates.movie :
                     library.type === "show" ? settings.templates.episode :
                     settings.templates.music;
    const [libraryFolder, setLibraryFolder] = useState<string | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [showTemplateHelp, setShowTemplateHelp] = useState(false);
    const [editingItem, setEditingItem] = useState<PreviewRow | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("all"); // "all", "good", "warning", "error", "unmatched"
    const [currentShow, setCurrentShow] = useState<{ ratingKey: string; title: string } | null>(null);
    const [remoteResults, setRemoteResults] = useState<PreviewRow[]>([]);
    const [showUndoConfirm, setShowUndoConfirm] = useState(false);
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
                const serverId = generateServerId(server);
                const libraryRoots = library.roots || [];

                for (const root of libraryRoots) {
                    const mapping = mappings.find(m => m.server_id === serverId && m.plex_root === root);
                    if (mapping) {
                        setLibraryFolder(mapping.local_root);
                        break;
                    }
                }
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

            // Find the mapped folder for this library
            const serverId = generateServerId(server);
            const libraryRoots = library.roots || [];

            for (const root of libraryRoots) {
                const mapping = mappings.find(m => m.server_id === serverId && m.plex_root === root);
                if (mapping) {
                    setLibraryFolder(mapping.local_root);
                    break;
                }
            }
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

                        const m: MovieItem = {
                            type: "movie",
                            ratingKey: movieRatingKey,
                            title: String(item.title ?? "Unknown"),
                            year: item.year ? Number(item.year) : undefined,
                            file: resolvePlexFilePath(String(file), libraryFolder),
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
                        rawItems.push(m);
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
                            file: resolvePlexFilePath(String(file), libraryFolder),
                            year: item.year ? Number(item.year) : undefined,
                            genre: String(item.genre ?? ""),
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
                                file: resolvePlexFilePath(String(file), libraryFolder),
                                year: item.year ? Number(item.year) : undefined,
                                grandparentTitle: String(item.grandparentTitle ?? showToLoad.title),
                                parentTitle: String(item.parentTitle ?? ""),
                                parentIndex: item.parentIndex ? Number(item.parentIndex) : parsed.season,
                                thumb: String(item.thumb ?? ""),
                            };
                            rawItems.push(e);
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
    }, [server.address, library.key, library.type, reloadTick, moviesPaging.start, moviesPaging.size, episodesPaging.start, episodesPaging.size, currentShow?.ratingKey]);

    // State for raw items
    const [rawItems, setRawItems] = useState<Array<MovieItem | EpisodeItem | MusicItem>>([]);

    // Compute proposals from raw items when settings change
    useEffect(() => {
        async function computeProposals() {
            if (rawItems.length === 0) return;

            const list: PreviewRow[] = [];

            for (const item of rawItems) {
                if (item.type === "movie") {
                    const m = item as MovieItem;
                    // Extract collection information from the raw item
                    const collections = (m as any).Collection || (m as any).collection || [];
                    const collectionName = Array.isArray(collections) && collections.length > 0
                        ? (collections[0]?.tag || collections[0])
                        : "";

                    const tpl = settings.templates.movie || template;
                    const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder, library.roots || []);
                    row.metadata = m; // Store original metadata for popover
                    list.push(row);
                } else if (item.type === "music") {
                    const m = item as MusicItem;
                    const tpl = settings.templates.music || template;
                    const row = await computeMusicProposal(m, tpl, settings, libraryFolder, library.roots || []);
                    row.metadata = m; // Store original metadata for popover
                    list.push(row);
                } else if (item.type === "episode") {
                    const e = item as EpisodeItem;
                    const tpl = settings.templates.episode || template;
                    const useSeasonFolders = !!settings.tv.seasonFolders;
                    const proposal = await computeEpisodeProposal(e, tpl, useSeasonFolders, settings, libraryFolder, library.roots || []);
                    proposal.metadata = e; // Store original metadata for popover
                    list.push(proposal);
                }
            }

            // Process subtitle operations for all files
            try {
                const filePaths = list.map(row => row.filePath);
                if (filePaths.length > 0) {
                const previewResult = await invoke<any>("preview_video_renames", {
                    request: {
                        library_id: library.key,
                        scope: filePaths,
                        settings: settings,
                        server_id: generateServerId(server),
                    }
                });

                    // Attach subtitle operations to rows using shared helper
                    attachSubtitleOperations(list, previewResult);
                }
            } catch (subtitleError) {
                // Continue without subtitle operations
            }

            setRows(list);
            setSelectedIds(new Set(list.filter(r => r.status !== "error").map(r => r.id)));
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
                return currentPath.includes(query) || proposedName.includes(query) || fullPath.includes(query);
            });
        }

        // Apply status filter if not "all"
        if (statusFilter !== "all") {
            results = results.filter(r => r.status === statusFilter);
        }

        return results;
    }, [rows, debouncedSearchQuery, statusFilter, library.roots]);

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
                        let filePath = "";
                        try { filePath = String(item?.Media?.[0]?.Part?.[0]?.file || ""); } catch {}

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

                            const movieRatingKey = String(item.ratingKey || item.key || filePath || Math.random());
                            // Extract collection information directly from movie metadata
                            const collections = item.Collection || item.collection || [];
                            const collectionName = Array.isArray(collections) && collections.length > 0
                                ? (collections[0].tag || collections[0])
                                : "";

                            const m: MovieItem = {
                                type: "movie",
                                ratingKey: movieRatingKey,
                                title: String(item.title || "Unknown"),
                                year: item.year ? Number(item.year) : undefined,
                                file: resolvePlexFilePath(filePath, libraryFolder), // Resolve to absolute local path
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
                            const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder, library.roots || []);
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
                                ratingKey: String(item.ratingKey || item.key || filePath || Math.random()),
                                showTitle,
                                title: String(item.title || "Episode"),
                                season: seasonNum,
                                index: epIndex,
                                file: resolvePlexFilePath(filePath, libraryFolder), // Resolve to absolute local path
                                year: item.year ? Number(item.year) : undefined,
                                grandparentTitle: String(item.grandparentTitle ?? showTitle),
                                parentTitle: String(item.parentTitle ?? ""),
                                parentIndex: item.parentIndex ? Number(item.parentIndex) : seasonNum,
                                thumb: String(item.thumb ?? ""),
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
    }, [debouncedSearchQuery, filteredRows.length, library.key, server.address, loading]);

    // Final rows to display - combine local and remote results
    const displayRows = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return filteredRows;

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
    }, [filteredRows, remoteResults, debouncedSearchQuery, remoteQuery]);

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
                request: {
                    operations,
                    server_id: generateServerId(server),
                    _settings: settings,
                }
            });

            if (result.success) {
                alert(`Successfully applied ${result.operations_applied} operations.\nRollback log saved to: ${result.rollback_log_path}`);
            } else {
                // Log detailed errors to console
                console.error("Failed to apply renames:", {
                    operations_applied: result.operations_applied,
                    operations_failed: result.operations_failed,
                    rollback_log_path: result.rollback_log_path,
                    errors: result.errors
                });

                // Show detailed errors to user
                const errorDetails = result.errors && result.errors.length > 0
                    ? `\n\nError details:\n${result.errors.slice(0, 5).join('\n')}${result.errors.length > 5 ? `\n... and ${result.errors.length - 5} more errors` : ''}`
                    : '';

                alert(`Applied ${result.operations_applied} operations, but ${result.operations_failed} failed.\n\nRollback log saved to: ${result.rollback_log_path}${errorDetails}\n\nCheck console (F12) for complete error details.`);
            }
        } catch (error) {
            console.error("Failed to apply renames:", error);
            alert(`Failed to apply renames: ${error}`);
        } finally {
            setLoading(false);
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
                alert(`Successfully undid ${result.operations_applied} operations.`);
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

                // Show detailed errors to user
                const errorDetails = result.errors && result.errors.length > 0
                    ? `\n\nError details:\n${result.errors.slice(0, 5).join('\n')}${result.errors.length > 5 ? `\n... and ${result.errors.length - 5} more errors` : ''}`
                    : '';

                alert(`Undid ${result.operations_applied} operations, but ${result.operations_failed} failed.\n\nRollback log saved to: ${result.rollback_log_path}${errorDetails}\n\nCheck console (F12) for complete error details.`);
            }
        } catch (error) {
            console.error("Failed to undo renames:", error);
            alert(`Failed to undo renames: ${error}`);
        } finally {
            setLoading(false);
        }
    }

    function handleUndoCancel() {
        setShowUndoConfirm(false);
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

    // Load more functions
    const loadMoreMovies = useCallback(async () => {
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

                const m: MovieItem = {
                    type: "movie",
                    ratingKey: movieRatingKey,
                    title: String(item.title ?? "Unknown"),
                    year: item.year ? Number(item.year) : undefined,
                            file: resolvePlexFilePath(String(file), libraryFolder),
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
                const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder, library.roots || []);
                row.metadata = m; // Store original metadata for popover
                more.push(row);
            }
            setRows(prev => [...prev, ...more]);
        } catch (e) {
        } finally {
            setLoading(false);
        }
    }, [rows.length, server.address, library.key, moviesPaging.size, libraryFolder, settings, template]);

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

    const loadMoreEpisodes = useCallback(async () => {
        const nextStart = rows.length;
        setLoading(true);
        try {
            const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
            const epsResp = await invoke<any>("fetch_show_episodes", {
                server: server.address,
                showRatingKey: currentShow?.ratingKey,
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
                        showTitle: currentShow?.title ?? "Unknown Show",
                        title: String(item.title ?? "Episode"),
                        season: parsed.season,
                        index: parsed.index,
                            file: resolvePlexFilePath(String(file), libraryFolder),
                        year: item.year ? Number(item.year) : undefined,
                        grandparentTitle: String(item.grandparentTitle ?? currentShow?.title ?? "Unknown Show"),
                        parentTitle: String(item.parentTitle ?? ""),
                        parentIndex: item.parentIndex ? Number(item.parentIndex) : parsed.season,
                        thumb: String(item.thumb ?? ""),
                    };
                    const tpl = settings.templates.episode || template;
                    const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings, libraryFolder, library.roots || []);
                    row.metadata = e; // Store original metadata for popover
                    more.push(row);
                }
            setRows(prev => [...prev, ...more]);
        } catch (e) {
        } finally {
            setLoading(false);
        }
    }, [rows.length, server.address, currentShow, episodesPaging.size, libraryFolder, settings, template]);

    return (
        <PreviewTemplate
            server={server}
            library={library}
            currentShow={currentShow}
            loading={loading}
            searching={searching}
            error={error}
            rows={rows}
            displayRows={displayRows}
            pageRows={pageRows}
            selectedIds={selectedIds}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            anyRedSelected={anyRedSelected}
            libraryFolder={libraryFolder}
            template={template}
            gridTemplate={gridTemplate}
            showMapModal={showMapModal}
            showTemplateHelp={showTemplateHelp}
            editingItem={editingItem}
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
            onSetEditingItem={setEditingItem}
            onStartResize={startResize}
            onHandleMouseEnter={handleMouseEnter}
            onHandleMouseLeave={handleMouseLeave}
            onRefreshPathMappings={refreshPathMappings}
            onToggleTheme={toggleTheme}
            onUpdateSettings={updateSettings}
            onSetReloadTick={(fn) => setReloadTick(fn)}
            settings={settings}
            onLoadMoreMovies={() => loadMoreMovies()}
            onLoadMoreMusic={() => loadMoreMusic()}
            onLoadMoreEpisodes={() => loadMoreEpisodes()}
        />
    );
}
