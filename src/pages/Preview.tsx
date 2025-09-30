import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconBolt, IconHome, IconInfo, IconQuestionCircle, IconRefresh, IconSelectOff, IconSettings, IconSearch} from "../components/icons";
import PathMappingModal from "../components/PathMappingModal";
import TemplateHelpModal from "../components/TemplateHelpModal";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {useSettings} from "../state/settings";
import {renderTemplate} from "../utils/template";

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
    genre?: string;
    rating?: string;
    studio?: string;
    director?: string;
    writer?: string;
    country?: string;
    tagline?: string;
    summary?: string;
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
};

type PreviewRow = {
    id: string;
    kind: "movie" | "episode";
    filePath: string;
    proposed: string;
    status: "green" | "yellow" | "red" | "unmatched";
    flags: string[];
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

function sanitizeProposal(name: string): { ok: boolean; reason?: string } {
    if (/[\\/:*?"<>|]/.test(name)) return {ok: false, reason: "invalid-chars"};
    const base = name.replace(/\.[^.]+$/, "");
    if (RESERVED.has(base.toUpperCase())) return {ok: false, reason: "reserved-name"};
    return {ok: true};
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

function computeMovieProposal(m: MovieItem, template: string, ownFolderPerMovie: boolean, collectionsEnabled: boolean, collectionName: string, settings: any): PreviewRow {
    const ext = extname(m.file) || ".mkv";
    // Expanded context for movies
    const ctx = {
        title: m.title,
        year: m.year ?? "",
        ext,
        edition: m.edition ?? "",
        genre: m.genre ?? "",
        rating: m.rating ?? "",
        studio: m.studio ?? "",
        director: m.director ?? "",
        writer: m.writer ?? "",
        country: m.country ?? "",
        tagline: m.tagline ?? "",
        summary: m.summary ?? "",
        collection: collectionName,
    } as any;
    console.log("Movie template context:", ctx);
    console.log("Template:", template);
    let proposed = renderTemplate(template, ctx);
    console.log("Proposed name:", proposed);
    if (!proposed.endsWith(ext)) proposed += ext; // safety net if template omitted {ext}

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
    // If collections are disabled or movie has no collection, use individual movie folder if enabled
    else if (ownFolderPerMovie && !proposed.includes('/')) {
        const folderName = safeFolderName(m.title);
        proposed = `${folderName}/${proposed}`;
    }

    proposed = normalizeUnicode(proposed);
    const flags: string[] = [];
    const {ok, reason} = sanitizeProposal(basename(proposed));
    let status: PreviewRow["status"] = "green";
    if (!VIDEO_EXTS.has(ext)) {
        status = "yellow";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "red";
        if (reason) flags.push(reason);
    }
    const highlight = settings.general.encoding.highlightNonLatin;
    if (highlight && hasNonLatin(proposed) && status !== "red") {
        status = status === "green" ? "yellow" : status;
        flags.push("non-latin");
    }
    if (proposed.length > 255) {
        status = "red";
        flags.push(">255 path");
    } else if (proposed.length > 200 && status !== "red") {
        status = "yellow";
        flags.push(">200 path");
    }
    return {id: m.ratingKey, kind: "movie", filePath: m.file, proposed, status, flags};
}

function computeEpisodeProposal(e: EpisodeItem, template: string, useSeasonFolders: boolean, settings: any): PreviewRow {
    const ext = extname(e.file) || ".mkv";
    const ctx = {
        showTitle: e.showTitle,
        title: e.title,
        season: typeof e.season === "number" ? e.season : 0,
        episode: typeof e.index === "number" ? e.index : 0,
        ext,
        year: e.year ?? "",
        grandparentTitle: e.grandparentTitle ?? e.showTitle,
        parentTitle: e.parentTitle ?? "",
        parentIndex: e.parentIndex ?? e.season ?? 0,
    } as any;
    let proposed = renderTemplate(template, ctx);
    if (!proposed.endsWith(ext)) proposed += ext;
    // Optional season folders can be expressed via template, but keep legacy support
    if (useSeasonFolders && !/\{.*season.*\}/i.test(template)) {
        const seasonLabel = typeof e.season === "number" ? `Season ${String(e.season).padStart(2, "0")}` : "Season 00";
        proposed = `${safeFolderName(e.showTitle)}/${seasonLabel}/` + proposed;
    }
    proposed = normalizeUnicode(proposed);
    const flags: string[] = [];
    const {ok, reason} = sanitizeProposal(basename(proposed));
    let status: PreviewRow["status"] = "green";
    if (!VIDEO_EXTS.has(ext)) {
        status = "yellow";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "red";
        if (reason) flags.push(reason);
    }
    const highlight2 = settings.general.encoding.highlightNonLatin;
    if (highlight2 && hasNonLatin(proposed) && status !== "red") {
        status = status === "green" ? "yellow" : status;
        flags.push("non-latin");
    }
    if (proposed.length > 255) {
        status = "red";
        flags.push(">255 path");
    } else if (proposed.length > 200 && status !== "red") {
        status = "yellow";
        flags.push(">200 path");
    }
    return {id: e.ratingKey, kind: "episode", filePath: e.file, proposed, status, flags};
}

export default function Preview({server, library, onBack}: Props) {
    const { settings, updateSettings } = useSettings();
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
    const [colWidths, setColWidths] = useState<{ current: number; proposed: number; flags: number }>({ current: 480, proposed: 480, flags: 320 });
    // Template is computed from current settings
    const template = library.type === "movie" ? settings.templates.movie : settings.templates.episode;
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
                        };
                        const tpl = settings.templates.movie || template;
                        list.push(computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings));
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
                            };
                            const tpl = settings.templates.episode || template;
                            const proposal = computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings);
                            list.push(proposal);
                        }
                        // Clear the initial show after loading if it was from window
                        if (initialShow) {
                            delete (window as any).__initialShow;
                        }
                    }
                    // If no show selected, show message to go back to show selection
                } else {
                    // For TV shows without a selected show, show a message
                    setRows([]);
                    setError("Please select a TV show first from the show selection page.");
                    return; // Exit early to avoid setting selected IDs on empty list
                }

                setRows(list);
                setSelectedIds(new Set(list.filter(r => r.status !== "red").map(r => r.id)));
            } catch (e: any) {
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [server.address, library.key, library.type, template, reloadTick,
        settings.movies.collections.enabled,
        settings.movies.collections.mode,
        settings.movies.collections.naming,
        settings.movies.ownFolderPerMovie,
        settings.tv.seasonFolders,
        settings.general.encoding.mode,
        settings.general.encoding.highlightNonLatin,
        settings.templates.movie,
        settings.templates.episode
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

    // Trigger remote (API) search when no local matches
    useEffect(() => {
        const q = debouncedSearchQuery.trim();
        if (!q) {
            setRemoteResults([]);
            setRemoteQuery("");
            setSearching(false);
            return;
        }
        if (filteredRows.length > 0) {
            // We have local matches; clear remote results to avoid mixing
            setRemoteResults([]);
            setRemoteQuery("");
            setSearching(false);
            return;
        }
        // If local results are empty and we're not currently loading, trigger remote search
        if (loading) {
            // Wait until loading completes; effect will re-run because of dependency on `loading`
            return;
        }
        let isCancelled = false;
        console.log("SEARCH EFFECT: triggering remote search", { q, filteredCount: filteredRows.length });
        setSearching(true);
        (async () => {
            try {
                const token = (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
                const sectionNum = (() => { const n = Number(library.key); return Number.isFinite(n) ? n : null; })();
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
                for (const hub of hubs) {
                    const items = hub.Directory || hub.Metadata || [];
                    if (!Array.isArray(items)) continue;
                    for (const item of items) {
                        let filePath = "";
                        try { filePath = String(item?.Media?.[0]?.Part?.[0]?.file || ""); } catch {}

                        if (library.type === "movie") {
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
                                file: filePath || String(item.key || ""),
                                edition: String(item.edition ?? item.editionTitle ?? ""),
                                genre: String(item.genre ?? ""),
                                rating: String(item.contentRating ?? ""),
                                studio: String(item.studio ?? ""),
                                director: String(item.director ?? ""),
                                writer: String(item.writer ?? ""),
                                country: String(item.country ?? ""),
                                tagline: String(item.tagline ?? ""),
                                summary: String(item.summary ?? ""),
                            };
                            const tpl = settings.templates.movie || template;
                            const row = computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings);
                            row.flags.push("remote-search");
                            newRows.push(row);
                        } else {
                            // TV episode
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
                                file: filePath || String(item.key || ""),
                                year: item.year ? Number(item.year) : undefined,
                                grandparentTitle: String(item.grandparentTitle ?? showTitle),
                                parentTitle: String(item.parentTitle ?? ""),
                                parentIndex: item.parentIndex ? Number(item.parentIndex) : seasonNum,
                            };
                            const tpl = settings.templates.episode || template;
                            const row = computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings);
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

    // Final rows to display
    const displayRows = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return rows;
        if (filteredRows.length > 0) return filteredRows;
        if (remoteQuery === debouncedSearchQuery) return remoteResults;
        return [];
    }, [rows, filteredRows, remoteResults, debouncedSearchQuery, remoteQuery]);

    const anyRedSelected = useMemo(() => displayRows.some(r => r.status === "red" && selectedIds.has(r.id)), [displayRows, selectedIds]);
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
        setSelectedIds(new Set(rows.filter(r => r.status !== "red").map(r => r.id)));
    }

    function applyRename() {
        if (anyRedSelected) return;
        const plan = rows.filter(r => selectedIds.has(r.id)).map(r => ({old: r.filePath, proposed: r.proposed, status: r.status, flags: r.flags}));
        alert(`Would apply ${plan.length} renames.\n(Stub) See console for plan.`);
        console.log("Rename plan", plan);
    }

    // Column resizing + fluid width support
    useEffect(() => {
        function distributeInitial() {
            const el = containerRef.current;
            if (!el) return;
            const containerWidth = el.clientWidth;
            const gapPx = 8; // gap-2
            const fixed = 28 + 120 + gapPx * 4; // checkbox + status + gaps
            const avail = Math.max(0, containerWidth - fixed);
            const w1 = Math.max(240, Math.floor(avail * (1.5 / 4.0)));
            const w2 = Math.max(240, Math.floor(avail * (1.5 / 4.0)));
            const w3 = Math.max(160, Math.max(0, avail - w1 - w2));
            setColWidths({ current: w1, proposed: w2, flags: w3 });
        }

        function onResize() {
            const el = containerRef.current;
            if (!el) return;
            const containerWidth = el.clientWidth;
            const gapPx = 8;
            const fixed = 28 + 120 + gapPx * 4;
            const avail = Math.max(0, containerWidth - fixed);
            const totalFlex = colWidths.current + colWidths.proposed + colWidths.flags;
            if (avail <= 0 || totalFlex <= 0) return;
            const ratio = avail / totalFlex;
            let current = Math.max(160, Math.floor(colWidths.current * ratio));
            let proposed = Math.max(160, Math.floor(colWidths.proposed * ratio));
            let flags = Math.max(160, Math.floor(avail - current - proposed));
            if (flags < 160) flags = 160;
            setColWidths({ current, proposed, flags });
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
        const fixed = 28 + 120 + gapPx * 4;
        const containerWidth = el?.clientWidth ?? 0;
        const avail = Math.max(0, containerWidth - fixed);
        const min = 160;

        function onMove(e: MouseEvent) {
            const dx = e.clientX - startX;
            let current = start.current;
            let proposed = start.proposed;
            if (which === "current") {
                current = Math.max(min, Math.min(avail - min - min, start.current + dx));
            } else {
                proposed = Math.max(min, Math.min(avail - min - min, start.proposed + dx));
            }
            let flags = Math.max(min, avail - current - proposed);
            setColWidths({ current, proposed, flags });
        }
        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    const gridTemplate = `28px ${colWidths.current}px ${colWidths.proposed}px 120px ${colWidths.flags}px`;

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
                        <button title="Reload library" onClick={() => setReloadTick(t => t + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5"/>
                            Reload
                        </button>
                        <input
                            value={template}
                            onChange={(e) => {
                                const next = e.target.value;
                                const updated = {
                                    ...settings,
                                    templates: {
                                        ...settings.templates,
                                        [library.type === "movie" ? "movie" : "episode"]: next,
                                    }
                                } as any;
                                updateSettings(updated);
                            }}
                            placeholder={library.type === "movie" ? "Movie template" : "Episode template"}
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
                              : "{showTitle} - S{season:02}E{episode:02} - {title}{ext}";
                            const updated = {
                              ...settings,
                              templates: {
                                ...settings.templates,
                                [library.type === "movie" ? "movie" : "episode"]: def,
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
                                                };
                                                const tpl = settings.templates.movie || template;
                                                more.push(computeMovieProposal(m, tpl, settings.movies.ownFolderPerMovie, settings.movies.collections.enabled, collectionName, settings));
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
                                                    };
                                                    const tpl = settings.templates.episode || template;
                                                    more.push(computeEpisodeProposal(e, tpl, !!settings.tv.seasonFolders, settings));
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
                        <button title="Reload library" onClick={() => setReloadTick(t => t + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5" />
                            Reload
                        </button>
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
                            <div>Status</div>
                            <div>Flags</div>
                        </div>
                        {pageRows.map((r) => (
                            <div key={r.id} className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40" style={{gridTemplateColumns: gridTemplate}}>
                                <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-cyan-500"/>
                                <div className="truncate" title={r.filePath}>{shortenFilePath(r.filePath, library.roots || [])}</div>
                                <div className="truncate" title={r.proposed}>{r.proposed}</div>
                                <div>
                                    {r.status === "green" && <span className="text-emerald-400">🟩 Green</span>}
                                    {r.status === "yellow" && <span className="text-amber-300">🟨 Yellow</span>}
                                    {r.status === "red" && <span className="text-red-400">🟥 Red</span>}
                                    {r.status === "unmatched" && <span>❌ Unmatched</span>}
                                </div>
                                <div className="truncate text-neutral-400" title={r.flags.join(", ")}>{r.flags.join(", ")}</div>
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
                            <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
                                    className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1">
                                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
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
                    libraryType={library.type as "movie" | "show"}
                    onClose={() => setShowTemplateHelp(false)}
                />
            )}
        </main>
    );
}
