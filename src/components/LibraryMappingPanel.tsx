import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Mapping = { plex_root: string; local_root: string; status?: "unknown" | "ok" | "missing" | "not_writable"; details?: string };

type Props = {
  serverId: string;
  libraryKey: string;
  roots: string[];
  onSaved?: () => void;
};

export default function LibraryMappingPanel({ serverId, libraryKey, roots, onSaved }: Props) {
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
        const list = (s.pathMappings || []).filter(m => m.server_id === serverId);
        const initial: Record<string, Mapping> = {};
        for (const r of roots) {
          const hit = list.find(x => x.plex_root === r);
          initial[r] = { plex_root: r, local_root: hit?.local_root || "", status: "unknown" };
        }
        setMappings(initial);
      } catch {
        const initial: Record<string, Mapping> = {};
        for (const r of roots) initial[r] = { plex_root: r, local_root: "", status: "unknown" };
        setMappings(initial);
      }
    })();
  }, [serverId, libraryKey, roots.join("|")]);

  const rows = useMemo(() => roots.map(r => mappings[r] || { plex_root: r, local_root: "" }), [roots, mappings]);

  async function pickDir(root: string) {
    let openFn: undefined | ((opts: any) => Promise<any>);
    try {
      const pluginName = '@tauri-apps/plugin-dialog';
      const mod = await import(/* @vite-ignore */ pluginName);
      openFn = (mod as any).open;
    } catch { /* ignore */ }
    if (!openFn) {
      try {
        const apiName = '@tauri-apps/api/dialog';
        const mod = await import(/* @vite-ignore */ apiName);
        openFn = (mod as any).open;
      } catch { /* ignore */ }
    }
    if (!openFn) {
      const manual = window.prompt('Enter local folder path for:\n' + root, mappings[root]?.local_root || '');
      if (manual) setMappings(prev => ({ ...prev, [root]: { ...prev[root], local_root: manual } }));
      return;
    }
    try {
      const sel = await openFn({ multiple: false, directory: true });
      if (typeof sel === 'string' && sel) {
        setMappings(prev => ({ ...prev, [root]: { ...prev[root], local_root: sel } }));
      }
    } catch { /* ignore */ }
  }

  async function test(root: string) {
    const m = mappings[root];
    if (!m) return;
    try {
      const res = await invoke<{ ok: boolean; exists: boolean; writable: boolean; details: string }>("test_mapping", {
        serverId, server_id: serverId, _server_id: serverId,
        plexRoot: root, plex_root: root, _plex_root: root,
        localRoot: m.local_root, local_root: m.local_root,
      });
      setMappings(prev => ({ ...prev, [root]: { ...prev[root], status: res.ok ? 'ok' : (!res.exists ? 'missing' : (!res.writable ? 'not_writable' : 'unknown')), details: res.details } }));
    } catch (e: any) {
      setMappings(prev => ({ ...prev, [root]: { ...prev[root], status: 'missing', details: e?.message || String(e) } }));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const cur = await invoke<{ pathMappings?: any[] }>("get_settings");
      const list = Array.isArray(cur.pathMappings) ? cur.pathMappings.slice() : [];
      const rootsSet = new Set(roots);
      const filtered = list.filter((m: any) => !(m.server_id === serverId && rootsSet.has(m.plex_root)));
      const toAdd = rows.filter(r => r.local_root.trim()).map(r => ({ server_id: serverId, plex_root: r.plex_root, local_root: r.local_root }));
      await invoke("save_settings", { settings: { pathMappings: [...filtered, ...toAdd] } });
      onSaved?.();
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/50">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/80">
          <tr className="text-left text-neutral-300">
            <th className="px-3 py-2 font-medium">Plex Root</th>
            <th className="px-3 py-2 font-medium">Local Path</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.plex_root} className="border-t border-neutral-800">
              <td className="px-3 py-2 font-mono text-xs text-neutral-300">{r.plex_root}</td>
              <td className="px-3 py-2">
                <input
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                  placeholder="e.g., Z:\\Series or /mnt/nas/Series"
                  value={mappings[r.plex_root]?.local_root || ''}
                  onChange={(e) => setMappings(prev => ({ ...prev, [r.plex_root]: { ...prev[r.plex_root], plex_root: r.plex_root, local_root: e.target.value } }))}
                />
                {mappings[r.plex_root]?.details && (
                  <div className="pt-1 text-xs text-neutral-500">{mappings[r.plex_root]?.details}</div>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => pickDir(r.plex_root)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">Pick…</button>
                  <button onClick={() => test(r.plex_root)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">Test</button>
                  {mappings[r.plex_root]?.status === 'ok' && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">OK</span>}
                  {mappings[r.plex_root]?.status === 'missing' && <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">Missing</span>}
                  {mappings[r.plex_root]?.status === 'not_writable' && <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] text-yellow-300">Read-only</span>}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-3 text-sm text-neutral-400">No roots for this library.</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <button onClick={save} disabled={saving} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400 disabled:opacity-50">Save Mappings</button>
      </div>
    </div>
  );
}

