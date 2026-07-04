import {IconArrowBack, IconHome, IconRefresh, IconSearch, IconSettings, IconSun, IconMoon, IconBadgeAlert, IconX} from "../../components/icons";
import type { PlexLibrary, PlexServer } from "../../types/plex";

type TvShow = {
  ratingKey: string;
  title: string;
  posterUrl?: string;
  cachedPosterUrl?: string;
  location?: string;
  isMapped?: boolean;
  mappingStatus?: 'checked' | 'unchecked' | 'error';
  year?: number;
  genre?: string;
  studio?: string;
  creators?: string[];
  yearsRunning?: string;
};

type Props = {
  server: PlexServer;
  library: PlexLibrary;
  loading: boolean;
  buildingCache: boolean;
  initialized?: boolean;
  error: string | null;
  shows: TvShow[];
  filteredShows: TvShow[];
  pagedShows: TvShow[];
  query: string;
  resolvedTheme: string;
  currentPage: number;
  totalPages: number;
  onBack: () => void;
  onSelectShow: (show: { ratingKey: string; title: string }, currentPage: number) => void;
  onSetQuery: (query: string) => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onToggleTheme: () => void;
};

export default function ShowSelectionTemplate({
  server,
  library,
  loading,
  buildingCache,
  initialized = false,
  error,
  shows,
  filteredShows,
  pagedShows,
  query,
  resolvedTheme,
  currentPage,
  totalPages,
  onBack,
  onSelectShow,
  onSetQuery,
  onRefresh,
  onPageChange,
  onToggleTheme,
}: Props) {
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
            <button onClick={onToggleTheme} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
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
                onChange={(e) => onSetQuery(e.target.value)}
                placeholder="Quick search…"
                className={`w-[300px] rounded-md border border-neutral-700 bg-neutral-900 pl-8 pr-10 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 ${query ? 'pr-8' : 'pr-3'}`}
              />
              {query && (
                <button
                  onClick={() => onSetQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                  aria-label="Clear search"
                >
                  <IconX className="h-4 w-4" />
                </button>
              )}
            </div>
            <button onClick={onRefresh} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
              <IconRefresh className="h-5 w-5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Keep header hint minimal; main spinner appears in the container below */}
        {error && <p className="text-center text-red-300">Error: {error}</p>}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          {(loading || buildingCache) && (
            <div className="flex items-center justify-center py-8 text-neutral-400">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-500 border-t-transparent mr-2" />
              {buildingCache ? "Building cache…" : "Loading shows…"}
            </div>
          )}
          {filteredShows.length === 0 && initialized && !loading && !buildingCache && !error && (
            <p className="text-neutral-400">
              {shows.length === 0 ? "No shows found." : "No shows match your search."}
            </p>
          )}
          {filteredShows.length > 0 && (
            <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              {pagedShows.map((s: TvShow) => {
                // Show is unmapped if it has been checked and is not mapped
                const isUnmapped = s.mappingStatus === 'checked' && s.isMapped === false;

                return (
                  <li key={s.ratingKey} className={`flex items-center gap-4 rounded-lg border px-4 py-3 hover:border-neutral-700 ${
                    isUnmapped
                      ? 'border-red-500/50 bg-red-500/10'
                      : 'border-neutral-800 bg-neutral-800/40'
                  }`}>
                    {/* Plex Card/Poster Area */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-24 bg-neutral-700 rounded-md flex items-center justify-center text-neutral-400 text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                        {(s.cachedPosterUrl || s.posterUrl) ? (
                          <img
                            src={s.cachedPosterUrl || s.posterUrl}
                            alt={`${s.title} poster`}
                            className="w-full h-full object-cover rounded-md"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.parentElement!.innerHTML = 'Poster';
                              target.parentElement!.className = 'w-16 h-24 bg-neutral-700 rounded-md flex items-center justify-center text-neutral-400 text-xs';
                            }}
                            onClick={() => onSelectShow(s, currentPage)}
                          />
                        ) : (
                          <div onClick={() => onSelectShow(s, currentPage)}>Poster</div>
                        )}
                      </div>
                    </div>

                    {/* Show Information */}
                    <div className="flex-1 min-w-0">
                      <div className="mb-1">
                        <div
                          className="font-medium truncate cursor-pointer hover:text-cyan-300 transition-colors"
                          onClick={() => onSelectShow(s, currentPage)}
                        >
                          {s.title}
                        </div>
                        {isUnmapped && (
                          <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300 mt-1">
                            <IconBadgeAlert className="h-3.5 w-3.5" />
                            Unmapped
                          </span>
                        )}
                        {s.mappingStatus === 'unchecked' && (
                          <span className="inline-flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] text-yellow-300 mt-1">
                            Checking...
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm">
                        {(s.genre || s.yearsRunning) && (
                          <div className="flex items-center gap-2 text-neutral-400">
                            {s.genre && <span className="px-2 py-0.5 bg-neutral-700 rounded text-xs">{s.genre}</span>}
                            {s.yearsRunning && <span className="text-xs">({s.yearsRunning})</span>}
                          </div>
                        )}
                        {s.studio && (
                          <div className="text-neutral-400">
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">{s.studio}</span>
                          </div>
                        )}
                        {s.creators && s.creators.length > 0 && (
                          <div className="text-neutral-500">
                            <span className="text-xs text-neutral-400">Creators: </span>
                            <span className="text-xs">{s.creators.slice(0, 2).join(", ")}{s.creators.length > 2 ? ` +${s.creators.length - 2} more` : ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination Controls */}
          {filteredShows.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-neutral-400">Page {currentPage} / {totalPages}</span>
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
