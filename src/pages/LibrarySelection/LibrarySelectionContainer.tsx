import {useEffect, useState} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {invoke} from "@tauri-apps/api/core";
import { useTheme } from "../../state/theme";
import type {PlexLibrary, PlexServer} from "../../types/plex";
import LibrarySelectionTemplate from "./LibrarySelectionTemplate";

type Props = {
    server: PlexServer;
    onBack: () => void;
    onSelectLibrary: (library: PlexLibrary) => void;
};

export default function LibrarySelectionContainer({server, onBack, onSelectLibrary}: Props) {
    const { resolvedTheme, toggleTheme } = useTheme();
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
        <LibrarySelectionTemplate
            server={server}
            loading={loading}
            error={error}
            libraries={libraries}
            selectedIdx={selectedIdx}
            selected={selected}
            mapped={mapped}
            showMapModal={showMapModal}
            resolvedTheme={resolvedTheme}
            onBack={onBack}
            onSelectLibrary={onSelectLibrary}
            onSetSelectedIdx={setSelectedIdx}
            onSetShowMapModal={setShowMapModal}
            onToggleTheme={toggleTheme}
            onRefreshMappingStatus={() => refreshMappingStatus(libraries)}
        />
    );
}
