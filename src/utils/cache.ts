import { invoke } from "@tauri-apps/api/core";

function debugCache(...args: unknown[]) {
  if (typeof window !== "undefined" && (window as any).__NAMEOTRON_DEBUG_CACHE__) {
    console.debug(...args);
  }
}

export interface ShowMappingData {
  isMapped: boolean;
  location: string;
  lastChecked: number;
  year?: number;
  genre?: string;
  studio?: string;
  director?: string;
  writer?: string;
  posterUrl?: string;
  cachedPosterUrl?: string;
  creators?: string[];
  yearsRunning?: string;
}

export interface ShowMappingCache {
  lastUpdated: number;
  mappingsChecksum: string;
  shows: Record<string, ShowMappingData>;
}

export interface PathMapping {
  server_id: string;
  plex_root: string;
  local_root: string;
  platform?: string;
}

/**
 * Generate a checksum for path mappings to detect changes
 */
export async function generateMappingsChecksum(mappings: PathMapping[], serverId?: string): Promise<string> {
  if (!serverId) {
    throw new Error("serverId is required for checksum generation");
  }
  // Convert mapping entries to camelCase keys expected by Rust PathMappingDto (serde rename_all = "camelCase")
  const camelMappings = (mappings || []).map(m => ({
    serverId: m.server_id,
    plexRoot: m.plex_root,
    localRoot: m.local_root,
    platform: m.platform ?? null,
  }));

  const payload: any = { serverId, server_id: serverId, mappings: camelMappings };

  try {
    debugCache("[cache] generateMappingsChecksum → input", { serverId, mappingsSample: mappings?.[0], mappingsLength: mappings?.length });
    debugCache("[cache] generateMappingsChecksum → payload", payload);
    const result = await invoke<string>("generate_mappings_checksum_cmd", payload);
    debugCache("[cache] generateMappingsChecksum ← result", result);
    return result;
  } catch (err) {
    console.error("[cache] generateMappingsChecksum × error", err);
    throw err;
  }
}

/**
 * Load show mapping cache for a specific server/library combination
 */
export async function loadShowMappingCache(serverId: string, libraryId: string): Promise<ShowMappingCache | null> {
  try {
    const payload = { serverId, server_id: serverId, libraryId, library_id: libraryId };
    debugCache("[cache] loadShowMappingCache →", payload);
    const result = await invoke<ShowMappingCache | null>("load_show_mapping_cache", payload);
    debugCache("[cache] loadShowMappingCache ←", { hasResult: !!result, keys: result ? Object.keys(result) : [] });
    return result;
  } catch (error) {
    console.warn("Failed to load show mapping cache:", error);
    return null;
  }
}

/**
 * Save show mapping cache for a specific server/library combination
 */
export async function saveShowMappingCache(serverId: string, libraryId: string, cache: ShowMappingCache): Promise<void> {
  try {
    const payload = { serverId, server_id: serverId, libraryId, library_id: libraryId, cache };
    debugCache("[cache] saveShowMappingCache →", { serverId, libraryId, cacheSummary: { lastUpdated: cache?.lastUpdated, shows: cache ? Object.keys(cache.shows || {}).length : 0 } });
    await invoke<void>("save_show_mapping_cache", payload);
    debugCache("[cache] saveShowMappingCache ← ok");
  } catch (error) {
    console.warn("Failed to save show mapping cache:", error);
  }
}

/**
 * Invalidate (delete) show mapping cache for a specific server/library combination
 */
export async function invalidateShowMappingCache(serverId: string, libraryId: string): Promise<void> {
  try {
    const payload = { serverId, server_id: serverId, libraryId, library_id: libraryId };
    debugCache("[cache] invalidateShowMappingCache →", payload);
    await invoke<void>("invalidate_show_mapping_cache", payload);
    debugCache("[cache] invalidateShowMappingCache ← ok");
  } catch (error) {
    console.warn("Failed to invalidate show mapping cache:", error);
  }
}

/**
 * Check if cache is valid by comparing mappings checksum
 */
export function isCacheValid(cache: ShowMappingCache | null | undefined, currentMappingsChecksum: string): boolean {
  if (!cache) return false;
  return cache.mappingsChecksum === currentMappingsChecksum;
}

/**
 * Extract location from Plex episode response
 */
export function extractLocationFromEpisode(episodeData: any): string {
  const episodes = episodeData?.MediaContainer?.Metadata || episodeData?.MediaContainer?.Video || [];
  if (episodes.length > 0) {
    const episode = episodes[0];
    const media = episode.Media?.[0];
    const part = media?.Part?.[0];
    return part?.file ? String(part.file) : "";
  }
  return "";
}

/**
 * Check if a show is mapped by examining a few episodes.
 * Returns true if any episode's path can be resolved using the path mappings.
 */
export function isShowMapped(episodeData: any, pathMappings: PathMapping[], serverId: string): { isMapped: boolean; location: string } {
  const episodes = episodeData?.MediaContainer?.Metadata || episodeData?.MediaContainer?.Video || [];

  // Check up to 3 episodes to find one that's mapped (performance optimization)
  for (let i = 0; i < Math.min(episodes.length, 3); i++) {
    const episode = episodes[i];
    const media = episode.Media?.[0];
    const part = media?.Part?.[0];
    const filePath = part?.file ? String(part.file) : "";

    if (filePath && canResolvePath(filePath, pathMappings, serverId)) {
      return { isMapped: true, location: filePath };
    }
  }

  // If no episodes are mapped, return the location of the first episode (if any)
  const firstEpisode = episodes[0];
  const firstMedia = firstEpisode?.Media?.[0];
  const firstPart = firstMedia?.Part?.[0];
  const firstFilePath = firstPart?.file ? String(firstPart.file) : "";

  return { isMapped: false, location: firstFilePath };
}

/**
 * Check if a Plex path can be resolved using the path mappings.
 * Similar to the backend resolve_plex_path logic.
 */
function canResolvePath(plexPath: string, pathMappings: PathMapping[], serverId: string): boolean {
  if (!plexPath) return false;

  // Normalize path separators
  const normalizedPath = plexPath.replace(/\\/g, '/');

  debugCache(`[canResolvePath] Checking path: ${normalizedPath} with ${pathMappings.length} mappings for server ${serverId}`);

  // Find the best matching mapping for this server
  let bestMatch: PathMapping | null = null;
  let bestMatchLength = 0;

  for (const mapping of pathMappings) {
    debugCache(`[canResolvePath] Checking mapping: server_id=${mapping.server_id}, plex_root=${mapping.plex_root}`);

    // Check if mapping is for this server (similar to backend server_ids_match)
    if (!serverIdsMatch(mapping.server_id, serverId)) {
      debugCache(`[canResolvePath] Skipping mapping - server ID doesn't match`);
      continue;
    }

    // Normalize mapping root
    const normalizedRoot = mapping.plex_root.replace(/\\/g, '/').replace(/\/$/, '');

    debugCache(`[canResolvePath] Comparing: "${normalizedPath}" starts with "${normalizedRoot}/"`);

    // Check if the path starts with this root (same logic as backend)
    if (normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + '/')) {
      debugCache(`[canResolvePath] Match found! Root length: ${normalizedRoot.length}`);
      if (normalizedRoot.length > bestMatchLength) {
        bestMatch = mapping;
        bestMatchLength = normalizedRoot.length;
        debugCache(`[canResolvePath] This is the best match so far`);
      }
    }
  }

  const result = bestMatch !== null;
  debugCache(`[canResolvePath] Final result: ${result}`);
  return result;
}

/**
 * Check if two server IDs match (similar to backend server_ids_match function)
 */
function serverIdsMatch(mappingId: string, serverId: string): boolean {
  if (mappingId === serverId) {
    return true;
  }

  // Extract hostname from both IDs
  function hostOnly(id: string): string {
    // Remove scheme (http:// or https://)
    let withoutScheme = id;
    const schemeIndex = id.indexOf('://');
    if (schemeIndex !== -1) {
      withoutScheme = id.substring(schemeIndex + 3);
    }

    // Remove port (everything after first colon)
    const colonIndex = withoutScheme.indexOf(':');
    if (colonIndex !== -1) {
      return withoutScheme.substring(0, colonIndex);
    }

    return withoutScheme;
  }

  return hostOnly(mappingId) === hostOnly(serverId);
}


/**
 * Clear all show mapping caches
 */
export async function clearAllShowMappingCaches(): Promise<{total_files_found: number, files_removed: string[], cache_directory_exists: boolean} | undefined> {
  try {
    return await invoke("clear_all_show_mapping_caches");
  } catch (error) {
    console.warn("Failed to clear all show mapping caches:", error);
    return undefined;
  }
}

/**
 * Get cache key for logging/debugging purposes
 */
export function getCacheKey(serverId: string, libraryId: string): string {
  return `showMappingCache:${serverId}:${libraryId}`;
}

/**
 * Get the actual cache directory path (for debugging)
 */
export async function getCacheDirectoryPath(): Promise<string> {
  try {
    // This is a bit of a hack, but we can call the backend function to get the cache path
    const result = await invoke<string>("get_cache_directory_path");
    return result;
  } catch (error) {
    console.warn("Failed to get cache directory path:", error);
    return "unknown";
  }
}

/**
 * Extract metadata from Plex show response
 * Based on Plex OpenAPI documentation for TV show metadata fields
 */
export function extractMetadataFromShow(showData: any, serverAddress: string): {
  posterUrl?: string;
  year?: number;
  genre?: string;
  creators?: string[];
  studio?: string;
  yearsRunning?: string;
} {
  const result: any = {};

  // Extract poster URL
  if (showData.thumb) {
    result.posterUrl = `${serverAddress}${showData.thumb}`;
  }

  // Extract year
  if (showData.year) {
    result.year = parseInt(showData.year, 10);
  }

  // Extract genre (take first genre if available)
  if (showData.Genre) {
    if (Array.isArray(showData.Genre) && showData.Genre.length > 0) {
      result.genre = showData.Genre[0].tag || showData.Genre[0];
    } else if (typeof showData.Genre === 'object' && showData.Genre.tag) {
      result.genre = showData.Genre.tag;
    } else if (typeof showData.Genre === 'string') {
      result.genre = showData.Genre;
    }
  }

  // Extract studio (single string field, not array)
  if (showData.studio) {
    result.studio = showData.studio;
  }

  // Extract creators (writers, directors, cast, etc.)
  const creators: string[] = [];
  if (showData.Writer) {
    const writers = Array.isArray(showData.Writer) ? showData.Writer : [showData.Writer];
    creators.push(...writers.map((w: any) => w.tag || w));
  }
  if (showData.Director) {
    const directors = Array.isArray(showData.Director) ? showData.Director : [showData.Director];
    creators.push(...directors.map((d: any) => d.tag || d));
  }
  if (showData.Role) {
    // Role field contains cast/actors - include a few key cast members
    const roles = Array.isArray(showData.Role) ? showData.Role : [showData.Role];
    const castMembers = roles.slice(0, 3).map((r: any) => r.tag || r); // First 3 cast members
    creators.push(...castMembers);
  }
  if (creators.length > 0) {
    result.creators = [...new Set(creators)]; // Remove duplicates
  }

  // Extract years running (format as "year-year" if available)
  if (showData.year && showData.childCount) {
    // For TV shows, we can estimate end year based on child count (seasons)
    // This is a rough estimate - Plex doesn't always provide exact end year
    const startYear = parseInt(showData.year, 10);
    const estimatedEndYear = startYear + Math.ceil(showData.childCount / 2);
    result.yearsRunning = `${showData.year}-${estimatedEndYear}`;
  }

  return result;
}

/**
 * Generate a clean server ID for cache keys
 * Uses machineIdentifier if available, otherwise extracts hostname from address
 */
export function generateServerId(server: { machineIdentifier?: string; address: string }): string {
  // Use machineIdentifier if available (proper Plex server ID)
  if (server.machineIdentifier && server.machineIdentifier.trim()) {
    return server.machineIdentifier.trim();
  }

  if (!server.address) {
    return '';
  }

  // Otherwise, extract hostname from address (remove protocol and port)
  try {
    const url = new URL(server.address);
    return url.hostname || server.address; // e.g., "192.168.1.132"
  } catch {
    // Fallback: remove protocol and port manually
    let cleanAddress = server.address
      .replace(/^https?:\/\//, '') // Remove http:// or https://
      .split(':')[0]; // Remove port number (everything after first colon)

    return cleanAddress || server.address;
  }
}
