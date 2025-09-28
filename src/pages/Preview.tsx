import {useEffect, useMemo, useRef, useState} from "react";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconBolt, IconHome, IconSelectOff, IconSettings} from "../components/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {loadSettings, saveSettings} from "../state/settings";
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

function normalizeShowTitle(raw: string) {
    return raw.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
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

function computeMovieProposal(m: MovieItem, template: string): PreviewRow {
    const ext = extname(m.file) || ".mkv";
    // Base context for movies
    const ctx = {
        title: m.title,
        year: m.year ?? "",
        ext,
    } as any;
    let proposed = renderTemplate(template, ctx);
    if (!proposed.endsWith(ext)) proposed += ext; // safety net if template omitted {ext}
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
    const highlight = loadSettings().general.encoding.highlightNonLatin;
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

function computeEpisodeProposal(e: EpisodeItem, template: string, useSeasonFolders: boolean): PreviewRow {
    const ext = extname(e.file) || ".mkv";
    const ctx = {
        showTitle: e.showTitle,
        title: e.title,
        season: typeof e.season === "number" ? e.season : 0,
        episode: typeof e.index === "number" ? e.index : 0,
        ext,
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
    const highlight2 = loadSettings().general.encoding.highlightNonLatin;
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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<PreviewRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [colWidths, setColWidths] = useState<{ current: number; proposed: number; flags: number }>({ current: 480, proposed: 480, flags: 320 });
    const [template, setTemplate] = useState<string>(() => {
        const s = loadSettings();
        return library.type === "movie" ? s.templates.movie : s.templates.episode;
    });

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
                        const tpl = s.templates.movie || template;
                        list.push(computeMovieProposal(m, tpl));
                    }
                } else if (library.type === "show") {
                    const hasChildren = md.some((it: any) => Array.isArray(it?.children));
                    if (hasChildren) {
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
                                    const s = loadSettings();
                                    const tpl = s.templates.episode || template;
                                    list.push(computeEpisodeProposal(e, tpl, !!s.tv.seasonFolders));
                                }
                            }
                        }
                    } else {
                        // Flat list of episodes under Metadata
                        for (const item of md) {
                            const file = item?.Media?.[0]?.Part?.[0]?.file;
                            if (!file) continue;
                            const parsed = parseEpisodeInfo(String(file), String(item.title ?? "Episode"));
                            const e: EpisodeItem = {
                                type: "episode",
                                ratingKey: String(item.ratingKey ?? item.key ?? file),
                                showTitle: parsed.showTitle,
                                title: String(item.title ?? "Episode"),
                                season: parsed.season,
                                index: parsed.index,
                                file: String(file),
                            };
                            const s = loadSettings();
                            const tpl = s.templates.episode || template;
                            list.push(computeEpisodeProposal(e, tpl, !!s.tv.seasonFolders));
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
    }, [server.address, library.key, library.type, template]);

    // Live recompute when template changes
    useEffect(() => {
        if (rows.length === 0) return;
        // Trigger a re-load to recompute proposals with full metadata
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template]);

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
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
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
                        <input
                            value={template}
                            onChange={(e) => {
                                const next = e.target.value;
                                setTemplate(next);
                                const s = loadSettings();
                                const updated = {
                                    ...s,
                                    templates: {
                                        ...s.templates,
                                        [library.type === "movie" ? "movie" : "episode"]: next,
                                    }
                                } as any;
                                saveSettings(updated);
                            }}
                            placeholder={library.type === "movie" ? "Movie template" : "Episode template"}
                            className="w-[420px] rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const def = library.type === "movie"
                              ? "{title}[ ({year})]{ext}"
                              : "{showTitle} - S{season:02}E{episode:02} - {title}{ext}";
                            setTemplate(def);
                            const s = loadSettings();
                            const updated = {
                              ...s,
                              templates: {
                                ...s.templates,
                                [library.type === "movie" ? "movie" : "episode"]: def,
                              }
                            } as any;
                            saveSettings(updated);
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
                <div className="mb-2 text-sm text-neutral-400">Library: <span className="text-neutral-200">{library.title}</span> — Server: <span className="text-neutral-200">{server.name}</span></div>
                {loading && <p className="text-center text-neutral-400">Loading preview…</p>}
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
