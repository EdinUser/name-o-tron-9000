import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../state/theme";
import type { PlexLibrary, PlexServer } from "../types/plex";
import { IconArrowBack, IconArrowForward, IconHome, IconRefresh, IconSearch, IconSettings, IconSun, IconMoon } from "../components/icons";

type Props = {
  server: PlexServer;
  library: PlexLibrary; // must be type "show"
  onBack: () => void;
  onSelectShow: (show: { ratingKey: string; title: string }) => void;
};

type TvShow = { ratingKey: string; title: string };

export default function ShowSelection({ server, library, onBack, onSelectShow }: Props) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<TvShow[]>([]);
  const paging = useRef({ start: 0, size: 200, exhausted: false });
  const [query, setQuery] = useState("");
  const debounce = useRef<number | null>(null);

  useEffect(() => { try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Shows"); } catch {} }, []);

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      let token: string | null = null;
      try { token = localStorage.getItem("plexToken"); } catch {}
      if (reset) {
        paging.current = { start: 0, size: 200, exhausted: false };
      }
      const resp = await invoke<any>("fetch_tv_shows", {
        server: server.address,
        libraryKey: library.key,
        token: token ?? null,
        start: paging.current.start,
        size: paging.current.size,
        query: query.trim() || null,
      });
      const dir = resp?.MediaContainer?.Directory ?? [];
      const next: TvShow[] = dir
        .map((d: any) => ({ ratingKey: String(d.ratingKey ?? d.key ?? ""), title: String(d.title ?? "") }))
        .filter((s: TvShow) => s.ratingKey);
      if (reset) setShows(next);
      else setShows(prev => [...prev, ...next]);
      if (next.length === 0 || next.length < paging.current.size) paging.current.exhausted = true;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(true); /* initial */ }, []);

  // Debounced search
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      // If we have a search query and no results, try loading more shows first
      if (query.trim() && shows.length > 0) {
        const filtered = shows.filter(s =>
          s.title.toLowerCase().includes(query.toLowerCase())
        );
        if (filtered.length === 0 && !paging.current.exhausted) {
          // Load more shows for search
          load(false);
          return;
        }
      }
      load(true);
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const filteredShows = useMemo(() => {
    if (!query.trim()) return shows;

    const searchQuery = query.toLowerCase();
    return shows.filter(s =>
      s.title.toLowerCase().includes(searchQuery)
    );
  }, [shows, query]);

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              <IconArrowBack className="h-5 w-5" />
              Back
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => (window as any).__goto_home?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              <IconHome className="h-5 w-5" />
              Home
            </button>
            <button type="button" onClick={() => (window as any).__goto_settings?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              <IconSettings className="h-5 w-5" />
              Settings
            </button>
            <button onClick={toggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-4 text-center text-2xl font-bold">Select TV Show</h1>

        {/* Library info and search on the same line */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-400">
            Library: <span className="text-neutral-200">{library.title}</span> — Server: <span className="text-neutral-200">{server.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Quick search…"
                className="w-[300px] rounded-md border border-neutral-700 bg-neutral-900 pl-8 pr-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500"
              />
            </div>
            <button onClick={() => load(true)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              <IconRefresh className="h-5 w-5" />
              Refresh
            </button>
          </div>
        </div>

        {loading && <p className="text-center text-neutral-400">Loading shows…</p>}
        {error && <p className="text-center text-red-300">Error: {error}</p>}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          {filteredShows.length === 0 && !loading && !error && (
            <p className="text-neutral-400">
              {shows.length === 0 ? "No shows found." : "No shows match your search."}
            </p>
          )}
          {filteredShows.length > 0 && (
            <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              {filteredShows.map((s: TvShow) => (
                <li key={s.ratingKey} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-3 hover:border-neutral-700">
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-neutral-400">RatingKey {s.ratingKey}</div>
                  </div>
                  <button onClick={() => onSelectShow(s)} className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-cyan-400">
                    <IconArrowForward className="h-5 w-5" />
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-center">
            {shows.length > 0 && (
              <button
                onClick={() => {
                  if (!paging.current.exhausted) {
                    paging.current.start += paging.current.size;
                    load(false);
                  }
                }}
                disabled={paging.current.exhausted}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50"
              >
                Load more
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

