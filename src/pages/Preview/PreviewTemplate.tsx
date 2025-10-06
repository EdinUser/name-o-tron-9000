// Components
import {IconArrowBack, IconBolt, IconEdit, IconHome, IconInfo, IconQuestionCircle, IconRefresh, IconSelectOff, IconSettings, IconSearch, IconStatusGood, IconStatusWarning, IconStatusError, IconSun, IconMoon} from "../../components/icons";
import Select from "../../components/Select";
import PathMappingModal from "../../components/PathMappingModal";
import TemplateHelpModal from "../../components/TemplateHelpModal";
import PlexPopoverCard from "../../components/PlexPopoverCard";
import Toggle from "../../components/Toggle";

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
    editingItem: PreviewRow | null;
    popoverData: { metadata: any; position: { x: number; y: number } };
    searchQuery: string;
    statusFilter: string;
    resolvedTheme: string;
    containerRef: React.RefObject<HTMLDivElement>;
    onBack: () => void;
    onToggle: (id: string) => void;
    onSkipReds: () => void;
    onApplyRename: () => void;
    onUndoLastRename: () => void;
    onSetSearchQuery: (query: string) => void;
    onSetStatusFilter: (filter: string) => void;
    onSetPage: (page: number) => void;
    onSetPageSize: (size: number) => void;
    onSetShowMapModal: (show: boolean) => void;
    onSetShowTemplateHelp: (show: boolean) => void;
    onSetEditingItem: (item: PreviewRow | null) => void;
    onStartResize: (which: "current" | "proposed", ev: React.MouseEvent) => void;
    onHandleMouseEnter: (event: React.MouseEvent<HTMLDivElement>, row: PreviewRow) => void;
    onHandleMouseLeave: () => void;
    onRefreshPathMappings: () => void;
    onToggleTheme: () => void;
    onUpdateSettings: (settings: any) => void;
    onSetReloadTick: (fn: (prev: number) => number) => void;
    settings: any;
    onLoadMoreMovies: () => void;
    onLoadMoreMusic: () => void;
    onLoadMoreEpisodes: () => void;
};

export default function PreviewTemplate({
    server,
    library,
    currentShow,
    loading,
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
    editingItem,
    popoverData,
    searchQuery,
    statusFilter,
    resolvedTheme,
    containerRef,
    onBack,
    onToggle,
    onSkipReds,
    onApplyRename,
    onUndoLastRename,
    onSetSearchQuery,
    onSetStatusFilter,
    onSetPage,
    onSetPageSize,
    onSetShowMapModal,
    onSetShowTemplateHelp,
    onSetEditingItem,
    onStartResize,
    onHandleMouseEnter,
    onHandleMouseLeave,
    onRefreshPathMappings,
    onToggleTheme,
    onUpdateSettings,
    onSetReloadTick,
    settings,
    onLoadMoreMovies,
    onLoadMoreMusic,
    onLoadMoreEpisodes,
}: TemplateProps) {
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
                                onUpdateSettings(updated);
                            }}
                            placeholder={
                                library.type === "movie" ? "Movie template" :
                                library.type === "show" ? "Episode template" : "Music template"
                            }
                            className="w-[380px] rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                        />
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
                            const templateKey = library.type === "movie" ? "movie" :
                                               library.type === "show" ? "episode" : "music";
                            const updated = {
                              ...settings,
                              templates: {
                                ...settings.templates,
                                [templateKey]: def,
                              }
                            } as any;
                            onUpdateSettings(updated);
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
                        <button title="Reload library" onClick={() => onSetReloadTick((prev: number) => prev + 1)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconRefresh className="h-5 w-5"/>
                            Reload
                        </button>

                        {/* Load more buttons */}
                        {library.type === "movie" && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onLoadMoreMovies}
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

                        {library.type === "artist" && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onLoadMoreMusic}
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

                        {library.type === "show" && currentShow && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onLoadMoreEpisodes}
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
                        {searchQuery.trim() || searching ? 'Searching…' : 'Loading preview…'}
                    </p>
                )}
                {error && <p className="text-center text-red-300">Error: {error}</p>}

                {!loading && !error && (
                    <div ref={containerRef} className="overflow-auto rounded-xl border border-neutral-800">
                        <div className="grid items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm font-semibold" style={{gridTemplateColumns: gridTemplate}}>
                            <div/>
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
                        {pageRows.map((r) => (
                            <div
                                key={r.id}
                                className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-50/40"
                                style={{gridTemplateColumns: gridTemplate}}
                                >
                                    <Toggle checked={selectedIds.has(r.id)} onChange={() => onToggle(r.id)}/>
                                    <div
                                        className="truncate cursor-pointer hover:bg-neutral-700/50 dark:hover:bg-neutral-700/50 light:hover:bg-neutral-100/50 rounded px-1 py-0.5 transition-colors"
                                        title={r.filePath}
                                        onMouseEnter={(e) => onHandleMouseEnter(e, r)}
                                        onMouseLeave={onHandleMouseLeave}
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
                                        onClick={() => onSetEditingItem(r)}
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
                            <div className="inline-block">
                                <select value={pageSize} onChange={(e) => { onSetPage(1); onSetPageSize(parseInt(e.target.value)); }}
                                        className="appearance-none px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-cyan-600/40 hover:bg-neutral-700 pr-7">
                                    {[10, 25, 50, 100].map(n => <option key={n} value={n} className="bg-neutral-800 text-neutral-200">{n}</option>)}
                                </select>
                                <span className="pointer-events-none -ml-6 text-neutral-400">▾</span>
                            </div>
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
                    serverId={server.machineIdentifier || server.address}
                    plexRoots={library.roots || []}
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
        </main>
    );
}
