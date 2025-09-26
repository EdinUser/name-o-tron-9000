import {useEffect, useMemo, useState} from "react";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconBolt, IconSelectOff, IconSettings} from "../components/icons";
import {loadSettings} from "../state/settings";

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
};

type EpisodeItem = {
    type: "episode";
    ratingKey: string;
    showTitle: string;
    title: string;
    season?: number;
    index?: number; // episode number
    file: string;
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

function computeMovieProposal(m: MovieItem, opts: { ownFolder: boolean }): PreviewRow {
    const ext = extname(m.file) || ".mkv";
    let proposed = `${m.title}${m.year ? ` (${m.year})` : ""}`;
    // ISO/disc images marker per settings
    if (ext.toLowerCase() === ".iso") proposed += " [ISO]";
    const baseName = proposed + ext;
    let path = baseName;
    if (opts.ownFolder) {
        const folder = safeFolderName(proposed);
        path = `${folder}/${baseName}`;
    }
    proposed = normalizeUnicode(path);
    const flags: string[] = [];
    const {ok, reason} = sanitizeProposal(baseName);
    let status: PreviewRow["status"] = "green";
    if (!VIDEO_EXTS.has(ext)) {
        status = "yellow";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "red";
        if (reason) flags.push(reason);
    }
    const highlight = loadSettings().general.encoding.highlightNonLatin;
    if (highlight && hasNonLatin(proposed) && status !== "red") {
        status = status === "green" ? "yellow" : status;
        flags.push("non-latin");
    }
    if (m.file.length > 255) {
        status = "red";
        flags.push(">255 path");
    } else if (m.file.length > 200 && status !== "red") {
        status = "yellow";
        flags.push(">200 path");
    }
    return {id: m.ratingKey, kind: "movie", filePath: m.file, proposed, status, flags};
}

function computeEpisodeProposal(e: EpisodeItem): PreviewRow {
    const ext = extname(e.file) || ".mkv";
    let se = "S00E00";
    if (typeof e.season === "number" && typeof e.index === "number") {
        const s = String(e.season).padStart(2, "0");
        const ep = String(e.index).padStart(2, "0");
        se = `S${s}E${ep}`;
    }
    let fileName = `${e.showTitle} - ${se} - ${e.title}${ext}`;
    const s = loadSettings();
    let proposedPath = fileName;
    if (s.tv.seasonFolders) {
        const seasonLabel = typeof e.season === "number" ? `Season ${String(e.season).padStart(2, "0")}` : "Season 00";
        proposedPath = `${safeFolderName(e.showTitle)}/${seasonLabel}/${fileName}`;
    }
    const proposed = normalizeUnicode(proposedPath);
    const flags: string[] = [];
    const {ok, reason} = sanitizeProposal(proposed);
    let status: PreviewRow["status"] = "green";
    if (!VIDEO_EXTS.has(ext)) {
        status = "yellow";
        flags.push("non-media-ext");
    }
    if (!ok) {
        status = "red";
        if (reason) flags.push(reason);
    }
    const highlight2 = loadSettings().general.encoding.highlightNonLatin;
    if (highlight2 && hasNonLatin(proposed) && status !== "red") {
        status = status === "green" ? "yellow" : status;
        flags.push("non-latin");
    }
    if (e.file.length > 255) {
        status = "red";
        flags.push(">255 path");
    } else if (e.file.length > 200 && status !== "red") {
        status = "yellow";
        flags.push(">200 path");
    }
    return {id: e.ratingKey, kind: "episode", filePath: e.file, proposed, status, flags};
}

export default function Preview({server, library, onBack}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<PreviewRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const url = `${server.address}/library/sections/${library.key}/all`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: SectionResponse = await res.json();

                const list: PreviewRow[] = [];
                const mc = data?.MediaContainer;
                const md = mc?.Metadata ?? [];

                if (library.type === "movie") {
                    for (const item of md) {
                        const file = item?.Media?.[0]?.Part?.[0]?.file;
                        if (!file) continue;
                        const m: MovieItem = {
                            type: "movie",
                            ratingKey: String(item.ratingKey ?? item.key ?? file),
                            title: String(item.title ?? "Unknown"),
                            year: item.year ? Number(item.year) : undefined,
                            file: String(file),
                        };
                        const s = loadSettings();
                        list.push(computeMovieProposal(m, {ownFolder: !!s.movies.ownFolderPerMovie}));
                    }
                } else if (library.type === "show") {
                    for (const show of md) {
                        const showTitle = String(show.title ?? "Unknown Show");
                        const children = show.children ?? [];
                        for (const season of children) {
                            const seasonNum = parseInt(String(season.title).replace(/[^0-9]/g, "")) || undefined;
                            const eps = season.Episode ?? [];
                            for (const ep of eps) {
                                const file = ep?.Media?.[0]?.Part?.[0]?.file;
                                if (!file) continue;
                                const e: EpisodeItem = {
                                    type: "episode",
                                    ratingKey: String(ep.ratingKey ?? ep.key ?? file),
                                    showTitle,
                                    title: String(ep.title ?? "Episode"),
                                    season: seasonNum,
                                    index: typeof ep.index === "number" ? ep.index : undefined,
                                    file: String(file),
                                };
                                list.push(computeEpisodeProposal(e));
                            }
                        }
                    }
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
    }, [server.address, library.key, library.type]);

    const anyRedSelected = useMemo(() => rows.some(r => r.status === "red" && selectedIds.has(r.id)), [rows, selectedIds]);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [rows, page, pageSize]);
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

    // no column resizing; using fluid CSS grid columns

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconArrowBack className="h-5 w-5"/>
                            Back
                        </button>
                        <span className="hidden md:inline">Library: {library.title} — Server: {server.name}</span>
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
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                    </div>
                </div>
            </header>

            <section className="mx-auto max-w-6xl px-6 py-6">
                {loading && <p className="text-center text-neutral-400">Loading preview…</p>}
                {error && <p className="text-center text-red-300">Error: {error}</p>}

                {!loading && !error && (
                    <div className="overflow-auto rounded-xl border border-neutral-800">
                        <div className="grid items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm font-semibold"
                             style={{gridTemplateColumns: "28px minmax(240px,1.5fr) minmax(240px,1.5fr) 120px minmax(160px,1fr)"}}>
                            <div/>
                            <div>Current</div>
                            <div>Proposed</div>
                            <div>Status</div>
                            <div>Flags</div>
                        </div>
                        {pageRows.map((r) => (
                            <div key={r.id} className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-800/40"
                                 style={{gridTemplateColumns: "28px minmax(240px,1.5fr) minmax(240px,1.5fr) 120px minmax(160px,1fr)"}}>
                                <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-cyan-500"/>
                                <div className="truncate" title={r.filePath}>{r.filePath}</div>
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
                        {rows.length === 0 && <p className="px-3 py-2 text-neutral-400">No items to preview.</p>}
                    </div>
                )}

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
                            <span>Page {page} / {totalPages}</span>
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
        </main>
    );
}
