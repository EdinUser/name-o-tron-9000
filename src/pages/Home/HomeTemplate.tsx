// Components
import {IconArrowForward, IconBolt, IconCheck, IconLogin, IconLogout, IconRefresh, IconServer, IconSettings, IconSun, IconMoon} from "../../components/icons";
import AnimatedLogo from "../../components/AnimatedLogo";

type Props = {
    discovering: boolean;
    servers: any[];
    selectedIdx: number | null;
    error: string | null;
    manualAddr: string;
    loginStatus: "idle" | "pending" | "authorized" | "expired" | "error";
    selected: any;
    resolvedTheme: string;
    onDiscoverServers: () => void;
    onAdvancedScan: () => void;
    onConfirmAdvanced: () => void;
    onCancelAdvanced: () => void;
    advancedOpen: boolean;
    scanRunning: boolean;
    scanResults: any[];
    scanError: string | null;
    onCloseScanResults: () => void;
    scanOverlayOpen: boolean;
    advancedPort: string;
    advancedHosts: string;
    onSetAdvancedPort: (v: string) => void;
    onSetAdvancedHosts: (v: string) => void;
    onAddManualServer: () => void;
    onCancelDiscovery: () => void;
    onLoginWithPlex: () => void;
    onLogoutPlex: () => void;
    onProceed: () => void;
    onSetSelectedIdx: (idx: number) => void;
    onSetManualAddr: (addr: string) => void;
    onToggleTheme: () => void;
    onClearServers: () => void;
};

export default function HomeTemplate({
    discovering,
    servers,
    selectedIdx,
    error,
    manualAddr,
    loginStatus,
    selected,
    resolvedTheme,
    onDiscoverServers,
    onAdvancedScan,
    onConfirmAdvanced,
    onCancelAdvanced,
    advancedOpen,
    scanRunning,
    scanResults,
    scanError,
    onCloseScanResults,
    scanOverlayOpen,
    advancedPort,
    advancedHosts,
    onSetAdvancedPort,
    onSetAdvancedHosts,
    onAddManualServer,
    onCancelDiscovery,
    onLoginWithPlex,
    onLogoutPlex,
    onProceed,
    onSetSelectedIdx,
    onSetManualAddr,
    onToggleTheme,
    onClearServers,
}: Props) {
    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                        <IconBolt className="h-5 w-5 text-cyan-400"/>
                        <span className="text-lg font-semibold tracking-tight">Name‑o‑Tron 9000</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onDiscoverServers} disabled={discovering} className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50">
                            {discovering ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" aria-hidden="true"/>
                            ) : (
                                <IconRefresh className="h-5 w-5 text-cyan-300"/>
                            )}
                            {discovering ? "Discovering…" : "Discover"}
                        </button>
                        <button onClick={onAdvancedScan} disabled={discovering || scanRunning} className="inline-flex items-center gap-2 rounded-md border border-yellow-700/70 bg-neutral-800 px-3 py-1.5 text-sm text-yellow-100 hover:bg-neutral-700 disabled:opacity-50">
                            <IconBolt className="h-5 w-5 text-yellow-300"/>
                            Advanced Scan
                        </button>
                        {loginStatus === "authorized" ? (
                            <button onClick={onLogoutPlex} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                                <IconLogout className="h-5 w-5"/>
                                Logout
                            </button>
                        ) : (
                            <button onClick={onLoginWithPlex} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400">
                                <IconLogin className="h-5 w-5"/>
                                Login
                            </button>
                        )}
                        <button onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconSettings className="h-5 w-5"/>
                            Settings
                        </button>
                        <button onClick={onToggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
                        </button>
                    </div>
                </div>
                {discovering && <div className="fixed left-0 right-0 top-0 z-50 h-0.5 bg-cyan-500/80 animate-pulse"/>}
            </header>

            <section className="mx-auto max-w-6xl px-6 py-8">
                <div className="mb-6">
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4">
                            <AnimatedLogo className="h-24 w-auto" />
                            <div className="text-center">
                                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Welcome</h1>
                                <p className="mt-1 text-neutral-400">Connect to your Plex server to begin.</p>
                            </div>
                        </div>
                    </div>
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
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <IconServer className="h-5 w-5 text-cyan-300"/>
                            <h2 className="text-lg font-semibold">Discovered Servers</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onClearServers} className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">Clear list</button>
                        </div>
                    </div>

                    {servers.length === 0 ? (
                        <div className="space-y-2 text-sm text-neutral-300">
                            <p>{discovering ? "Scanning your network for Plex servers…" : "No servers found via discovery."}</p>
                            {!discovering && (
                                <p className="text-neutral-400">
                                    Try{" "}
                                    <button onClick={onAdvancedScan} className="text-cyan-300 underline hover:text-cyan-200">
                                        Advanced Scan
                                    </button>{" "}
                                    to probe your local subnet, or add a server manually.
                                </p>
                            )}
                        </div>
                    ) : (
                        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                            {servers.map((s, i) => (
                                <li key={`${s.address}-${i}`} className={`group flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700 ${selectedIdx === i ? "ring-1 ring-cyan-500/50" : ""}`}>
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="radio" name="server" checked={selectedIdx === i} onChange={() => onSetSelectedIdx(i)} className="h-4 w-4 accent-cyan-500"/>
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
                                onChange={(e) => onSetManualAddr(e.target.value)}
                                placeholder="192.168.1.132 or http://192.168.1.132:32400"
                                className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-cyan-500"
                            />
                            <button onClick={onAddManualServer} disabled={discovering} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                                Add
                            </button>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">Uses the backend to validate reachability on port 32400.</div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button onClick={onProceed} disabled={!selected} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
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
                        <button onClick={onCancelDiscovery} className="mt-1 inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">Cancel</button>
                    </div>
                </div>
            )}

            {advancedOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="w-full max-w-lg rounded-xl border border-yellow-800/60 bg-neutral-900/95 p-5 shadow-xl">
                        <div className="text-lg font-semibold text-yellow-200">Advanced Scan</div>
                        <p className="mt-2 text-sm text-neutral-200">Probes your local subnet for Plex on port 32400 (or a custom port). You can narrow the scan to specific hosts (comma or space separated).</p>
                        <div className="mt-4 space-y-3">
                            <label className="flex flex-col gap-1 text-sm text-neutral-200">
                                Target port (default 32400)
                                <input
                                    type="text"
                                    value={advancedPort}
                                    onChange={(e) => onSetAdvancedPort(e.target.value)}
                                    className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                                    placeholder="32400"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-neutral-200">
                                Hosts to scan (optional)
                                <input
                                    type="text"
                                    value={advancedHosts}
                                    onChange={(e) => onSetAdvancedHosts(e.target.value)}
                                    className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                                    placeholder="e.g., 192.168.1.132 192.168.1.10"
                                />
                                <span className="text-xs text-neutral-400">Leave blank to scan the local /24; provide hosts to limit scanning.</span>
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={onCancelAdvanced} className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700">Cancel</button>
                            <button onClick={onConfirmAdvanced} className="rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-yellow-300">OK</button>
                        </div>
                    </div>
                </div>
            )}

            {scanOverlayOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900/95 p-5 shadow-xl">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-semibold text-neutral-100">Advanced scan</div>
                            <button onClick={onCloseScanResults} className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">Close</button>
                        </div>
                        {scanRunning ? (
                            <div className="mt-4 flex items-center gap-3 text-sm text-neutral-200">
                                <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" aria-hidden="true"/>
                                Scanning local subnet for Plex…
                            </div>
                        ) : (
                            <>
                                {scanError && <div className="mt-3 rounded-md border border-red-800/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">{scanError}</div>}
                                <div className="mt-3 max-h-64 overflow-auto rounded-md border border-neutral-800 bg-neutral-900/80">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-neutral-800 text-neutral-300">
                                            <tr>
                                                <th className="px-3 py-2">IP</th>
                                                <th className="px-3 py-2">Status</th>
                                                <th className="px-3 py-2">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scanResults.length === 0 && (
                                                <tr>
                                                    <td className="px-3 py-2 text-neutral-400" colSpan={3}>No results.</td>
                                                </tr>
                                            )}
                                            {scanResults.map((r, idx) => (
                                                <tr key={`${r.ip}-${idx}`} className="border-t border-neutral-800">
                                                    <td className="px-3 py-2 font-mono text-xs text-neutral-100">{r.ip}</td>
                                                    <td className="px-3 py-2 text-sm">
                                                        {r.is_plex ? <span className="text-emerald-400">Plex found</span> : r.reachable ? <span className="text-yellow-300">Reached, not Plex</span> : <span className="text-red-400">No response</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-neutral-400">{r.name || r.details || ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}


        </main>
    );
}
