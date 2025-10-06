import {useEffect, useMemo, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import { useSettings } from "../../state/settings";
import { useTheme } from "../../state/theme";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {PlexServer} from "../../types/plex";
import HomeTemplate from "./HomeTemplate";

type Props = {
    onSelectServer: (server: PlexServer) => void;
};

export default function HomeContainer({onSelectServer}: Props) {
    const { settings } = useSettings();
    const { resolvedTheme, toggleTheme } = useTheme();
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
            let found: PlexServer[] | null = null;
            try {
                found = await invoke<PlexServer[]>("plex_discover", { hints: ["192.168.1.132"] });
            } catch (e: any) {
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
            try { await invoke("save_settings", { settings: { discovery: { servers: unique } } }); } catch { /* ignore */ }
            if (unique.length && selectedIdx == null) setSelectedIdx(0);
        } catch (e: any) {
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
            try { await invoke("save_settings", { settings: { discovery: { servers: unique } } }); } catch { /* ignore */ }
            if (unique.length) setSelectedIdx(unique.findIndex(s => s.address.toLowerCase().includes(input.replace(/^https?:\/\//, '').split(':')[0].toLowerCase())) || 0);
        } catch (e: any) {
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
            let pollCount = 0;
            const poll = async () => {
                if (cancelled) return;
                pollCount++;
                try {
                    const res = await invoke<{ status: string; token?: string }>("plex_login_status");
                    const st = String(res.status || "idle");

                    if (st === "authorized") {
                        const tok = (res as any).token ? String((res as any).token) : null;
                        setLoginStatus("authorized");
                        setLoginToken(tok);
                        if (tok) {
                            // Always save to localStorage for immediate API use
                            try { localStorage.setItem("plexToken", tok); } catch { /* ignore */ }

                            const pref = settings.general.authPersistence || "secure"; // Default to secure
                            if (pref === "file") {
                                try { await invoke("save_settings", { settings: { auth: { plexToken: tok } } }); } catch { /* ignore */ }
                            } else if (pref === "secure") {
                                try { await invoke("secure_save_token", { token: tok }); } catch { /* ignore */ }
                            }
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

                // Continue polling if still pending
                if (!cancelled) {
                    setTimeout(poll, 1200);
                }
            };

            setTimeout(poll, 500); // Start polling sooner
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
        try { await invoke("save_settings", { settings: { auth: { plexToken: null } } }); } catch { /* ignore */ }
        try { await invoke("secure_clear_token"); } catch { /* ignore */ }
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

    // Detect existing token on load; hydrate from Tauri settings if present
    useEffect(() => {
        try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Home"); } catch {}
        try {
            // Always try localStorage first for immediate availability
            const tok = localStorage.getItem("plexToken");
            if (tok) {
                setLoginToken(tok);
                setLoginStatus("authorized");
                return;
            }

            // If not in localStorage, try secure storage if that's the preference
            const pref = settings.general.authPersistence || "secure";
            if (pref === "secure") {
                (async () => {
                    try {
                        const secureTok = await invoke<string | null>("secure_get_token");
                        if (secureTok) {
                            setLoginToken(secureTok);
                            setLoginStatus("authorized");
                            // Also save to localStorage for consistency
                            try { localStorage.setItem("plexToken", secureTok); } catch {}
                        }
                    } catch (e) {
                    }
                })();
            }
        } catch { /* ignore */ }
        (async () => {
            try {
                const s: any = await invoke("get_settings");
                const pref = settings.general.authPersistence || "none";
                if (pref === "file") {
                    const tok2: string | undefined = s?.auth?.plexToken;
                    if (tok2 && !loginToken) {
                        try { localStorage.setItem("plexToken", tok2); } catch {}
                        setLoginToken(tok2);
                        setLoginStatus("authorized");
                    }
                } else if (pref === "secure") {
                    // Migrate from file if present
                    const fileTok: string | undefined = s?.auth?.plexToken;
                    if (fileTok) {
                        try { await invoke("secure_save_token", { token: fileTok }); } catch {}
                        try { await invoke("save_settings", { settings: { auth: { plexToken: null } } }); } catch {}
                        try { localStorage.removeItem("plexToken"); } catch {}
                    }
                    const tok3 = await invoke<string | null>("secure_get_token");
                    if (tok3) {
                        setLoginToken(tok3);
                        setLoginStatus("authorized");
                    }
                }
            } catch { /* ignore */ }
        })();
    }, []);
    // Persist selected server across session
    useEffect(() => {
        if (selectedIdx == null || selectedIdx < 0 || selectedIdx >= servers.length) return;
        const addr = servers[selectedIdx]?.address;
        if (!addr) return;
        try { sessionStorage.setItem("selectedServerAddress", addr); } catch {}
        (async () => { try { await invoke("save_settings", { settings: { discovery: { lastSelectedAddress: addr } } }); } catch {} })();
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
        (async () => {
            try {
                if (servers.length > 0) return;
                const all: any = await invoke("get_settings");
                const saved = Array.isArray(all?.discovery?.servers) ? all.discovery.servers as PlexServer[] : [];
                if (saved.length) {
                    setServers(saved);
                    const sel = all?.discovery?.lastSelectedAddress as string | undefined;
                    if (sel) {
                        const idx = saved.findIndex(s => (s.address || "").toLowerCase() === sel.toLowerCase());
                        setSelectedIdx(idx >= 0 ? idx : 0);
                    } else {
                        setSelectedIdx(0);
                    }
                }
            } catch { /* ignore */ }
        })();
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
        <HomeTemplate
            discovering={discovering}
            servers={servers}
            selectedIdx={selectedIdx}
            error={error}
            manualAddr={manualAddr}
            loginStatus={loginStatus}
            selected={selected}
            resolvedTheme={resolvedTheme}
            onDiscoverServers={discoverServers}
            onAddManualServer={addManualServer}
            onCancelDiscovery={cancelDiscovery}
            onLoginWithPlex={loginWithPlex}
            onLogoutPlex={logoutPlex}
            onProceed={proceed}
            onSetSelectedIdx={setSelectedIdx}
            onSetManualAddr={setManualAddr}
            onToggleTheme={toggleTheme}
        />
    );
}
