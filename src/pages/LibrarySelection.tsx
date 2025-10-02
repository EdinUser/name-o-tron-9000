import {useEffect, useState} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {invoke} from "@tauri-apps/api/core";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconArrowForward, IconHome, IconInfo, IconOpenInNew, IconServer, IconSettings, IconBadgeCheck, IconBadgeAlert} from "../components/icons";
import PathMappingModal from "../components/PathMappingModal";

type Props = {
    server: PlexServer;
    onBack: () => void;
    onSelectLibrary: (library: PlexLibrary) => void;
};


export default function LibrarySelection({server, onBack, onSelectLibrary}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
    const [allLibraries, setAllLibraries] = useState<PlexLibrary[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [mapped, setMapped] = useState<Record<string, boolean>>({});
    const [showMapModal, setShowMapModal] = useState(false);

    useEffect(() => { try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Libraries"); } catch {} }, []);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                let token: string | null = null;
                try { token = localStorage.getItem("plexToken"); } catch {}

                const libs = await invoke<Array<{key: string; type: string; title: string; roots?: string[]}>>("list_libraries", {
                    server: server.address,
                    token: token ?? null,
                });
                const all: PlexLibrary[] = (libs || []).map(d => ({ key: String(d.key), type: String(d.type) as any, title: String(d.title), roots: Array.isArray((d as any).roots) ? (d as any).roots : [] }));
                setAllLibraries(all);
                await refreshMappingStatus(all);
                setLibraries(all);
                setSelectedIdx(all.length ? 0 : null);
            } catch (e: any) {
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [server.address]);

    const selected = selectedIdx != null ? libraries[selectedIdx] : null;

    async function refreshMappingStatus(all: PlexLibrary[] | null = allLibraries) {
        if (!all) return;
        try {
            const settings = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
            const serverId = server.machineIdentifier || server.address;
            const mappedRoots = new Set((settings.pathMappings || []).filter(m => m.server_id === serverId).map(m => m.plex_root));
            const status: Record<string, boolean> = {};
            for (const lib of all) {
                const roots = lib.roots || [];
                status[lib.key] = roots.length > 0 && roots.some(r => mappedRoots.has(r));
            }
            setMapped(status);
        } catch {
            const status: Record<string, boolean> = {};
            for (const lib of all) status[lib.key] = false;
            setMapped(status);
        }
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconArrowBack className="h-5 w-5"/>
                            Back
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="group relative">
                            <IconInfo className="h-5 w-5 text-neutral-400 hover:text-neutral-200 cursor-help"/>
                            <div className="invisible group-hover:visible absolute right-0 mt-2 w-64 rounded-md bg-neutral-800 p-3 text-sm text-neutral-200 shadow-lg z-20">
                                <div className="flex items-center gap-2">
                                    <IconServer className="h-4 w-4 flex-shrink-0"/>
                                    <span>Server: {server.name} ({server.address})</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" onClick={() => (window as any).__goto_home?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconHome className="h-5 w-5"/>
                            Home
                        </button>
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                    </div>
                </div>
            </header>

            <section className="mx-auto max-w-5xl px-6 py-8">
                <h1 className="mb-4 text-center text-2xl font-bold">Select Library</h1>

                {loading && <p className="text-center text-neutral-400">Loading libraries…</p>}
                {error && <p className="text-center text-red-300">Error: {error}</p>}

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <IconServer className="h-5 w-5 text-cyan-300"/>
                            <h2 className="text-lg font-semibold">Libraries</h2>
                        </div>
                        <button onClick={() => setShowMapModal(true)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">Map Paths</button>
                    </div>
                    {libraries.length === 0 && !loading && !error && (
                        <div className="text-neutral-400">No libraries found.</div>
                    )}
                    {libraries.length > 0 && (
                        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                            {libraries.map((lib, i) => (
                                <li key={`${lib.key}-${i}`} className={`rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700 ${selectedIdx === i ? "ring-1 ring-cyan-500/50" : ""}`}>
                                    <div className="flex items-center justify-between">
                                        <label className="flex cursor-pointer items-center gap-3">
                                            <input type="radio" name="library" checked={selectedIdx === i} onChange={() => setSelectedIdx(i)} className="h-4 w-4 accent-cyan-500"/>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    <span>{lib.title}</span>
                                                    {mapped[lib.key] ? (
                                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300"><IconBadgeCheck className="h-3.5 w-3.5"/> Mapped</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300"><IconBadgeAlert className="h-3.5 w-3.5"/> Needs Mapping</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-neutral-400">{lib.type} — Section {lib.key} — {(lib.roots || []).length} root(s)</div>
                                            </div>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => onSelectLibrary(lib)} disabled={!mapped[lib.key]} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                                                <IconOpenInNew className="h-5 w-5"/>
                                                Open
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-4 flex justify-end">
                        <button onClick={() => selected && onSelectLibrary(selected)} disabled={!selected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                            <IconArrowForward className="h-5 w-5"/>
                            Continue
                        </button>
                    </div>
                </div>
            </section>
            {showMapModal && libraries && (
                <PathMappingModal
                    serverId={server.machineIdentifier || server.address}
                    plexRoots={[...new Set(libraries.flatMap(l => l.roots || []))]}
                    onClose={() => setShowMapModal(false)}
                    onSaved={() => refreshMappingStatus(libraries)}
                />
            )}
        </main>
    );
}
