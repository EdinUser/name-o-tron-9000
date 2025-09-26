import {useEffect, useState} from "react";
import type {PlexLibrary, PlexServer} from "../types/plex";
import {IconArrowBack, IconArrowForward, IconOpenInNew, IconServer, IconSettings} from "../components/icons";

type Props = {
    server: PlexServer;
    onBack: () => void;
    onSelectLibrary: (library: PlexLibrary) => void;
};

type LibrariesResponse = {
    MediaContainer?: {
        size?: number;
        // Newer/real Plex shape
        Directory?: Array<{ key: string; type: string; title: string }>;
        // Older mock shape
        directories?: Array<{ key: string; type: string; title: string }>;
    };
};

export default function LibrarySelection({server, onBack, onSelectLibrary}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${server.address}/library/sections`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as LibrariesResponse;
                const dirs = (data?.MediaContainer?.Directory ?? data?.MediaContainer?.directories ?? []) as Array<{ key: string; type: string; title: string }>;
                const libs: PlexLibrary[] = dirs
                    .filter(Boolean)
                    .map((d) => ({key: String(d.key), type: String(d.type) as any, title: String(d.title)}));
                setLibraries(libs);
                if (libs.length) setSelectedIdx(0);
            } catch (e: any) {
                setError(e?.message ?? String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [server.address]);

    const selected = selectedIdx != null ? libraries[selectedIdx] : null;

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
                    <div className="flex items-center gap-2 text-sm text-neutral-400">
                        <IconServer className="h-5 w-5"/>
                        {server.name} — {server.address}
                        <button type="button" onClick={() => (window as any).__goto_settings?.()} className="ml-2 inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700">
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
                    {libraries.length === 0 && !loading && !error && (
                        <p className="text-neutral-400">No libraries found.</p>
                    )}
                    {libraries.length > 0 && (
                        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                            {libraries.map((lib, i) => (
                                <li key={`${lib.key}-${i}`} className={`flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700 ${selectedIdx === i ? "ring-1 ring-cyan-500/50" : ""}`}>
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="radio" name="library" checked={selectedIdx === i} onChange={() => setSelectedIdx(i)} className="h-4 w-4 accent-cyan-500"/>
                                        <div>
                                            <div className="font-medium">{lib.title}</div>
                                            <div className="text-xs text-neutral-400">{lib.type} — Section {lib.key}</div>
                                        </div>
                                    </label>
                                    <button onClick={() => onSelectLibrary(lib)} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400">
                                        <IconOpenInNew className="h-5 w-5"/>
                                        Open
                                    </button>
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
        </main>
    );
}
