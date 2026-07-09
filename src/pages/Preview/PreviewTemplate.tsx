// Components
import {IconArrowBack, IconBadgeCheck, IconBolt, IconEdit, IconHome, IconQuestionCircle, IconRefresh, IconSelectOff, IconSettings, IconSearch, IconStatusGood, IconStatusWarning, IconStatusError, IconSun, IconMoon} from "../../components/icons";
import Select from "../../components/Select";
import PathMappingModal from "../../components/PathMappingModal";
import TemplateHelpModal from "../../components/TemplateHelpModal";
import PlexPopoverCard from "../../components/PlexPopoverCard";
import Toggle from "../../components/Toggle";
import { generateServerId } from "../../utils/cache";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// Types
import type {PreviewRow, MovieItem, EpisodeItem, MusicItem} from "./types";
import type { PlexLibrary, PlexServer } from "../../types/plex";

// Utils and state
import { addOrUpdateManualFix } from "../../state/settings";
import { shortenFilePath } from "./utils";

type TemplateProps = {
    server: PlexServer;
    library: PlexLibrary;
    currentShow: { ratingKey: string; title: string } | null;
    loading: boolean;
    searching: boolean;
    error: string | null;
    rows: PreviewRow[];
    displayRows: PreviewRow[];
    pageRows: PreviewRow[];
    selectedIds: Set<string>;
    page: number;
    pageSize: number;
    totalPages: number;
    anyRedSelected: boolean;
    libraryFolder: string | null;
    template: string;
    gridTemplate: string;
    showMapModal: boolean;
    showTemplateHelp: boolean;
    showTemplateHistory: boolean;
    templateHistoryEntries: string[];
    templateFavoriteEntries: string[];
    editingItem: PreviewRow | null;
    renameResultModal: {
        success: boolean;
        operations_applied: number;
        operations_failed: number;
        rollback_log_path: string;
        errors: string[];
    } | null;
    undoResultModal: {
        success: boolean;
        operations_applied: number;
        operations_failed: number;
        rollback_log_path: string;
        errors: string[];
        refreshWarnings: string[];
    } | null;
    previewExportModal: {
        success: boolean;
        path?: string;
        error?: string;
    } | null;
    onCloseRenameResultModal: () => void;
    onCloseUndoResultModal: () => void;
    onClosePreviewExportModal: () => void;
    popoverData: { metadata: any; position: { x: number; y: number } };
    searchQuery: string;
    pageLoading: boolean;
    pageTransitionLoading: boolean;
    statusFilter: string;
    resolvedTheme: string;
    containerRef: React.RefObject<HTMLDivElement>;
    onBack: () => void;
    onToggle: (id: string) => void;
    onSkipReds: () => void;
    onApplyRename: () => void;
    onUndoLastRename: () => void;
    showUndoConfirm: boolean;
    onUndoConfirm: () => void;
    onUndoCancel: () => void;
    onSetSearchQuery: (query: string) => void;
    onSetStatusFilter: (filter: string) => void;
    onSetPage: (page: number) => void;
    onSetPageSize: (size: number) => void;
    onSetShowMapModal: (show: boolean) => void;
    onSetShowTemplateHelp: (show: boolean) => void;
    onSetShowTemplateHistory: (show: boolean) => void;
    onApplyTemplateValue: (template: string) => void;
    onCommitTemplateHistory: (template: string) => void;
    onSaveTemplateFavorite: (template: string) => void;
    onDeleteTemplateFavorite: (template: string) => void;
    onSetEditingItem: (item: PreviewRow | null) => void;
    onStartResize: (which: "current" | "proposed", ev: React.MouseEvent) => void;
    onHandleMouseEnter: (event: React.MouseEvent<HTMLDivElement>, row: PreviewRow) => void;
    onHandleMouseLeave: () => void;
    onRefreshPathMappings: () => void;
    onToggleTheme: () => void;
    onTestMoviePathScan: (row: PreviewRow) => void;
    onTestEpisodePathScan: (row: PreviewRow) => void;
    onTestShowPathScan: (row: PreviewRow) => void;
    moviePathScanInProgressId: string | null;
    episodePathScanInProgressId: string | null;
    showPathScanInProgressId: string | null;
    onForcePlexScan: () => void;
    forcePlexScanInProgress: boolean;
    onUpdateSettings: (settings: any) => void;
    onSetReloadTick: (fn: (prev: number) => number) => void;
    settings: any;
    previewLoading: boolean;
    pageAllSelected: boolean;
    onTogglePageSelection: () => void;
    onExportPreviewSnapshot: () => void;
    onLoadMoreMusic: () => void;
    selectedSeason: number | "all" | null;
    availableSeasons: number[];
    seasonList: Array<{index: number, title: string, leafCount: number, ratingKey: string, key: string}>;
    onSetSelectedSeason: (season: number | "all" | null) => void;
    applyInProgress: boolean;
    applyOperationCount: number;
    lastApplySummary: {
        operationsApplied: number;
        operationsFailed: number;
        rollbackLogPath: string;
        refreshWarnings: string[];
        operations: {
            operation_type: string;
            original_path: string;
            new_path: string;
            backup_path: string | null;
            operation_id: string;
        }[];
    } | null;
    cleanupInProgress: boolean;
    cleanupResult: {
        removed_directories: string[];
        errors: string[];
    } | null;
    onRemoveEmptyFolders: () => void;
    onCloseApplySummary: () => void;
};

export default function PreviewTemplate({
    server,
    library,
    currentShow,
    loading,
    pageLoading,
    searching,
    error,
    rows,
    displayRows,
    pageRows,
    selectedIds,
    page,
    pageSize,
    totalPages,
    anyRedSelected,
    libraryFolder,
    template,
    gridTemplate,
    showMapModal,
    showTemplateHelp,
    showTemplateHistory,
    templateHistoryEntries,
    templateFavoriteEntries,
    editingItem,
    renameResultModal,
    undoResultModal,
    previewExportModal,
    onCloseRenameResultModal,
    onCloseUndoResultModal,
    onClosePreviewExportModal,
    popoverData,
    searchQuery,
    pageTransitionLoading,
    statusFilter,
    resolvedTheme,
    containerRef,
    onBack,
    onToggle,
    onSkipReds,
    onApplyRename,
    onUndoLastRename,
    showUndoConfirm,
    onUndoConfirm,
    onUndoCancel,
    onSetSearchQuery,
    onSetStatusFilter,
    onSetPage,
    onSetPageSize,
    onSetShowMapModal,
    onSetShowTemplateHelp,
    onSetShowTemplateHistory,
    onApplyTemplateValue,
    onCommitTemplateHistory,
    onSaveTemplateFavorite,
    onDeleteTemplateFavorite,
    onSetEditingItem,
    onStartResize,
    onHandleMouseEnter,
    onHandleMouseLeave,
    onRefreshPathMappings,
    onToggleTheme,
    onTestMoviePathScan,
    onTestEpisodePathScan,
    onTestShowPathScan,
    moviePathScanInProgressId,
    episodePathScanInProgressId,
    showPathScanInProgressId,
    onForcePlexScan,
    forcePlexScanInProgress,
    onUpdateSettings,
    onSetReloadTick,
    settings,
    previewLoading,
    pageAllSelected,
    onTogglePageSelection,
    onExportPreviewSnapshot,
    onLoadMoreMusic,
    selectedSeason,
    seasonList,
    onSetSelectedSeason,
    applyInProgress,
    applyOperationCount,
    lastApplySummary,
    cleanupInProgress,
    cleanupResult,
    onRemoveEmptyFolders,
    onCloseApplySummary,
}: TemplateProps) {
    // Calculate view mode for use in controls
    const isTableView = settings.general.viewMode[library.type === "movie" ? "movies" : "tv"] === "table";

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
                        <button onClick={onSkipReds} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSelectOff className="h-5 w-5"/>
                            Skip Reds
                        </button>
                        <button onClick={onApplyRename} disabled={anyRedSelected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                            <IconBolt className="h-5 w-5"/>
                            Proceed
                        </button>
                        <button onClick={onUndoLastRename} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            ↶ Undo
                        </button>
                        <button
                            onClick={onForcePlexScan}
                            disabled={forcePlexScanInProgress}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50"
                            title="Trigger a full Plex scan for this library section"
                        >
                            <IconRefresh className="h-5 w-5"/>
                            {forcePlexScanInProgress ? "Scanning…" : "Force Plex Scan"}
                        </button>
                        <button onClick={onExportPreviewSnapshot} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            Export snapshot
                        </button>
                        <div className="relative">
                            <input
                                value={template}
                                onChange={(e) => {
                                    onApplyTemplateValue(e.target.value);
                                    if (!showTemplateHistory && (templateHistoryEntries.length > 0 || templateFavoriteEntries.length > 0)) {
                                        onSetShowTemplateHistory(true);
                                    }
                                }}
                                onFocus={() => {
                                    if (templateHistoryEntries.length > 0 || templateFavoriteEntries.length > 0) {
                                        onSetShowTemplateHistory(true);
                                    }
                                }}
                                onClick={() => {
                                    if (templateHistoryEntries.length > 0 || templateFavoriteEntries.length > 0) {
                                        onSetShowTemplateHistory(true);
                                    }
                                }}
                                onBlur={() => {
                                    onCommitTemplateHistory(template);
                                    window.setTimeout(() => onSetShowTemplateHistory(false), 120);
                                }}
                                placeholder={
                                    library.type === "movie" ? "Movie template" :
                                    library.type === "show" ? "Episode template" : "Music template"
                                }
                                className="w-[380px] rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                            />
                            {showTemplateHistory && (templateHistoryEntries.length > 0 || templateFavoriteEntries.length > 0) && (
                                <div className="absolute left-0 top-full z-20 mt-1 w-[380px] rounded-md border border-neutral-700 bg-neutral-900 shadow-lg">
                                    {templateHistoryEntries.length > 0 && (
                                        <>
                                            <div className="border-b border-neutral-800 px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
                                                Recent templates
                                            </div>
                                            <div className="py-1">
                                                {templateHistoryEntries.map((entry, index) => {
                                                    const isSaved = templateFavoriteEntries.includes(entry);
                                                    return (
                                                        <div key={`${entry}-${index}`} className="flex items-center gap-2 px-2">
                                                            <button
                                                                type="button"
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    onApplyTemplateValue(entry);
                                                                    onCommitTemplateHistory(entry);
                                                                    onSetShowTemplateHistory(false);
                                                                }}
                                                                className="block min-w-0 flex-1 truncate rounded px-1 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                                                                title={entry}
                                                            >
                                                                {entry}
                                                            </button>
                                                            {!isSaved && (
                                                                <button
                                                                    type="button"
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        onSaveTemplateFavorite(entry);
                                                                    }}
                                                                    className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                                                                    title="Save template"
                                                                >
                                                                    Save
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                    {templateFavoriteEntries.length > 0 && (
                                        <>
                                            <div className="border-y border-neutral-800 px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
                                                Saved templates
                                            </div>
                                            <div className="py-1">
                                                {templateFavoriteEntries.map((entry, index) => (
                                                    <div key={`favorite-${entry}-${index}`} className="flex items-center gap-2 px-2">
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                onApplyTemplateValue(entry);
                                                                onCommitTemplateHistory(entry);
                                                                onSetShowTemplateHistory(false);
                                                            }}
                                                            className="block min-w-0 flex-1 truncate rounded px-1 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                                                            title={entry}
                                                        >
                                                            {entry}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                onDeleteTemplateFavorite(entry);
                                                            }}
                                                            className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                                                            title="Delete saved template"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onSetShowTemplateHelp(true)}
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
                            onApplyTemplateValue(def);
                            onCommitTemplateHistory(def);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                        >
                          Reset
                        </button>
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                        <button onClick={onToggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
                        </button>
                    </div>

                </div>
            </header>

            <section className="mx-auto px-6 py-6">
                {/* Search and load more buttons */}
                <div className="mb-4 flex items-center justify-between gap-2">
                    {/* Left side - Select All toggle */}
                    {!isTableView && displayRows.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Toggle
                                checked={pageAllSelected}
                                onChange={() => onTogglePageSelection()}
                                aria-label="Select or deselect all items on this page"
                            />
                            <span className="text-sm text-neutral-400">Select all</span>
                        </div>
                    )}

                    {/* Right side - other controls */}
                    <div className="flex items-center gap-2">
                        {/* Reload button */}
                        <button title="Reload library" onClick={() => onSetReloadTick((prev: number) => prev + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5"/>
                            Reload
                        </button>

                        {/* View Mode Toggle - moved here from top */}
                        {library.type === "movie" && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-neutral-400">View:</span>
                                <Select
                                    value={settings.general.viewMode.movies}
                                    onChange={(value) => {
                                        const updated = {
                                            ...settings,
                                            general: {
                                                ...settings.general,
                                                viewMode: {
                                                    ...settings.general.viewMode,
                                                    movies: value
                                                }
                                            }
                                        } as any;
                                        onUpdateSettings(updated);
                                    }}
                                    options={[
                                        { value: "table", label: "Table" },
                                        { value: "blocks", label: "Blocks" }
                                    ]}
                                    className="w-auto"
                                />
                            </div>
                        )}

                        {/* Load more buttons for other types */}

                        {library.type === "artist" && (
                            <button
                                onClick={onLoadMoreMusic}
                                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                            >
                                Load more tracks
                            </button>
                        )}

                        {library.type === "show" && currentShow && (
                            <div className="flex items-center gap-2">
                                {/* Season Filter Dropdown - show as soon as seasons are loaded */}
                                {seasonList.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-neutral-400">Season:</span>
                                        <Select
                                            value={selectedSeason || "all"}
                                            onChange={(value) => onSetSelectedSeason(value === "all" && selectedSeason === null ? null : value)}
                                            options={[
                                                ...seasonList.map(season => ({
                                                    value: season.index,
                                                    label: `${season.title} (${season.leafCount} episodes)`
                                                })),
                                                ...(seasonList.length > 1 ? [{ value: "all" as const, label: "View all seasons" }] : [])
                                            ]}
                                            className="w-auto"
                                        />
                                    </div>
                                )}
                                {/* View Mode Toggle - for TV shows */}
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-neutral-400">View:</span>
                                    <Select
                                        value={settings.general.viewMode.tv}
                                        onChange={(value) => {
                                            const updated = {
                                                ...settings,
                                                general: {
                                                    ...settings.general,
                                                    viewMode: {
                                                        ...settings.general.viewMode,
                                                        tv: value
                                                    }
                                                }
                                            } as any;
                                            onUpdateSettings(updated);
                                        }}
                                        options={[
                                            { value: "table", label: "Table" },
                                            { value: "blocks", label: "Blocks" }
                                        ]}
                                        className="w-auto"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                            <input
                                value={searchQuery}
                                onChange={(e) => onSetSearchQuery(e.target.value)}
                                placeholder="Search files..."
                                className="w-[300px] rounded-md border border-neutral-700 bg-neutral-900 pl-8 pr-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => onSetSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        {/* Status Filter Dropdown */}
                        <Select
                            value={statusFilter}
                            onChange={onSetStatusFilter}
                            options={[
                                { value: "all", label: "All" },
                                { value: "good", label: "Green" },
                                { value: "warning", label: "Yellow" },
                                { value: "error", label: "Red" },
                                { value: "unmatched", label: "Unmatched" }
                            ]}
                            className="w-auto"
                        />
                    </div>
                </div>


                {error && <p className="text-center text-red-300">Error: {error}</p>}

                {(() => {
                    if (isTableView) {
                        // Table View
                        return (
                            <div ref={containerRef} className="overflow-auto rounded-xl border border-neutral-800 mt-4">
                                <div className="grid items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm font-semibold" style={{gridTemplateColumns: gridTemplate}}>
                                    <div className="flex items-center justify-center" title="Select or deselect all rows on this page">
                                        <Toggle
                                            checked={pageAllSelected}
                                            onChange={() => onTogglePageSelection()}
                                            aria-label="Select or deselect all rows on this page"
                                        />
                                    </div>
                                    <div className="relative select-none">
                                        <span>Current</span>
                                        <span onMouseDown={(e) => onStartResize("current", e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize"/>
                                    </div>
                                    <div className="relative select-none">
                                        <span>Proposed</span>
                                        <span onMouseDown={(e) => onStartResize("proposed", e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize"/>
                                    </div>
                                    <div></div>
                                </div>
                                {((loading || previewLoading || searching) && displayRows.length === 0) && (
                                    <div className="px-3 py-4 text-center text-sm text-neutral-400">
                                        {searchQuery.trim() || searching
                                            ? 'Searching…'
                                            : library.type === 'movie'
                                                ? 'Loading movies…'
                                                : library.type === 'show'
                                                    ? 'Loading episodes…'
                                                    : 'Loading items…'}
                                    </div>
                                )}

                                {(pageTransitionLoading || pageLoading) && (
                                    <div className="px-3 py-4 text-center text-sm text-neutral-400">
                                        {library.type === 'movie'
                                            ? 'Loading more movies…'
                                            : library.type === 'show'
                                            ? 'Loading more episodes…'
                                            : 'Loading more items…'}
                                    </div>
                                )}
                                {!pageTransitionLoading && !pageLoading && displayRows.length > 0 && pageRows.map((r) => {
                                    const isCompliant = r.flags.includes("already-compliant");
                                    const visibleFlags = r.flags.filter((f) => f !== "already-compliant");

                                    return (
                                        <div
                                            key={r.id}
                                            className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-50/40"
                                            style={{gridTemplateColumns: gridTemplate}}
                                        >
                                            <Toggle checked={selectedIds.has(r.id)} onChange={() => onToggle(r.id)}/>
                                            <div
                                                className="truncate cursor-pointer hover:bg-neutral-700/50 dark:hover:bg-neutral-700/50 light:hover:bg-neutral-100/50 rounded px-1 py-0.5 transition-colors"
                                                onMouseEnter={(e) => onHandleMouseEnter(e, r)}
                                                onMouseLeave={onHandleMouseLeave}
                                            >
                                                {shortenFilePath(r.filePath, library.roots || [])}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="relative cursor-help"
                                                    title={visibleFlags.length > 0 ? `Status: ${r.status} | Issues: ${visibleFlags.join(", ")}` : `Status: ${r.status}`}
                                                >
                                                    {r.status === "good" && <IconStatusGood className="w-5 h-5" />}
                                                    {r.status === "warning" && <IconStatusWarning className="w-5 h-5" />}
                                                    {r.status === "error" && <IconStatusError className="w-5 h-5" />}
                                                    {r.status === "unmatched" && <IconQuestionCircle className="w-5 h-5 text-gray-400" />}
                                                </div>
                                                {isCompliant && (
                                                    <span className="text-neutral-400" title="Already compliant with current template/settings (no change)">
                                                        <IconBadgeCheck className="w-4 h-4" />
                                                    </span>
                                                )}
                                                <div className={`truncate ${isCompliant ? "text-neutral-400" : ""}`} title={r.proposed}>{r.proposed}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {r.kind === "movie" && (
                                                    <button
                                                        onClick={() => onTestMoviePathScan(r)}
                                                        disabled={moviePathScanInProgressId === r.id}
                                                        className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                                                        title="Trigger Plex rescan for this movie folder"
                                                    >
                                                        <IconRefresh className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {r.kind === "episode" && (
                                                    <>
                                                        <button
                                                            onClick={() => onTestEpisodePathScan(r)}
                                                            disabled={episodePathScanInProgressId === r.id}
                                                            className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                                                            title="Trigger Plex rescan for this episode folder"
                                                        >
                                                            <IconRefresh className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => onTestShowPathScan(r)}
                                                            disabled={showPathScanInProgressId === (currentShow?.ratingKey ?? r.id)}
                                                            className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
                                                            title="Trigger Plex rescan for the current show folder"
                                                        >
                                                            Show
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => onSetEditingItem(r)}
                                                    className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors"
                                                    title="Edit metadata"
                                                >
                                                    <IconEdit className="w-4 h-4" />
                                                </button>
                                            </div>
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
                                    );
                                })}
                                {!loading && !previewLoading && !searching && displayRows.length === 0 && (
                                    <p className="px-3 py-2 text-neutral-400">No items to preview.</p>
                                )}
                            </div>
                        );
                    } else {
                        // Blocks View
                        return (
                            <div className="mt-4">
                                {((loading || previewLoading || searching) && displayRows.length === 0) && (
                                    <div className="px-3 py-4 text-center text-sm text-neutral-400">
                                        {searchQuery.trim() || searching
                                            ? 'Searching…'
                                            : library.type === 'movie'
                                                ? 'Loading movies…'
                                                : library.type === 'show'
                                                    ? 'Loading episodes…'
                                                    : 'Loading items…'}
                                    </div>
                                )}

                                {(pageTransitionLoading || pageLoading) && (
                                    <div className="px-3 py-4 text-center text-sm text-neutral-400">
                                        {library.type === 'movie'
                                            ? 'Loading more movies…'
                                            : library.type === 'show'
                                            ? 'Loading more episodes…'
                                            : 'Loading more items…'}
                                    </div>
                                )}

                                {!pageTransitionLoading && !pageLoading && displayRows.length > 0 && (
                                    <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 lg:grid-cols-3">
                                        {pageRows.map((r) => {
                                            const movieItem = r.kind === "movie" ? (r.metadata as MovieItem) : null;
                                            const episodeItem = r.kind === "episode" ? (r.metadata as EpisodeItem) : null;
                                            const isCompliant = r.flags.includes("already-compliant");
                                            const visibleFlags = r.flags.filter((f) => f !== "already-compliant");

                                            return (
                                                <li key={r.id} className="flex items-start gap-4 rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3">
                                                    {/* Plex Poster Area */}
                                                    <div className="flex-shrink-0">
                                                        <div className="w-16 h-24 bg-neutral-700 rounded-md flex items-center justify-center text-neutral-400 text-xs overflow-hidden">
                                                            {movieItem?.cachedPosterUrl || episodeItem?.cachedPosterUrl ? (
                                                                <img
                                                                    src={movieItem?.cachedPosterUrl || episodeItem?.cachedPosterUrl}
                                                                    alt={`${movieItem?.title || episodeItem?.showTitle} poster`}
                                                                    className="w-full h-full object-cover rounded-md"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.style.display = 'none';
                                                                        target.parentElement!.innerHTML = 'Poster';
                                                                        target.parentElement!.className = 'w-16 h-24 bg-neutral-700 rounded-md flex items-center justify-center text-neutral-400 text-xs';
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div>Poster</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Item Information */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    {/* Status indicator - moved before title */}
                                                                    {r.status === "good" && <IconStatusGood className="w-4 h-4 text-green-500 flex-shrink-0" />}
                                                                    {r.status === "warning" && <IconStatusWarning className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                                                                    {r.status === "error" && <IconStatusError className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                                                    {r.status === "unmatched" && <IconQuestionCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                                                    {isCompliant && (
                                                                        <span className="text-neutral-400" title="Already compliant with current template/settings (no change)">
                                                                            <IconBadgeCheck className="w-4 h-4 flex-shrink-0" />
                                                                        </span>
                                                                    )}
                                                                    {/* Title with white/gray styling */}
                                                                    <div className="font-medium truncate">
                                                                        <span className="text-white">
                                                                            {r.kind === "movie" ? movieItem?.title : episodeItem?.showTitle}
                                                                        </span>
                                                                        {r.kind === "episode" && episodeItem && episodeItem.title !== "Episode" && episodeItem.title !== episodeItem.showTitle && (
                                                                            <span className="text-neutral-400 ml-1">- {episodeItem.title}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2">
                                                                <Toggle checked={selectedIds.has(r.id)} onChange={() => onToggle(r.id)}/>
                                                                {r.kind === "movie" && (
                                                                    <button
                                                                        onClick={() => onTestMoviePathScan(r)}
                                                                        disabled={moviePathScanInProgressId === r.id}
                                                                        className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                                                                        title="Trigger Plex rescan for this movie folder"
                                                                    >
                                                                        <IconRefresh className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {r.kind === "episode" && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => onTestEpisodePathScan(r)}
                                                                            disabled={episodePathScanInProgressId === r.id}
                                                                            className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                                                                            title="Trigger Plex rescan for this episode folder"
                                                                        >
                                                                            <IconRefresh className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => onTestShowPathScan(r)}
                                                                            disabled={showPathScanInProgressId === (currentShow?.ratingKey ?? r.id)}
                                                                            className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
                                                                            title="Trigger Plex rescan for the current show folder"
                                                                        >
                                                                            Show
                                                                        </button>
                                                                    </>
                                                                )}
                                                                <button
                                                                    onClick={() => onSetEditingItem(r)}
                                                                    className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors"
                                                                    title="Edit metadata"
                                                                >
                                                                    <IconEdit className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1 text-sm">
                                                            {/* Movie/TV details */}
                                                            {movieItem && (
                                                                <>
                                                                    {/* Year / Genre / Studio on one line */}
                                                                    <div className="flex items-center gap-2 text-neutral-400">
                                                                        {movieItem.year && <span className="text-xs">({movieItem.year})</span>}
                                                                        {movieItem.genre && <span className="px-2 py-0.5 bg-neutral-700 rounded text-xs">{movieItem.genre}</span>}
                                                                        {movieItem.studio && <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">{movieItem.studio}</span>}
                                                                    </div>
                                                                    {movieItem.director && (
                                                                        <div className="text-neutral-500">
                                                                            <span className="text-xs text-neutral-400">Director: </span>
                                                                            <span className="text-xs">{movieItem.director}</span>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                            {episodeItem && (
                                                                <>
                                                                    {/* Year and Season/Episode on same line */}
                                                                    <div className="flex items-center gap-2 text-neutral-400">
                                                                        {episodeItem.year && <span className="text-xs">({episodeItem.year})</span>}
                                                                        {episodeItem.season && episodeItem.index && (
                                                                            <span className="px-2 py-0.5 bg-neutral-700 rounded text-xs">S{episodeItem.season.toString().padStart(2, '0')}E{episodeItem.index.toString().padStart(2, '0')}</span>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* Current path (compact) */}
                                                            <div className="text-xs text-neutral-500 truncate" title={r.filePath}>
                                                                {shortenFilePath(r.filePath, library.roots || [])}
                                                            </div>

                                                            {/* Proposed path (compact) */}
                                                            <div className={`text-xs truncate ${isCompliant ? "text-neutral-500" : "text-neutral-400"}`} title={r.proposed}>
                                                                → {r.proposed}
                                                            </div>

                                                            {/* Flags */}
                                                            {visibleFlags.length > 0 && (
                                                                <div className="text-xs text-neutral-500">
                                                                    Issues: {visibleFlags.join(", ")}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Subtitle indicator - compact icon only */}
                                                        {r.subtitleOperations && r.subtitleOperations.length > 0 && (
                                                            <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400" title={`${r.subtitleOperations.length} subtitle operation${r.subtitleOperations.length > 1 ? 's' : ''}`}>
                                                                <span className="text-neutral-500">📝</span>
                                                                <span>{r.subtitleOperations.length}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {!loading && !previewLoading && !searching && displayRows.length === 0 && (
                                    <p className="px-3 py-2 text-neutral-400">No items to preview.</p>
                                )}
                            </div>
                        );
                    }
                })()}

                {/* Library info and folder mapping helper */}
                <div className="mt-3 flex items-center justify-between text-sm text-neutral-300">
                    <div className="text-neutral-300">
                        <span className="text-neutral-400">
                            Server: <span className="text-neutral-200">{server.name}</span> — Library: <span className="text-neutral-200">{library.title}</span>
                            {currentShow && (
                                <>
                                    {" "}— Show: <span className="text-neutral-200">{currentShow.title}</span>
                                </>
                            )}
                            {" "}— Local folder:
                        </span>{" "}
                        <span className="text-neutral-200">{libraryFolder ?? "Not mapped"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onSetShowMapModal(true)}
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
                            <Select
                                value={pageSize}
                                onChange={(value) => { onSetPage(1); onSetPageSize(value); }}
                                options={[
                                    { value: 10, label: "10" },
                                    { value: 25, label: "25" },
                                    { value: 50, label: "50" },
                                    { value: 100, label: "100" }
                                ]}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span>{displayRows.length} results • Page {page} / {totalPages}</span>
                            <button className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-50" disabled={page <= 1}
                                    onClick={() => onSetPage(Math.max(1, page - 1))}>Prev
                            </button>
                            <button className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-50" disabled={page >= totalPages}
                                    onClick={() => onSetPage(Math.min(totalPages, page + 1))}>Next
                            </button>
                        </div>
                    </div>
                )}
            </section>
            {showMapModal && (
                <PathMappingModal
                    serverId={generateServerId(server)}
                    libraries={[{ ...library, roots: library.roots || [] }]}
                    onClose={() => onSetShowMapModal(false)}
                    onSaved={onRefreshPathMappings}
                />
            )}
            {showTemplateHelp && (
                <TemplateHelpModal
                    libraryType={library.type as "movie" | "show" | "artist"}
                    onClose={() => onSetShowTemplateHelp(false)}
                />
            )}

            {/* Edit Metadata Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onSetEditingItem(null)}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-neutral-100">Edit Metadata</h3>
                            <button
                                onClick={() => onSetEditingItem(null)}
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
                                onClick={() => onSetEditingItem(null)}
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
                                        onUpdateSettings(updatedSettings);

                                        // Force refresh of preview to show updated proposal
                                        onSetReloadTick((prev: number) => prev + 1);
                                    }

                                    onSetEditingItem(null);
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

            {/* Undo Confirmation Modal */}
            {showUndoConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10000 }}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 shadow-2xl max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-neutral-100">Confirm Undo</h3>
                        </div>
                        <p className="text-neutral-300 mb-6">
                            This will undo the last rename operation. This action cannot be undone. Continue?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={onUndoCancel}
                                className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onUndoConfirm}
                                className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded"
                            >
                                Undo Last Rename
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Apply progress overlay */}
            {applyInProgress && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex: 12000 }}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-6 py-5 max-w-sm w-full mx-4">
                        <h3 className="text-lg font-semibold text-neutral-100 mb-2">Applying renames…</h3>
                        <p className="text-sm text-neutral-300 mb-3">
                            {applyOperationCount > 0
                                ? `Processing ${applyOperationCount} filesystem operations (videos and subtitles).`
                                : "Processing filesystem operations (videos and subtitles)."}
                        </p>
                        <div className="h-2 w-full bg-neutral-800 rounded">
                            <div className="h-2 w-full bg-cyan-600 rounded" />
                        </div>
                        <p className="mt-3 text-xs text-neutral-500">
                            This may take a moment. Please keep Name‑o‑Tron 9000 open until it completes.
                        </p>
                    </div>
                </div>
            )}

            {/* Apply summary + remove empty folders modal */}
            {lastApplySummary && !applyInProgress && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex: 12000 }}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-6 py-5 max-w-lg w-full mx-4">
                        <h3 className="text-lg font-semibold text-neutral-100 mb-3">Rename summary</h3>
                        <p className="text-sm text-neutral-300 mb-1">
                            Operations applied: <span className="font-semibold text-neutral-100">{lastApplySummary.operationsApplied}</span>
                        </p>
                        <p className="text-sm text-neutral-300 mb-3">
                            Operations failed: <span className="font-semibold text-neutral-100">{lastApplySummary.operationsFailed}</span>
                        </p>
                        <p className="text-xs text-neutral-400 mb-4">
                            Rollback log: <span className="font-mono break-all">{lastApplySummary.rollbackLogPath}</span>
                        </p>
                        {lastApplySummary.refreshWarnings.length > 0 && (
                            <div className="mb-4 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                                <div className="mb-1 font-semibold">Plex refresh warnings</div>
                                {lastApplySummary.refreshWarnings.slice(0, 4).map((warning, index) => (
                                    <div key={index}>• {warning}</div>
                                ))}
                                {lastApplySummary.refreshWarnings.length > 4 && (
                                    <div>• …and {lastApplySummary.refreshWarnings.length - 4} more warnings</div>
                                )}
                            </div>
                        )}

                        <div className="border-t border-neutral-800 pt-3 mt-2">
                            <h4 className="text-sm font-semibold text-neutral-100 mb-2">Remove empty folders?</h4>
                            <p className="text-sm text-neutral-300 mb-3">
                                You can clean up folders that became completely empty as a result of this rename batch. Only truly empty
                                directories under the affected library paths will be removed.
                            </p>
                            <div className="flex items-center gap-3">
                                {!cleanupResult && (
                                    <button
                                        type="button"
                                        onClick={onRemoveEmptyFolders}
                                        disabled={cleanupInProgress}
                                        className="px-4 py-2 text-sm rounded-md bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
                                    >
                                        {cleanupInProgress ? "Removing empty folders…" : "Remove empty folders"}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={onCloseApplySummary}
                                    className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                >
                                    Close
                                </button>
                            </div>

                            {cleanupResult && (
                                <div className="mt-3 text-xs text-neutral-300">
                                    <p className="mb-1">
                                        Removed folders:{" "}
                                        <span className="font-semibold">
                                            {cleanupResult.removed_directories.length}
                                        </span>
                                    </p>
                                    {cleanupResult.errors.length > 0 && (
                                        <div className="mt-1 text-red-300">
                                            {cleanupResult.errors.slice(0, 3).map((err, idx) => (
                                                <div key={idx}>• {err}</div>
                                            ))}
                                            {cleanupResult.errors.length > 3 && (
                                                <div>• …and more errors (see logs)</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Result Modal */}
            {renameResultModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                renameResultModal.success && renameResultModal.operations_failed === 0
                                    ? 'bg-green-500/20'
                                    : renameResultModal.operations_failed > 0
                                    ? 'bg-amber-500/20'
                                    : 'bg-red-500/20'
                            }`}>
                                {renameResultModal.success && renameResultModal.operations_failed === 0 ? (
                                    <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : renameResultModal.operations_failed > 0 ? (
                                    <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">
                                    {renameResultModal.success && renameResultModal.operations_failed === 0
                                        ? "Rename Completed"
                                        : renameResultModal.operations_failed > 0
                                        ? "Rename Completed with Issues"
                                        : "Rename Failed"}
                                </h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <div className="mb-6 space-y-3 text-neutral-200">
                            <div className="flex items-center justify-between">
                                <span>Operations applied:</span>
                                <span className="text-green-400 font-medium">{renameResultModal.operations_applied}</span>
                            </div>
                            {renameResultModal.operations_failed > 0 && (
                                <div className="flex items-center justify-between">
                                    <span>Operations failed:</span>
                                    <span className="text-red-400 font-medium">{renameResultModal.operations_failed}</span>
                                </div>
                            )}

                            {renameResultModal.rollback_log_path && (
                                <div className="pt-2 border-t border-neutral-700">
                                    <div className="text-sm text-neutral-300 mb-1">Rollback log saved:</div>
                                    <div className="text-xs font-mono bg-neutral-800 px-2 py-1 rounded text-neutral-300 break-all">
                                        {renameResultModal.rollback_log_path}
                                    </div>
                                </div>
                            )}

                            {renameResultModal.errors && renameResultModal.errors.length > 0 && (
                                <div className="pt-2 border-t border-neutral-700">
                                    <div className="text-sm text-neutral-300 mb-2">Error details:</div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {renameResultModal.errors.slice(0, 5).map((error, index) => (
                                            <div key={index} className="text-xs text-red-300 font-mono bg-neutral-800 px-2 py-1 rounded">
                                                {error}
                                            </div>
                                        ))}
                                        {renameResultModal.errors.length > 5 && (
                                            <div className="text-xs text-neutral-400">
                                                …and {renameResultModal.errors.length - 5} more errors
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={onCloseRenameResultModal}
                                className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Undo Result Modal */}
            {undoResultModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                undoResultModal.success && undoResultModal.operations_failed === 0
                                    ? 'bg-green-500/20'
                                    : undoResultModal.operations_failed > 0
                                    ? 'bg-amber-500/20'
                                    : 'bg-red-500/20'
                            }`}>
                                {undoResultModal.success && undoResultModal.operations_failed === 0 ? (
                                    <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                ) : undoResultModal.operations_failed > 0 ? (
                                    <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">
                                    {undoResultModal.success && undoResultModal.operations_failed === 0
                                        ? "Undo Completed"
                                        : undoResultModal.operations_failed > 0
                                        ? "Undo Completed with Issues"
                                        : "Undo Failed"}
                                </h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <div className="mb-6 space-y-3 text-neutral-200">
                            <div className="flex items-center justify-between">
                                <span>Operations undone:</span>
                                <span className="text-green-400 font-medium">{undoResultModal.operations_applied}</span>
                            </div>
                            {undoResultModal.operations_failed > 0 && (
                                <div className="flex items-center justify-between">
                                    <span>Operations failed:</span>
                                    <span className="text-red-400 font-medium">{undoResultModal.operations_failed}</span>
                                </div>
                            )}

                            {undoResultModal.rollback_log_path && (
                                <div className="pt-2 border-t border-neutral-700">
                                    <div className="text-sm text-neutral-300 mb-1">Rollback log saved:</div>
                                    <div className="text-xs font-mono bg-neutral-800 px-2 py-1 rounded text-neutral-300 break-all">
                                        {undoResultModal.rollback_log_path}
                                    </div>
                                </div>
                            )}

                            {undoResultModal.errors && undoResultModal.errors.length > 0 && (
                                <div className="pt-2 border-t border-neutral-700">
                                    <div className="text-sm text-neutral-300 mb-2">Error details:</div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {undoResultModal.errors.slice(0, 5).map((error, index) => (
                                            <div key={index} className="text-xs text-red-300 font-mono bg-neutral-800 px-2 py-1 rounded">
                                                {error}
                                            </div>
                                        ))}
                                        {undoResultModal.errors.length > 5 && (
                                            <div className="text-xs text-neutral-400">
                                                …and {undoResultModal.errors.length - 5} more errors
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {undoResultModal.refreshWarnings && undoResultModal.refreshWarnings.length > 0 && (
                                <div className="pt-2 border-t border-neutral-700">
                                    <div className="text-sm text-neutral-300 mb-2">Plex refresh warnings:</div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {undoResultModal.refreshWarnings.slice(0, 5).map((warning, index) => (
                                            <div key={index} className="text-xs text-amber-300 font-mono bg-neutral-800 px-2 py-1 rounded">
                                                {warning}
                                            </div>
                                        ))}
                                        {undoResultModal.refreshWarnings.length > 5 && (
                                            <div className="text-xs text-neutral-400">
                                                …and {undoResultModal.refreshWarnings.length - 5} more warnings
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={onCloseUndoResultModal}
                                className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Export Modal */}
            {previewExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                previewExportModal.success ? 'bg-green-500/20' : 'bg-red-500/20'
                            }`}>
                                {previewExportModal.success ? (
                                    <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">
                                    {previewExportModal.success ? "Preview Snapshot Saved" : "Export Failed"}
                                </h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <div className="mb-6 text-neutral-200">
                            {previewExportModal.success && previewExportModal.path ? (
                                <div>
                                    <div className="text-sm mb-2">Snapshot saved to:</div>
                                    <div className="text-xs font-mono bg-neutral-800 px-3 py-2 rounded text-neutral-300 break-all">
                                        {previewExportModal.path}
                                    </div>
                                    <div className="mt-3 text-xs text-neutral-400">
                                        This file contains your current preview state and can be used for debugging or backup purposes.
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="text-sm mb-2">Export failed:</div>
                                    <div className="text-sm text-red-300">
                                        {previewExportModal.error || "Unknown error occurred"}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            {previewExportModal.success && previewExportModal.path && (
                            <button
                                onClick={async () => {
                                    try {
                                        // Open the folder containing the exported file
                                        const path = previewExportModal.path!;
                                        const dirPath = path.substring(0, path.lastIndexOf('/') + 1) || path.substring(0, path.lastIndexOf('\\') + 1) || path;
                                        await revealItemInDir(dirPath);
                                    } catch (error) {
                                        console.error("Failed to open folder:", error);
                                    }
                                }}
                                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                            >
                                Open Folder
                            </button>
                            )}
                            <button
                                onClick={onClosePreviewExportModal}
                                className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
