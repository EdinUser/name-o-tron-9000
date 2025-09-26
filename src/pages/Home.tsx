import {useEffect, useMemo, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import type {PlexServer} from "../types/plex";
import {IconArrowForward, IconBolt, IconLogin, IconRefresh, IconServer, IconSettings} from "../components/icons";

type Props = {
    onSelectServer: (server: PlexServer) => void;
};

export default function Home({onSelectServer}: Props) {
    const [discovering, setDiscovering] = useState(false);
    const [servers, setServers] = useState<PlexServer[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selected = useMemo(() =>
            selectedIdx != null ? servers[selectedIdx] : null,
        [selectedIdx, servers]);

    async function discoverServers() {
        setError(null);
        setDiscovering(true);
        try {
            // Always include local mock server for tests
            const initial: PlexServer[] = [
                {name: "Mock Plex (Local)", address: "http://localhost:32400", owned: true},
            ];

            // Try real Tauri discovery if backend implemented; merge unique results
            const found = await invoke<PlexServer[]>("plex_discover").catch(() => null);
            const merged = Array.isArray(found) ? [...initial, ...found] : initial;

            // Deduplicate by address
            const seen = new Set<string>();
            const unique = merged.filter((s) => {
                const key = (s.address || "").toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            setServers(unique);
            if (unique.length && selectedIdx == null) setSelectedIdx(0);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setDiscovering(false);
        }
    }

    async function loginWithPlex() {
        setError(null);
        try {
            await invoke("plex_login");
        } catch (e: any) {
            setError(e?.message ?? String(e));
        }
    }

    function proceed() {
        if (!selected) return;
        onSelectServer(selected);
    }

    useEffect(() => {
        // Auto-discover on first load (safe + cancellable)
        discoverServers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                        <IconBolt className="h-5 w-5 text-cyan-400"/>
                        <span className="text-lg font-semibold tracking-tight">Name‑o‑Tron 9000</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={discoverServers} disabled={discovering} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50">
                            <IconRefresh className="h-5 w-5 text-cyan-300"/>
                            {discovering ? "Discovering…" : "Discover"}
                        </button>
                        <button onClick={loginWithPlex} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400">
                            <IconLogin className="h-5 w-5"/>
                            Login
                        </button>
                        <button onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                    </div>
                </div>
            </header>

            <section className="mx-auto max-w-6xl px-6 py-8">
                <div className="mb-6">
                    <h1 className="text-center text-3xl font-bold tracking-tight">Welcome</h1>
                    <p className="mt-1 text-center text-neutral-400">Connect to your Plex server to begin.</p>
                </div>

                {error && (
                    <div className="mb-4 rounded-md border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">{error}</div>
                )}

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <IconServer className="h-5 w-5 text-cyan-300"/>
                        <h2 className="text-lg font-semibold">Discovered Servers</h2>
                    </div>

                    {servers.length === 0 ? (
                        <p className="text-neutral-400">{discovering ? "Scanning your network for Plex servers…" : "No servers found yet. Try Discover again or login with Plex."}</p>
                    ) : (
                        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                            {servers.map((s, i) => (
                                <li key={`${s.address}-${i}`} className={`group flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700 ${selectedIdx === i ? "ring-1 ring-cyan-500/50" : ""}`}>
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="radio" name="server" checked={selectedIdx === i} onChange={() => setSelectedIdx(i)} className="h-4 w-4 accent-cyan-500"/>
                                        <div>
                                            <div className="font-medium">{s.name}</div>
                                            <div className="text-xs text-neutral-400">{s.address}</div>
                                        </div>
                                    </label>
                                    {s.owned && <span className="rounded bg-neutral-700/60 px-2 py-0.5 text-[11px] text-neutral-200">Owner</span>}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-4 flex justify-end">
                        <button onClick={proceed} disabled={!selected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                            <IconArrowForward className="h-5 w-5"/>
                            Continue
                        </button>
                    </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">Tip: start the mock server with <code>npm run mock:plex</code> and use http://localhost:32400</p>
            </section>
        </main>
    );
}
