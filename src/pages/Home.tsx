import {useEffect, useMemo, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {PlexServer} from "../types/plex";
import {IconArrowForward, IconBolt, IconLogin, IconLogout, IconRefresh, IconServer, IconSettings, IconCheck} from "../components/icons";

type Props = {
    onSelectServer: (server: PlexServer) => void;
};

export default function Home({onSelectServer}: Props) {
    const [discovering, setDiscovering] = useState(false);
    const [servers, setServers] = useState<PlexServer[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [manualAddr, setManualAddr] = useState("");
    const [loginStatus, setLoginStatus] = useState<"idle" | "pending" | "authorized" | "expired" | "error">("idle");
    const [loginToken, setLoginToken] = useState<string | null>(null);
    const discoverRun = useRef(0);

    const selected = useMemo(() =>
            selectedIdx != null ? servers[selectedIdx] : null,
        [selectedIdx, servers]);

    // Mapping moved to Select Library screen

    async function discoverServers() {
        const runId = ++discoverRun.current;
        setError(null);
        setDiscovering(true);
        const started = Date.now();
        try {
            // Always include local mock server for tests
            const initial: PlexServer[] = [
                {name: "Mock Plex (Local)", address: "http://localhost:32400", owned: true},
            ];

            // Try real Tauri discovery if backend implemented; merge unique results
            console.debug("Discover: invoking backend discovery with hint 192.168.1.132");
            let found: PlexServer[] | null = null;
            try {
                found = await invoke<PlexServer[]>("plex_discover", { hints: ["192.168.1.132"] });
            } catch (e: any) {
                console.warn("Discover: backend invoke failed", e);
                setError(`Discovery failed: ${e?.message ?? String(e)}`);
                found = null;
            }
            const merged = Array.isArray(found) ? [...initial, ...found] : initial;

            // Deduplicate by address
            const seen = new Set<string>();
            const unique = merged.filter((s) => {
                const key = (s.address || "").toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            if (discoverRun.current !== runId) return; // cancelled or superseded
            setServers(unique);
            try { sessionStorage.setItem("discoveredServers", JSON.stringify(unique)); } catch {}
            if (unique.length && selectedIdx == null) setSelectedIdx(0);
        } catch (e: any) {
            console.error("Discover: unexpected error", e);
            if (discoverRun.current === runId) setError(e?.message ?? String(e));
        } finally {
            const elapsed = Date.now() - started;
            const minMs = 400;
            if (elapsed < minMs) {
                await new Promise((r) => setTimeout(r, minMs - elapsed));
            }
            if (discoverRun.current === runId) setDiscovering(false);
        }
    }

    async function addManualServer() {
        const input = manualAddr.trim();
        if (!input) {
            setError("Please enter an IP or URL, e.g., 192.168.1.132 or http://192.168.1.132:32400");
            return;
        }
        setError(null);
        setDiscovering(true);
        const started = Date.now();
        try {
            console.debug("Manual add: invoking backend discovery with hint", input);
            const found = await invoke<PlexServer[]>("plex_discover", { hints: [input] });
            if (!Array.isArray(found) || found.length === 0) {
                setError("Could not reach the provided server. Check address and try again.");
                return;
            }
            const merged = [...servers, ...found];
            const seen = new Set<string>();
            const unique = merged.filter((s) => {
                const key = (s.address || "").toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            setServers(unique);
            try { sessionStorage.setItem("discoveredServers", JSON.stringify(unique)); } catch {}
            if (unique.length) setSelectedIdx(unique.findIndex(s => s.address.toLowerCase().includes(input.replace(/^https?:\/\//, '').split(':')[0].toLowerCase())) || 0);
        } catch (e: any) {
            console.error("Manual add: error", e);
            setError(e?.message ?? String(e));
        } finally {
            const elapsed = Date.now() - started;
            const minMs = 300;
            if (elapsed < minMs) {
                await new Promise((r) => setTimeout(r, minMs - elapsed));
            }
            setDiscovering(false);
        }
    }

    function cancelDiscovery() {
        // Invalidate current run and hide overlay/spinner
        ++discoverRun.current;
        setDiscovering(false);
    }

    const loginPromise = useRef<Promise<string | null> | null>(null);
    async function ensurePlexLogin(): Promise<string | null> {
        // Already have token
        const existing = loginToken || (() => { try { return localStorage.getItem("plexToken"); } catch { return null; } })();
        if (existing) {
            setLoginStatus("authorized");
            if (!loginToken) setLoginToken(existing);
            return existing;
        }
        if (loginStatus === "pending" && loginPromise.current) return loginPromise.current;

        setError(null);
        setLoginStatus("pending");
        try {
            await invoke("plex_login");
        } catch (e: any) {
            setLoginStatus("error");
            setError(e?.message ?? String(e));
            return null;
        }

        loginPromise.current = new Promise<string | null>((resolve) => {
            let cancelled = false;
            const poll = async () => {
                if (cancelled) return;
                try {
                    const res = await invoke<{ status: string; token?: string }>("plex_login_status");
                    const st = String(res.status || "idle");
                    if (st === "authorized") {
                        const tok = (res as any).token ? String((res as any).token) : null;
                        setLoginStatus("authorized");
                        setLoginToken(tok);
                        if (tok) {
                            try { localStorage.setItem("plexToken", tok); } catch { /* ignore */ }
                        }
                        resolve(tok ?? null);
                        return;
                    }
                    if (st === "expired") {
                        setLoginStatus("expired");
                        resolve(null);
                        return;
                    }
                    setLoginStatus("pending");
                } catch (e: any) {
                    setLoginStatus("error");
                    setError(e?.message ?? String(e));
                    resolve(null);
                    return;
                }
                setTimeout(poll, 1200);
            };
            setTimeout(poll, 800);
            // best-effort cleanup when component unmounts
            (ensurePlexLogin as any)._cancel = () => { cancelled = true; };
        });
        return loginPromise.current;
    }

    async function loginWithPlex() {
        await ensurePlexLogin();
    }

    async function logoutPlex() {
        try { localStorage.removeItem("plexToken"); } catch {}
        setLoginToken(null);
        setLoginStatus("idle");
        try { await invoke("plex_logout"); } catch {}
    }

    async function proceed() {
        if (!selected) return;
        const tok = await ensurePlexLogin();
        if (!tok) return; // waiting for login/pending
        onSelectServer(selected);
    }

    const autoScheduled = useRef(false);

    // Detect existing token on load
    useEffect(() => {
        try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Home"); } catch {}
        try {
            const tok = localStorage.getItem("plexToken");
            if (tok) {
                setLoginToken(tok);
                setLoginStatus("authorized");
            }
        } catch { /* ignore */ }
    }, []);
    // Persist selected server across session
    useEffect(() => {
        if (selectedIdx == null || selectedIdx < 0 || selectedIdx >= servers.length) return;
        const addr = servers[selectedIdx]?.address;
        if (!addr) return;
        try { sessionStorage.setItem("selectedServerAddress", addr); } catch {}
    }, [selectedIdx, servers]);

    // Restore discovered servers from session once
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem("discoveredServers");
            if (raw) {
                const parsed = JSON.parse(raw) as PlexServer[];
                if (Array.isArray(parsed) && parsed.length) {
                    setServers(parsed);
                    const sel = sessionStorage.getItem("selectedServerAddress");
                    if (sel) {
                        const idx = parsed.findIndex(s => (s.address || "").toLowerCase() === sel.toLowerCase());
                        setSelectedIdx(idx >= 0 ? idx : 0);
                    } else {
                        setSelectedIdx(0);
                    }
                }
            }
        } catch { /* ignore */ }
    }, []);
    useEffect(() => {
        if (autoScheduled.current) return;
        autoScheduled.current = true;
        // Auto-discover shortly after first paint to avoid navigation lag
        const t = setTimeout(() => {
            // Skip if a discovery is already in progress or we already have servers
            if (!discovering && servers.length === 0) discoverServers();
        }, 350);
        return () => {
            clearTimeout(t);
            // Cancel any in-flight discovery when unmounting Home
            ++discoverRun.current;
        };
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
                        <button onClick={discoverServers} disabled={discovering} className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50">
                            {discovering ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" aria-hidden="true"/>
                            ) : (
                                <IconRefresh className="h-5 w-5 text-cyan-300"/>
                            )}
                            {discovering ? "Discovering…" : "Discover"}
                        </button>
                        {loginStatus === "authorized" ? (
                            <button onClick={logoutPlex} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                                <IconLogout className="h-5 w-5"/>
                                Logout
                            </button>
                        ) : (
                            <button onClick={loginWithPlex} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400">
                                <IconLogin className="h-5 w-5"/>
                                Login
                            </button>
                        )}
                        <button onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                    </div>
                </div>
                {discovering && <div className="fixed left-0 right-0 top-0 z-50 h-0.5 bg-cyan-500/80 animate-pulse"/>}
            </header>

            <section className="mx-auto max-w-6xl px-6 py-8">
                <div className="mb-6">
                    <h1 className="text-center text-3xl font-bold tracking-tight">Welcome</h1>
                    <p className="mt-1 text-center text-neutral-400">Connect to your Plex server to begin.</p>
                </div>

                {error && (
                    <div className="mb-4 rounded-md border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">{error}</div>
                )}
                {loginStatus === "pending" && (
                    <div className="mb-4 rounded-md border border-cyan-800/60 bg-cyan-900/20 px-3 py-2 text-sm text-cyan-200">Plex login opened in your browser. Finish sign-in to continue…</div>
                )}
                {/* When authorized, we now reflect it via Logout button and green ticks */}
                {loginStatus === "expired" && (
                    <div className="mb-4 rounded-md border border-yellow-800/60 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-200">Login session expired. Try again.</div>
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
                                        <div className="flex items-center gap-2">
                                            <div className="font-medium">{s.name}</div>
                                            {loginStatus === "authorized" && (
                                                <span title="Plex account connected" className="inline-flex items-center justify-center rounded-full bg-emerald-500/20 p-0.5">
                                                    <IconCheck className="h-3.5 w-3.5 text-emerald-400"/>
                                                </span>
                                            )}
                                            <div className="text-xs text-neutral-400">{s.address}</div>
                                        </div>
                                    </label>
                                    {s.owned && <span className="rounded bg-neutral-700/60 px-2 py-0.5 text-[11px] text-neutral-200">Owner</span>}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Manual add */}
                    <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
                        <div className="mb-2 text-sm font-medium text-neutral-200">Add server manually</div>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={manualAddr}
                                onChange={(e) => setManualAddr(e.target.value)}
                                placeholder="192.168.1.132 or http://192.168.1.132:32400"
                                className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-cyan-500"
                            />
                            <button onClick={addManualServer} disabled={discovering} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                                Add
                            </button>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">Uses the backend to validate reachability on port 32400.</div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button onClick={proceed} disabled={!selected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                            <IconArrowForward className="h-5 w-5"/>
                            Continue
                        </button>
                    </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">Tip: start the mock server with <code>npm run mock:plex</code> and use http://localhost:32400</p>
            </section>

            {discovering && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/90 px-6 py-5 shadow-xl">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" aria-hidden="true"/>
                        <div className="text-sm text-neutral-300">Discovering Plex servers on your network…</div>
                        <button onClick={cancelDiscovery} className="mt-1 inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">Cancel</button>
                    </div>
                </div>
            )}

            
        </main>
    );
}
