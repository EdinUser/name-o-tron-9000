import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../state/theme";
import { useSettings } from "../../state/settings";
import type { PlexLibrary, PlexServer } from "../../types/plex";
import ShowSelectionTemplate from "./ShowSelectionTemplate";
import { dirnamePlexPath } from "../Preview/plexRefresh";
import {
  loadShowMappingCache,
  saveShowMappingCache,
  invalidateShowMappingCache,
  generateMappingsChecksum,
  extractMetadataFromShow,
  isCacheValid,
  generateServerId,
  isShowMapped,
  type PathMapping
} from "../../utils/cache";

function debugShowSelection(...args: unknown[]) {
  if (typeof window !== "undefined" && (window as any).__NAMEOTRON_DEBUG_SHOW_SELECTION__) {
    console.debug(...args);
  }
}

/**
 * Fetch and cache poster image using the same approach as PlexPopoverCard
 */
async function fetchCachedPoster(serverUrl: string, ratingKey: string, thumb?: string): Promise<string | undefined> {
  if (!thumb) return undefined;

  try {
    let token: string | null = null;
    try { token = localStorage.getItem("plexToken"); } catch {}

    // Use the same imagePath format as PlexPopoverCard
    const imagePath = thumb || `/library/metadata/${ratingKey}/thumb/0`;

    const result = await invoke<string>("fetch_plex_image", {
      serverUrl: serverUrl,
      imagePath: imagePath,
      token: token || ""
    });

    if (typeof result === "string" && result.startsWith("data:image/jpeg;base64,")) {
      return result;
    }
  } catch (error) {
    console.warn("Failed to fetch cached poster:", error);
  }

  return undefined;
}

type Props = {
  server: PlexServer;
  library: PlexLibrary; // must be type "show"
  onBack: () => void;
  onSelectShow: (show: { ratingKey: string; title: string }, currentPage: number) => void;
  initialPage?: number;
};

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

function extractTotalCount(mediaContainer: any): number | null {
  const rawTotal =
    mediaContainer?.totalSize ??
    mediaContainer?.total ??
    mediaContainer?.librarySectionSize ??
    mediaContainer?.grandTotalSize ??
    null;

  const parsed = Number(rawTotal ?? 0);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

export default function ShowSelectionContainer({ server, library, onBack, onSelectShow, initialPage }: Props) {

  const { resolvedTheme, toggleTheme } = useTheme();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [buildingCache, setBuildingCache] = useState(false);
  // Tracks whether we've completed at least one load attempt
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<TvShow[]>([]);
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [serverId, setServerId] = useState<string>("");
  const itemsPerPage = Math.max(1, settings.general.pagination.defaultShowLimit || 20);
  const paging = useRef({ start: 0, size: itemsPerPage, exhausted: false });
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [queryState, setQueryState] = useState("");
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [rescanningShowId, setRescanningShowId] = useState<string | null>(null);

  // Track active request id to avoid race-condition UI flicker
  // Bump this on every load() call to ignore stale responses
  const activeRequestIdRef = useRef(0);
  // Track number of in-flight load() calls
  const inFlightCountRef = useRef(0);
  // Track if we've restored the initial page for this navigation
  const initialPageRestoredRef = useRef(false);
  // Avoid double-loading on first mount; initial data load is handled separately.
  const searchEffectInitializedRef = useRef(false);

  // Wrapper for setQuery
  const setQuery = (value: string) => {
    setQueryState(value);
  };

  // Use the state value for all operations
  const query = queryState;

  const filteredShows = useMemo(() => {
    if (!query.trim()) return shows;
    const searchQuery = query.toLowerCase();
    return shows.filter(s =>
      s.title.toLowerCase().includes(searchQuery)
    );
  }, [shows, query]);

  const totalPages = useMemo(() => {
    const len = totalItems ?? filteredShows.length;
    return Math.max(1, Math.ceil(len / itemsPerPage));
  }, [filteredShows.length, itemsPerPage, totalItems]);

  const pagedShows = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredShows.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredShows, currentPage, itemsPerPage]);

  useEffect(() => {
    paging.current = { start: 0, size: itemsPerPage, exhausted: false };
  }, [itemsPerPage]);

  const debounce = useRef<number | null>(null);

  useEffect(() => {
    try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Shows"); } catch {}
  }, []);

  // Cleanup on unmount - only clear timeouts
  useEffect(() => {
    return () => {
      // Clear any pending timeouts on unmount
      if (debounce.current) {
        window.clearTimeout(debounce.current);
        debounce.current = null;
      }
    };
  }, []);

  // Load persisted search query on mount
  useEffect(() => {
    const storageKey = `showSearch-${server.address}-${library.key}`;
    try {
      const persistedQuery = sessionStorage.getItem(storageKey);
      if (persistedQuery) {
        setQuery(persistedQuery);
      }
    } catch (error) {
      console.warn("Failed to load persisted search query:", error);
    }
  }, [server.address, library.key]);

  // Persist search query when it changes
  useEffect(() => {
    const storageKey = `showSearch-${server.address}-${library.key}`;
    try {
      if (query) {
        sessionStorage.setItem(storageKey, query);
      } else {
        sessionStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn("Failed to persist search query:", error);
    }
  }, [queryState, server.address, library.key]);

  // Restore scroll position when shows are loaded
  useEffect(() => {
    if (shows.length > 0) {
      const storageKey = `showScroll-${server.address}-${library.key}`;
      try {
        const scrollY = sessionStorage.getItem(storageKey);
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY, 10));
        }
      } catch (error) {
        console.warn("Failed to restore scroll position:", error);
      }
    }
  }, [shows.length, server.address, library.key]);

  // Persist scroll position on scroll
  useEffect(() => {
    let scrollTimeout: number | null = null;

    const handleScroll = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      scrollTimeout = window.setTimeout(() => {
        const storageKey = `showScroll-${server.address}-${library.key}`;
        try {
          sessionStorage.setItem(storageKey, String(window.scrollY));
        } catch (error) {
          console.warn("Failed to persist scroll position:", error);
        }
      }, 150); // Debounce scroll events
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [server.address, library.key]);

  // Load path mappings
  useEffect(() => {
    async function loadMappings() {
      try {
        // Check if invoke is available (Tauri backend)
        if (typeof invoke === 'undefined') {
          throw new Error("Tauri invoke function not available - are you running in Tauri mode? Try 'npm run tauri dev' instead of 'npm run dev'");
        }

        const settings = await invoke<{ pathMappings?: PathMapping[] }>("get_settings");
        const mappings = settings.pathMappings || [];
        debugShowSelection(`[ShowSelection] Loaded ${mappings.length} path mappings:`, mappings);
        setMappings(mappings);

        // Use proper server ID generation
        const cleanServerId = generateServerId(server);
        debugShowSelection(`[ShowSelection] Generated server ID: ${cleanServerId}`);
        setServerId(cleanServerId);
      } catch (error) {
        // Set error state regardless of mount state - errors should always be visible
        setError(`Failed to load path mappings: ${error}`);
        setMappings([]);
        setServerId("");
      }
    }

    // Load mappings - errors are handled within loadMappings function
    loadMappings();
  }, [server.address, server.machineIdentifier]);

  // Refresh shows when mappings change
  useEffect(() => {
    if (shows.length > 0 && mappings.length >= 0 && serverId && serverId !== "" && !serverId.includes("undefined")) {
      async function refreshMappingStatus() {
        // Invalidate cache for this library since mappings changed
        await invalidateShowMappingCache(serverId, library.key);

        // Also invalidate cache with old server.address format in case it exists
        const oldServerId = server.machineIdentifier || server.address;
        if (oldServerId !== serverId) {
          await invalidateShowMappingCache(oldServerId, library.key);
        }

        // Reload shows to get fresh mapping data
        await load(true);
      }

      refreshMappingStatus();
    }
  }, [mappings, serverId, library.roots, library.key, server.address, server.machineIdentifier]);

  async function load(reset = false) {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    inFlightCountRef.current += 1;
    setLoading(true);
    setError(null);
    try {
      const isStale = () => requestId !== activeRequestIdRef.current;

      // Ensure serverId is valid before proceeding with cache operations
      if (!serverId || serverId === "" || serverId.includes("undefined")) {
        return;
      }

      let token: string | null = null;
      try { token = localStorage.getItem("plexToken"); } catch {}

      if (reset) {
        paging.current = { start: 0, size: itemsPerPage, exhausted: false };
      }

      // Fetch current shows from Plex
      const resp = await invoke<any>("fetch_tv_shows", {
        server: server.address,
        libraryKey: library.key,
        token: token ?? null,
        start: paging.current.start,
        size: paging.current.size,
        query: query.trim() || null,
      });
      if (isStale()) return;

      const fetchedShows = resp?.MediaContainer?.Directory ?? [];
      const fetchedTotal = extractTotalCount(resp?.MediaContainer);
      const returnedCount = Number(resp?.MediaContainer?.size ?? fetchedShows.length) || fetchedShows.length;
      const responseOffset = Number(resp?.MediaContainer?.offset ?? paging.current.start) || paging.current.start;
      if (fetchedTotal !== null) {
        setTotalItems(fetchedTotal);
      } else if (fetchedShows.length === 0) {
        setTotalItems(responseOffset);
      } else if (reset) {
        setTotalItems(null);
      }
      if (fetchedShows.length === 0) {
        if (reset) setShows([]);
        if (fetchedTotal === null) {
          setTotalItems(responseOffset);
        }
        paging.current.exhausted = true;
        setInitialized(true);
        return;
      }

      const existingKeys = reset ? new Set<string>() : new Set(shows.map((show) => show.ratingKey));
      const fetchedKeys = fetchedShows
        .map((show: any) => String(show.ratingKey ?? show.key ?? ""))
        .filter(Boolean);

      if (!reset && fetchedKeys.length > 0 && fetchedKeys.every((key: string) => existingKeys.has(key))) {
        paging.current = {
          ...paging.current,
          exhausted: true,
        };
        setTotalItems((prev) => prev ?? shows.length);
        setInitialized(true);
        return;
      }

      // Generate current mappings checksum for cache validation
      debugShowSelection("[ShowSelection] Generating checksum for mappings");
      const currentMappingsChecksum = await generateMappingsChecksum(mappings, serverId);
      if (isStale()) return;

      // Load existing cache
      debugShowSelection("[ShowSelection] Loading cache for server:", serverId, "library:", library.key);
      const cache = await loadShowMappingCache(serverId, library.key);
      if (isStale()) return;

      // Check if cache is valid
      const cacheValid = isCacheValid(cache, currentMappingsChecksum);

      let updatedCache: any = cache;

      // If cache invalid, start from a fresh structure but preserve any existing entries to avoid data loss
      if (!cacheValid) {
        // Clear the container immediately so the upcoming "Building cache…" message is clear
        setShows([]);
        setBuildingCache(true);
        updatedCache = {
          lastUpdated: Date.now(),
          mappingsChecksum: currentMappingsChecksum,
          shows: cache?.shows ? { ...cache.shows } : {}
        };
      }

      // Always detect new shows missing from cache and build entries for them
      const cachedKeys = new Set(Object.keys(updatedCache?.shows || {}));
      const newShows = fetchedShows.filter((s: any) => {
        const key = String(s.ratingKey ?? s.key ?? "");
        return key && !cachedKeys.has(key);
      });

      if (newShows.length > 0) {
        setBuildingCache(true);

        for (const show of newShows) {
          if (isStale()) return;
          const ratingKey = String(show.ratingKey ?? show.key ?? "");
          if (!ratingKey) continue;

          try {
            // Fetch episode data for location mapping (check multiple episodes)
            const episodeResp = await invoke<any>("fetch_show_episodes", {
              server: server.address,
              showRatingKey: ratingKey,
              token: token ?? null,
              start: 0,
              size: 10, // Check up to 10 episodes to determine if show is mapped
            });
            if (isStale()) return;

            const { isMapped, location } = isShowMapped(episodeResp, mappings, serverId);

            // Extract metadata from the show data (already available from fetch_tv_shows)
            const metadata = extractMetadataFromShow(show, server.address);

            // Ensure cache object exists
            if (!updatedCache) {
              updatedCache = {
                lastUpdated: Date.now(),
                mappingsChecksum: currentMappingsChecksum,
                shows: {}
              };
            }

            updatedCache.shows[ratingKey] = {
              isMapped,
              location,
              lastChecked: Date.now(),
              ...metadata
            };
          } catch (episodeError) {
            console.warn(`Failed to fetch data for show ${show.title}:`, episodeError);
            // Add to cache as unmapped if fetch fails
            if (!updatedCache) {
              updatedCache = {
                lastUpdated: Date.now(),
                mappingsChecksum: currentMappingsChecksum,
                shows: {}
              };
            }
            const rk = String(show.ratingKey ?? show.key ?? "");
            updatedCache.shows[rk] = {
              isMapped: false,
              location: "",
              lastChecked: Date.now()
            };
          }
        }

        // Refresh cache metadata and persist
        // Ensure non-null before save
        const safeCache = updatedCache ?? {
          lastUpdated: Date.now(),
          mappingsChecksum: currentMappingsChecksum,
          shows: {}
        };
        safeCache.lastUpdated = Date.now();
        safeCache.mappingsChecksum = currentMappingsChecksum;
        await saveShowMappingCache(serverId, library.key, safeCache);
        if (isStale()) return;
        setBuildingCache(false);
      }

      // Avoid interim "Checking..." state; build final list directly once cache status is known

      // Build final shows array with mapping status after cache is built
      const finalShows: TvShow[] = [];
      for (const show of fetchedShows) {
        if (isStale()) return;
        const ratingKey = String(show.ratingKey ?? show.key ?? "");
        const title = String(show.title ?? "");

        if (!ratingKey) continue;

        // Get mapping data from cache (either existing or newly fetched)
        const cachedShow = updatedCache?.shows?.[ratingKey];

        // Fetch cached poster for this show
        const cachedPosterUrl = await fetchCachedPoster(server.address, ratingKey, show.thumb);
        if (isStale()) return;

        if (cachedShow) {
          // Show has been checked - use actual cached data
          // Merge metadata: prefer cached values, fall back to fresh Plex show fields
          const plexYear = show.year ? parseInt(show.year, 10) : undefined;
          const plexGenre = show.Genre?.length > 0 ? (Array.isArray(show.Genre) ? show.Genre[0].tag : show.Genre.tag) : undefined;
          const plexStudio = show.studio;
          finalShows.push({
            ratingKey,
            title,
            posterUrl: cachedShow.posterUrl || (show.thumb ? `${server.address}${show.thumb}` : undefined),
            cachedPosterUrl: cachedShow.cachedPosterUrl || cachedPosterUrl,
            location: cachedShow.location || "",
            isMapped: cachedShow.isMapped,
            mappingStatus: 'checked' as const,
            year: cachedShow.year ?? plexYear,
            genre: cachedShow.genre ?? plexGenre,
            studio: cachedShow.studio ?? plexStudio,
            creators: cachedShow.creators,
            yearsRunning: cachedShow.yearsRunning
          });
        } else {
          // Show has not been checked yet - don't treat as unmapped, but show metadata from Plex
          finalShows.push({
            ratingKey,
            title,
            posterUrl: show.thumb ? `${server.address}${show.thumb}` : undefined,
            cachedPosterUrl,
            location: "",
            isMapped: undefined,
            mappingStatus: 'unchecked' as const,
            year: show.year ? parseInt(show.year, 10) : undefined,
            genre: show.Genre?.length > 0 ? (Array.isArray(show.Genre) ? show.Genre[0].tag : show.Genre.tag) : undefined,
            studio: show.studio,
            creators: undefined,
            yearsRunning: undefined
          });
        }
      }


      const uniqueFinalShows = reset
        ? finalShows
        : finalShows.filter((show) => !existingKeys.has(show.ratingKey));

      if (!reset && uniqueFinalShows.length === 0) {
        paging.current = {
          ...paging.current,
          exhausted: true,
        };
        setTotalItems((prev) => prev ?? shows.length);
        setInitialized(true);
        setBuildingCache(false);
        return;
      }

      // Update shows with final mapping status after cache is built
      debugShowSelection("[ShowSelection] Setting shows in UI:", uniqueFinalShows.length, "shows");
      if (reset) setShows(uniqueFinalShows);
      else setShows(prev => [...prev, ...uniqueFinalShows]);

      const nextStart = responseOffset + returnedCount;
      paging.current = {
        start: nextStart,
        size: itemsPerPage,
        exhausted: fetchedTotal ? nextStart >= fetchedTotal : uniqueFinalShows.length === 0,
      };
      setInitialized(true);
      setBuildingCache(false);
    } catch (e: any) {
      console.error("[ShowSelection] Load function failed:", e);
      // Set error state regardless of mount state - errors should always be visible
      setError(e?.message ?? String(e));
      setInitialized(true);
    } finally {
      debugShowSelection("[ShowSelection] Load function completed");
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      if (inFlightCountRef.current === 0) setLoading(false);
    }
  }

  useEffect(() => {
    // Wait for both mappings and serverId to be properly initialized
    // serverId must not be empty string and must be a proper server identifier
    if (mappings.length >= 0 && serverId && serverId !== "" && !serverId.includes("undefined")) {
      setCurrentPage(initialPage || 1);
      setTotalItems(null);
      load(true); /* initial */
    }
  }, [mappings, serverId, itemsPerPage]);

  // Debounced search
  useEffect(() => {
    if (!searchEffectInitializedRef.current) {
      searchEffectInitializedRef.current = true;
      return;
    }

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      setCurrentPage(1);
      setTotalItems(null);
      load(true);
    }, 350);

    // Note: Cleanup is handled by the dedicated unmount effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryState]);

  // Reset the restoration flag when initialPage changes (new navigation)
  useEffect(() => {
    initialPageRestoredRef.current = false;
  }, [initialPage]);

  // Update currentPage when initialPage changes (e.g., when navigating back)
  // Only restore once per navigation to avoid interfering with user pagination
  useEffect(() => {
    if (initialized && initialPage && !initialPageRestoredRef.current && initialPage <= totalPages) {
      setCurrentPage(initialPage);
      initialPageRestoredRef.current = true;
    }
  }, [initialPage, initialized, totalPages]);

  useEffect(() => {
    const loadedPages = Math.ceil(shows.length / itemsPerPage);
    if (currentPage > loadedPages && !paging.current.exhausted && !loading) {
      load(false);
    }
  }, [currentPage, itemsPerPage, shows.length, loading]);

  useEffect(() => {
    if (loading) return;
    if (paging.current.exhausted) return;
    if (totalItems !== null) return;
    if (shows.length === 0) return;

    load(false);
  }, [shows.length, totalItems, loading]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  async function rescanShow(show: TvShow) {
    if (!show.location) {
      alert(`Plex rescan is unavailable for "${show.title}" because no mapped show path was found.`);
      return;
    }

    const showPath = dirnamePlexPath(dirnamePlexPath(show.location));

    let token: string | null = null;
    try {
      token = localStorage.getItem("plexToken");
    } catch {
      token = null;
    }

    if (!token) {
      alert("Plex token is missing. Log in on the Home screen before triggering a show rescan.");
      return;
    }

    const sectionId = Number(library.key);
    if (!Number.isFinite(sectionId)) {
      alert(`Library key "${library.key}" is not numeric, so a show rescan cannot be triggered.`);
      return;
    }

    setRescanningShowId(show.ratingKey);
    try {
      const result = await invoke<string>("plex_refresh_library_section_with_path", {
        server: server.address,
        sectionId,
        path: showPath,
        token,
      });
      console.log("[ShowSelection] Plex show rescan started:", { show: show.title, path: showPath, result });
      alert(`Plex rescan started for:\n${show.title}\n\n${showPath}`);
    } catch (error) {
      console.error("[ShowSelection] Plex show rescan failed:", { show: show.title, path: showPath, error });
      alert(`Plex show rescan failed for:\n${show.title}\n\n${String(error)}`);
    } finally {
      setRescanningShowId(null);
    }
  }

  return (
    <ShowSelectionTemplate
      server={server}
      library={library}
      loading={loading}
      buildingCache={buildingCache}
      initialized={initialized}
      error={error}
      shows={shows}
      filteredShows={filteredShows}
      pagedShows={pagedShows}
      currentPage={currentPage}
      totalPages={totalPages}
      query={query}
      resolvedTheme={resolvedTheme}
      onBack={onBack}
      onSelectShow={onSelectShow}
      onSetQuery={setQuery}
      onRefresh={() => {
        setCurrentPage(1);
        setTotalItems(null);
        load(true);
      }}
      onRescanShow={rescanShow}
      onPageChange={handlePageChange}
      onToggleTheme={toggleTheme}
      rescanningShowId={rescanningShowId}
    />
  );
}
