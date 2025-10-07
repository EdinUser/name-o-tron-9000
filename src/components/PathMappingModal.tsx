import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type Mapping = {
  plex_root: string;
  local_root: string;
  status?: "unknown" | "ok" | "missing" | "not_writable";
  details?: string;
};

type LibraryWithRoots = {
  key: string;
  title: string;
  type: string;
  roots: string[];
};

type Props = {
  serverId: string; // machineIdentifier or address fallback
  libraries: LibraryWithRoots[];
  onClose: () => void;
  onSaved?: () => void;
};

export default function PathMappingModal({ serverId, libraries, onClose, onSaved }: Props) {
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [saving, setSaving] = useState(false);

  // Flatten all roots from all libraries
  const allRoots = useMemo(() => libraries.flatMap(lib => lib.roots || []), [libraries]);

  // Load existing settings & seed rows for the provided roots
  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string; platform?: string }[] }>("get_settings");
        const serverMaps = (s.pathMappings || []).filter(m => m.server_id === serverId);
        const initial: Record<string, Mapping> = {};
        for (const r of allRoots) {
          const hit = serverMaps.find(m => m.plex_root === r);
          initial[r] = { plex_root: r, local_root: hit?.local_root || "", status: "unknown" };
        }
        setMappings(initial);
      } catch {
        const initial: Record<string, Mapping> = {};
        for (const r of allRoots) initial[r] = { plex_root: r, local_root: "", status: "unknown" };
        setMappings(initial);
      }
    })();
  }, [serverId, allRoots.join("|")]);

  const rows = useMemo(() => allRoots.map(r => mappings[r] || { plex_root: r, local_root: "" }), [allRoots, mappings]);

  async function test(r: string) {
    const m = mappings[r];
    if (!m) return;
    try {
      const res = await invoke<{ ok: boolean; exists: boolean; writable: boolean; details: string }>(
        "test_mapping",
        {
          // pass multiple aliases to be compatible with any param naming
          serverId,
          server_id: serverId,
          _server_id: serverId,
          plexRoot: r,
          plex_root: r,
          _plex_root: r,
          localRoot: m.local_root,
          local_root: m.local_root,
        }
      );
      setMappings(prev => ({
        ...prev,
        [r]: {
          ...m,
          status: res.ok ? "ok" : (!res.exists ? "missing" : (!res.writable ? "not_writable" : "unknown")),
          details: res.details,
        },
      }));
    } catch (e: any) {
      setMappings(prev => ({ ...prev, [r]: { ...m, status: "missing", details: e?.message || String(e) } }));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const current = await invoke<{ pathMappings?: any[] }>("get_settings");
      const list = Array.isArray(current.pathMappings) ? current.pathMappings.slice() : [];
      // Remove existing for this server + roots, then add current
      const rootsSet = new Set(allRoots);
      const filtered = list.filter((m: any) => !(m.server_id === serverId && rootsSet.has(m.plex_root)));
      const toAdd = rows
        .filter(r => r.local_root.trim().length > 0)
        .map(r => ({ server_id: serverId, plex_root: r.plex_root, local_root: r.local_root, platform: undefined }));
      const next = { pathMappings: [...filtered, ...toAdd] };
      await invoke("save_settings", { settings: next });

      // Invalidate show mapping cache for all affected libraries
      for (const library of libraries) {
        try {
          await invoke("invalidate_show_mapping_cache", {
            serverId,
            libraryId: library.key
          });
        } catch (error) {
          console.warn(`Failed to invalidate cache for library ${library.key}:`, error);
        }
      }

      onSaved?.();
      onClose();
    } catch (e) {
      console.error("save error", e);
    } finally {
      setSaving(false);
    }
  }

  async function pickDir(root: string) {
    try {
      const sel = await open({ multiple: false, directory: true });
      if (typeof sel === 'string' && sel) {
        setMappings(prev => ({ ...prev, [root]: { ...prev[root], local_root: sel } }));
        return;
      }
    } catch (e) {
      console.warn('plugin dialog open failed, falling back to prompt', e);
    }
    const manual = window.prompt('Enter local folder path for:\n' + root, mappings[root]?.local_root || '');
    if (manual) setMappings(prev => ({ ...prev, [root]: { ...prev[root], local_root: manual } }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Map Plex Paths</div>
          <button onClick={onClose} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700">Close</button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-md border border-neutral-800">
          {libraries.length === 0 ? (
            <div className="px-3 py-4 text-sm text-neutral-400">No libraries found. Try reloading libraries or ensure the Plex token is valid.</div>
          ) : (
            <div>
              {libraries.map((library) => (
                <div key={library.key} className="border-b border-neutral-800 last:border-b-0">
                  <div className="bg-neutral-800/50 px-3 py-2 text-sm font-medium text-neutral-200 border-b border-neutral-700">
                    {library.title} ({library.type})
                  </div>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-900/90">
                      <tr className="text-left text-neutral-300">
                        <th className="px-3 py-2 font-medium">Plex Folder</th>
                        <th className="px-3 py-2 font-medium">Local Path</th>
                        <th className="px-3 py-2 font-medium">Test</th>
                      </tr>
                    </thead>
                    <tbody>
                      {library.roots.map((root) => (
                        <tr key={root} className="border-t border-neutral-800">
                          <td className="px-3 py-2 font-mono text-xs text-neutral-300">{root}</td>
                          <td className="px-3 py-2">
                            <input
                              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                              placeholder="e.g., Z:\\Series or /mnt/nas/Series"
                              value={mappings[root]?.local_root || ""}
                              onChange={(e) => setMappings(prev => ({ ...prev, [root]: { ...prev[root], plex_root: root, local_root: e.target.value } }))}
                            />
                            {mappings[root]?.details && (
                              <div className="pt-1 text-xs text-neutral-500">{mappings[root]?.details}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => pickDir(root)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">Pick…</button>
                              <button onClick={() => test(root)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">Test</button>
                              {mappings[root]?.status === "ok" && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">OK</span>}
                              {mappings[root]?.status === "missing" && <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">Missing</span>}
                              {mappings[root]?.status === "not_writable" && <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] text-yellow-300">Read-only</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
