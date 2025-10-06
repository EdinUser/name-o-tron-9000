import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {IconArrowBack, IconBolt, IconEdit, IconHome, IconInfo, IconQuestionCircle, IconRefresh, IconSelectOff, IconSettings, IconSearch, IconStatusGood, IconStatusWarning, IconStatusError, IconSun, IconMoon} from "../components/icons";
import Select from "../components/Select";
import PathMappingModal from "../components/PathMappingModal";
import TemplateHelpModal from "../components/TemplateHelpModal";
import PlexPopoverCard from "../components/PlexPopoverCard";
import Toggle from "../components/Toggle";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {useSettings, addOrUpdateManualFix} from "../state/settings";
import {useTheme} from "../state/theme";
import type {Props, MovieItem, EpisodeItem, MusicItem, PreviewRow, SectionResponse} from "./Preview/types";
import {computeMovieProposal} from "./Preview/movieProposal";
import {computeEpisodeProposal} from "./Preview/episodeProposal";
import {computeMusicProposal} from "./Preview/musicProposal";
import {
    parseEpisodeInfo,
    resolvePlexFilePath,
    shortenFilePath
} from "./Preview/utils";



// Functions are now imported from separate modules

export default function Preview({server, library, onBack}: Props) {
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
    const containerRef = useRef<HTMLDivElement | null>(null);
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
                    const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder);
                    row.metadata = m; // Store original metadata for popover
                    list.push(row);
                } else if (item.type === "music") {
                    const m = item as MusicItem;
                    const tpl = settings.templates.music || template;
                    const row = await computeMusicProposal(m, tpl, settings, libraryFolder);
                    row.metadata = m; // Store original metadata for popover
                    list.push(row);
                } else if (item.type === "episode") {
                    const e = item as EpisodeItem;
                    const tpl = settings.templates.episode || template;
                    const useSeasonFolders = !!settings.tv.seasonFolders;
                    const proposal = await computeEpisodeProposal(e, tpl, useSeasonFolders, settings, libraryFolder);
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
                    }
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
                            const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder);
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
                            const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings, libraryFolder);
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
                    _settings: settings,
                }
            });

            if (result.success) {
                alert(`Successfully applied ${result.operations_applied} operations.\nRollback log saved to: ${result.rollback_log_path}`);
            } else {
                alert(`Applied ${result.operations_applied} operations, but ${result.operations_failed} failed.\nCheck console for details.`);
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
        <main className="min-h-screen bg-neutral-900 text-neutral-100" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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
                        <button onClick={toggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
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
                        {/* Reload button */}
                        <button title="Reload library" onClick={() => setReloadTick(t => t + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5"/>
                            Reload
                        </button>

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
                                                const row = await computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings, libraryFolder);
                                                row.metadata = m; // Store original metadata for popover
                                                more.push(row);
                                            }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
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
                                                const row = await computeMusicProposal(m, tpl, settings, libraryFolder);
                                                row.metadata = m; // Store original metadata for popover
                                                more.push(row);
                                            }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
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
                                                        file: resolvePlexFilePath(String(file), libraryFolder),
                                                        year: item.year ? Number(item.year) : undefined,
                                                        grandparentTitle: String(item.grandparentTitle ?? currentShow.title),
                                                        parentTitle: String(item.parentTitle ?? ""),
                                                        parentIndex: item.parentIndex ? Number(item.parentIndex) : parsed.season,
                                                        thumb: String(item.thumb ?? ""),
                                                    };
                                                    const tpl = settings.templates.episode || template;
                                                    const row = await computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings, libraryFolder);
                                                    row.metadata = e; // Store original metadata for popover
                                                    more.push(row);
                                                }
                                            setRows(prev => [...prev, ...more]);
                                        } catch (e) {
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

                        {/* Status Filter Dropdown */}
                        <Select
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={[
                                { value: "all", label: "All" },
                                { value: "good", label: (
                                    <div className="flex items-center gap-1">
                                        <IconStatusGood className="w-3 h-3" />
                                        Green
                                    </div>
                                )},
                                { value: "warning", label: (
                                    <div className="flex items-center gap-1">
                                        <IconStatusWarning className="w-3 h-3" />
                                        Yellow
                                    </div>
                                )},
                                { value: "error", label: (
                                    <div className="flex items-center gap-1">
                                        <IconStatusError className="w-3 h-3" />
                                        Red
                                    </div>
                                )},
                                { value: "unmatched", label: "Unmatched" }
                            ]}
                            className="w-auto"
                        />
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
                            <div
                                key={r.id}
                                className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-50/40"
                                style={{gridTemplateColumns: gridTemplate}}
                                >
                                    <Toggle checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)}/>
                                    <div
                                        className="truncate cursor-pointer hover:bg-neutral-700/50 dark:hover:bg-neutral-700/50 light:hover:bg-neutral-100/50 rounded px-1 py-0.5 transition-colors"
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
                                    <button
                                        onClick={() => setEditingItem(r)}
                                        className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors"
                                        title="Edit metadata"
                                    >
                                        <IconEdit className="w-4 h-4" />
                                    </button>
                                    {/* Subtitle operations */}
                                    {r.subtitleOperations && r.subtitleOperations.length > 0 && (
                                        <div className="ml-7 border-l-2 border-neutral-700 pl-3">
                                            {r.subtitleOperations.map((subOp, idx) => (
                                                <div key={idx} className="grid items-center gap-2 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800/20 dark:hover:bg-neutral-800/20 light:hover:bg-neutral-50/40" style={{gridTemplateColumns: gridTemplate}}>
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
                                </div>
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
                                        className="appearance-none px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-cyan-600/40 hover:bg-neutral-700 pr-7">
                                    {[10, 25, 50, 100].map(n => <option key={n} value={n} className="bg-neutral-800 text-neutral-200">{n}</option>)}
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

            {/* Edit Metadata Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingItem(null)}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-neutral-100">Edit Metadata</h3>
                            <button
                                onClick={() => setEditingItem(null)}
                                className="text-neutral-400 hover:text-neutral-200"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-2">
                                    Current Path
                                </label>
                                <div className="text-sm text-neutral-400 bg-neutral-800 p-2 rounded">
                                    {shortenFilePath(editingItem.filePath, library.roots || [])}
                                </div>
                            </div>

                            {editingItem.kind === "movie" && editingItem.metadata && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Title
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue={(editingItem.metadata as MovieItem).title}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-title"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Year
                                        </label>
                                        <input
                                            type="number"
                                            defaultValue={(editingItem.metadata as MovieItem).year || ""}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-year"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Edition
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue={(editingItem.metadata as MovieItem).editionTitle || ""}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-edition"
                                        />
                                    </div>
                                </>
                            )}

                            {editingItem.kind === "episode" && editingItem.metadata && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Show Title
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue={(editingItem.metadata as EpisodeItem).showTitle}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-show-title"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Episode Title
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue={(editingItem.metadata as EpisodeItem).title}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-episode-title"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-2">
                                                Season
                                            </label>
                                            <input
                                                type="number"
                                                defaultValue={(editingItem.metadata as EpisodeItem).season || ""}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                                id="edit-season"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-2">
                                                Episode
                                            </label>
                                            <input
                                                type="number"
                                                defaultValue={(editingItem.metadata as EpisodeItem).index || ""}
                                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                                id="edit-episode"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {editingItem.kind === "music" && editingItem.metadata && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                                            Track Title
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue={(editingItem.metadata as MusicItem).track}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                            id="edit-track-title"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setEditingItem(null)}
                                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const overrides: any = {};

                                    if (editingItem.kind === "movie") {
                                        const title = (document.getElementById("edit-title") as HTMLInputElement)?.value;
                                        const year = (document.getElementById("edit-year") as HTMLInputElement)?.value;
                                        const edition = (document.getElementById("edit-edition") as HTMLInputElement)?.value;

                                        if (title) overrides.title = title;
                                        if (year) overrides.year = parseInt(year);
                                        if (edition) overrides.editionTitle = edition;
                                    } else if (editingItem.kind === "episode") {
                                        const showTitle = (document.getElementById("edit-show-title") as HTMLInputElement)?.value;
                                        const episodeTitle = (document.getElementById("edit-episode-title") as HTMLInputElement)?.value;
                                        const season = (document.getElementById("edit-season") as HTMLInputElement)?.value;
                                        const episode = (document.getElementById("edit-episode") as HTMLInputElement)?.value;

                                        if (showTitle) overrides.showTitle = showTitle;
                                        if (episodeTitle) overrides.episodeTitle = episodeTitle;
                                        if (season) overrides.season = parseInt(season);
                                        if (episode) overrides.episode = parseInt(episode);
                                    } else if (editingItem.kind === "music") {
                                        const title = (document.getElementById("edit-track-title") as HTMLInputElement)?.value;
                                        if (title) overrides.track = title;
                                    }

                                    if (Object.keys(overrides).length > 0) {
                                        const newFix = {
                                            ratingKey: editingItem.id,
                                            mediaType: editingItem.kind,
                                            overrides,
                                            createdAt: Date.now()
                                        };

                                        const updatedSettings = addOrUpdateManualFix(settings, newFix);
                                        updateSettings(updatedSettings);

                                        // Force refresh of preview to show updated proposal
                                        setReloadTick(prev => prev + 1);
                                    }

                                    setEditingItem(null);
                                }}
                                className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
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
