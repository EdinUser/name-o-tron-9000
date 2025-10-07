import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../state/theme";
import { useSettings } from "../../state/settings";
import type { PlexLibrary, PlexServer } from "../../types/plex";
import ShowSelectionTemplate from "./ShowSelectionTemplate";
import { isItemMapped } from "../../pages/Preview/utils";
import {
  loadShowMappingCache,
  saveShowMappingCache,
  invalidateShowMappingCache,
  generateMappingsChecksum,
  extractLocationFromEpisode,
  extractMetadataFromShow,
  isCacheValid,
  generateServerId
} from "../../utils/cache";

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
  onSelectShow: (show: { ratingKey: string; title: string }) => void;
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

export default function ShowSelectionContainer({ server, library, onBack, onSelectShow }: Props) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [buildingCache, setBuildingCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<TvShow[]>([]);
  const [mappings, setMappings] = useState<Array<{ server_id: string; plex_root: string; local_root: string }>>([]);
  const [serverId, setServerId] = useState<string>("");
  const paging = useRef({ start: 0, size: settings.general.pagination.defaultShowLimit, exhausted: false });
  const [queryState, setQueryState] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Wrapper for setQuery
  const setQuery = (value: string) => {
    setQueryState(value);
  };

  // Use the state value for all operations
  const query = queryState;

  const debounce = useRef<number | null>(null);

  useEffect(() => {
    try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Shows"); } catch {}
    return () => {
      isMountedRef.current = false;
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
        const settings = await invoke<{ pathMappings?: { server_id: string; plex_root: string; local_root: string }[] }>("get_settings");
        const mappings = settings.pathMappings || [];
        setMappings(mappings);

        // Use proper server ID generation
        const cleanServerId = generateServerId(server);
        setServerId(cleanServerId);
      } catch (error) {
        setMappings([]);
        setServerId("");
      }
    }

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
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);
    try {
      // Ensure serverId is valid before proceeding with cache operations
      if (!serverId || serverId === "" || serverId.includes("undefined")) {
        if (isMountedRef.current) setLoading(false);
        return;
      }

      let token: string | null = null;
      try { token = localStorage.getItem("plexToken"); } catch {}

      if (reset) {
        paging.current = { start: 0, size: settings.general.pagination.defaultShowLimit, exhausted: false };
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

      const fetchedShows = resp?.MediaContainer?.Directory ?? [];
      if (fetchedShows.length === 0) {
        if (reset && isMountedRef.current) setShows([]);
        paging.current.exhausted = true;
        if (isMountedRef.current) setLoading(false);
        return;
      }

      // Generate current mappings checksum for cache validation
      const currentMappingsChecksum = await generateMappingsChecksum(mappings, serverId);

      // Load existing cache
      const cache = await loadShowMappingCache(serverId, library.key);

      // Check if cache is valid
      const cacheValid = isCacheValid(cache, currentMappingsChecksum);

      let updatedCache: any = cache;

      // If cache invalid, start from a fresh structure but preserve any existing entries to avoid data loss
      if (!cacheValid) {
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

      if (newShows.length > 0 && isMountedRef.current) {
        setBuildingCache(true);

        for (const show of newShows) {
          const ratingKey = String(show.ratingKey ?? show.key ?? "");
          if (!ratingKey) continue;

          try {
            // Fetch episode data for location mapping
            const episodeResp = await invoke<any>("fetch_show_episodes", {
              server: server.address,
              showRatingKey: ratingKey,
              token: token ?? null,
              start: 0,
              size: 1,
            });

            const location = extractLocationFromEpisode(episodeResp);
            const isMapped = location ? isItemMapped(location, library.roots || [], mappings, serverId) : false;

            // Extract metadata from the show data (already available from fetch_tv_shows)
            const metadata = extractMetadataFromShow(show, server.address);

            // Fetch cached poster for this show
            const newCachedPosterUrl = await fetchCachedPoster(server.address, ratingKey, show.thumb);

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
              cachedPosterUrl: newCachedPosterUrl,
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
            const newCachedPosterUrl = await fetchCachedPoster(server.address, rk, show.thumb);
            updatedCache.shows[rk] = {
              isMapped: false,
              location: "",
              lastChecked: Date.now(),
              cachedPosterUrl: newCachedPosterUrl
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
        if (isMountedRef.current) setBuildingCache(false);
      }

      // Avoid interim "Checking..." state; build final list directly once cache status is known

      // Build final shows array with mapping status after cache is built
      const finalShows: TvShow[] = [];
      for (const show of fetchedShows) {
        const ratingKey = String(show.ratingKey ?? show.key ?? "");
        const title = String(show.title ?? "");

        if (!ratingKey) continue;

        // Get mapping data from cache (either existing or newly fetched)
        const cachedShow = updatedCache?.shows?.[ratingKey];

        // Fetch cached poster for this show
        const cachedPosterUrl = await fetchCachedPoster(server.address, ratingKey, show.thumb);

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


      // Update shows with final mapping status after cache is built
      if (isMountedRef.current) {
        if (reset) setShows(finalShows);
        else setShows(prev => [...prev, ...finalShows]);
      }

      if (finalShows.length === 0 || finalShows.length < paging.current.size) {
        paging.current.exhausted = true;
      }
    } catch (e: any) {
      if (isMountedRef.current) setError(e?.message ?? String(e));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    // Wait for both mappings and serverId to be properly initialized
    // serverId must not be empty string and must be a proper server identifier
    if (mappings.length >= 0 && serverId && serverId !== "" && !serverId.includes("undefined")) {
      load(true); /* initial */
    }
  }, [mappings, serverId]);

  // Debounced search
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      // Check if component is still mounted before proceeding
      if (!isMountedRef.current) return;

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
      // Always reload when query changes (including when it becomes empty)
      load(true);
    }, 350);

    // Cleanup function to clear timeout on unmount
    return () => {
      if (debounce.current) {
        window.clearTimeout(debounce.current);
        debounce.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryState]);

  // Reset to first page when query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [queryState]);

  const filteredShows = useMemo(() => {
    if (!query.trim()) return shows;

    const searchQuery = query.toLowerCase();
    return shows.filter(s =>
      s.title.toLowerCase().includes(searchQuery)
    );
  }, [shows, queryState]);

  const totalPages = useMemo(() => {
    const len = filteredShows.length;
    return Math.max(1, Math.ceil(len / itemsPerPage));
  }, [filteredShows.length]);

  // Clamp current page within range when data size changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages]);

  const pagedShows = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredShows.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredShows, currentPage]);

  return (
    <ShowSelectionTemplate
      server={server}
      library={library}
      loading={loading}
      buildingCache={buildingCache}
      error={error}
      shows={shows}
      filteredShows={filteredShows}
      pagedShows={pagedShows}
      currentPage={currentPage}
      totalPages={totalPages}
      query={query}
      paging={paging}
      resolvedTheme={resolvedTheme}
      onBack={onBack}
      onSelectShow={onSelectShow}
      onSetQuery={setQuery}
      onLoad={load}
      onPageChange={setCurrentPage}
      onToggleTheme={toggleTheme}
    />
  );
}
