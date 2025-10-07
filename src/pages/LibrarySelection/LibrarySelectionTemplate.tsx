// Components
import {IconArrowBack, IconArrowForward, IconBadgeAlert, IconBadgeCheck, IconHome, IconInfo, IconServer, IconSettings, IconSun, IconMoon} from "../../components/icons";
import PathMappingModal from "../../components/PathMappingModal";

// Types
import type {PlexLibrary, PlexServer} from "../../types/plex";
import { generateServerId } from "../../utils/cache";

type Props = {
    server: PlexServer;
    loading: boolean;
    error: string | null;
    libraries: PlexLibrary[];
    mapped: Record<string, boolean>;
    showMapModal: boolean;
    resolvedTheme: string;
    onBack: () => void;
    onSelectLibrary: (library: PlexLibrary) => void;
    onSetShowMapModal: (show: boolean) => void;
    onToggleTheme: () => void;
    onRefreshMappingStatus: () => void;
};

export default function LibrarySelectionTemplate({
    server,
    loading,
    error,
    libraries,
    mapped,
    showMapModal,
    resolvedTheme,
    onBack,
    onSelectLibrary,
    onSetShowMapModal,
    onToggleTheme,
    onRefreshMappingStatus,
}: Props) {
    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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
                        <button onClick={onToggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
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
                        <button onClick={() => onSetShowMapModal(true)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">Map Paths</button>
                    </div>
                    {libraries.length === 0 && !loading && !error && (
                        <div className="text-neutral-400">No libraries found.</div>
                    )}
                    {libraries.length > 0 && (
                        <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                            {libraries.map((lib, i) => (
                                <li key={`${lib.key}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
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
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => onSelectLibrary(lib)} disabled={!mapped[lib.key]} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">
                                                <IconArrowForward className="h-5 w-5"/>
                                                Open
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>
            {showMapModal && libraries && (
                <PathMappingModal
                    serverId={generateServerId(server)}
                    libraries={libraries.map(lib => ({ ...lib, roots: lib.roots || [] }))}
                    onClose={() => onSetShowMapModal(false)}
                    onSaved={() => onRefreshMappingStatus()}
                />
            )}
        </main>
    );
}
