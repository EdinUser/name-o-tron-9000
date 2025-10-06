import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../state/theme";
import type { PlexLibrary, PlexServer } from "../../types/plex";
import ShowSelectionTemplate from "./ShowSelectionTemplate";

type Props = {
  server: PlexServer;
  library: PlexLibrary; // must be type "show"
  onBack: () => void;
  onSelectShow: (show: { ratingKey: string; title: string }) => void;
};

type TvShow = { ratingKey: string; title: string };

export default function ShowSelectionContainer({ server, library, onBack, onSelectShow }: Props) {
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
    <ShowSelectionTemplate
      server={server}
      library={library}
      loading={loading}
      error={error}
      shows={shows}
      filteredShows={filteredShows}
      query={query}
      paging={paging}
      resolvedTheme={resolvedTheme}
      onBack={onBack}
      onSelectShow={onSelectShow}
      onSetQuery={setQuery}
      onLoad={load}
      onToggleTheme={toggleTheme}
    />
  );
}
