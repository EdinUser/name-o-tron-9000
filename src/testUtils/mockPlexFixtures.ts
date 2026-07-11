import moviesAll from "../../tests/mock-plex/fixtures/movies_all.json";
import libraries from "../../tests/mock-plex/fixtures/libraries.json";
import searchMovies from "../../tests/mock-plex/fixtures/search_movies.json";
import searchTv from "../../tests/mock-plex/fixtures/search_tv.json";
import showsAll from "../../tests/mock-plex/fixtures/shows_all.json";
import tvAllLeaves from "../../tests/mock-plex/fixtures/tv_all_leaves.json";

type AnyRecord = Record<string, any>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function movieEntries(): AnyRecord[] {
  return clone(moviesAll.MediaContainer.Metadata as AnyRecord[]);
}

function showEntries(): AnyRecord[] {
  return clone(showsAll.MediaContainer.Directory as AnyRecord[]);
}

function libraryEntries(): AnyRecord[] {
  return clone(libraries.MediaContainer.Directory as AnyRecord[]);
}

function searchMovieEntries(): AnyRecord[] {
  return clone(searchMovies.MediaContainer.Hub?.[0]?.Metadata as AnyRecord[] ?? []);
}

function searchTvEntries(): AnyRecord[] {
  return clone(searchTv.MediaContainer.Hub?.[0]?.Metadata as AnyRecord[] ?? []);
}

function episodeEntries(): AnyRecord[] {
  return clone(tvAllLeaves.MediaContainer.Metadata as AnyRecord[]);
}

export function getMockMovieByRatingKey(ratingKey: string): AnyRecord {
  const movie = movieEntries().find((entry) => String(entry.ratingKey) === String(ratingKey));
  if (!movie) {
    throw new Error(`Mock movie fixture not found for ratingKey ${ratingKey}`);
  }
  return movie;
}

export function getMockShows(limit?: number): AnyRecord[] {
  const entries = showEntries();
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

export function getMockMovies(limit?: number): AnyRecord[] {
  const entries = movieEntries();
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

export function getMockSearchMovies(limit?: number): AnyRecord[] {
  const entries = searchMovieEntries();
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

export function getMockSearchTv(limit?: number): AnyRecord[] {
  const entries = searchTvEntries();
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

export function buildMockLibraries(): AnyRecord[] {
  return libraryEntries().map((entry) => ({
    key: entry.key,
    type: entry.type,
    title: entry.title,
    roots: Array.isArray(entry.Location) ? entry.Location.map((location: AnyRecord) => location.path) : [],
  }));
}

export function getMockEpisodesForShow(showRatingKey: string): AnyRecord[] {
  return episodeEntries().filter(
    (entry) => String(entry.grandparentRatingKey) === String(showRatingKey),
  );
}

export function getMockEpisodesForShowSeason(showRatingKey: string, seasonIndex: number, limit?: number): AnyRecord[] {
  const entries = getMockEpisodesForShow(showRatingKey).filter(
    (entry) => Number(entry.parentIndex ?? -1) === seasonIndex,
  );
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

export function buildMockShowSeasonDirectories(showRatingKey: string): AnyRecord[] {
  const seasonMap = new Map<number, AnyRecord>();
  for (const entry of getMockEpisodesForShow(showRatingKey)) {
    const seasonIndex = Number(entry.parentIndex ?? 0);
    let seasonEntry = seasonMap.get(seasonIndex);
    if (!seasonEntry) {
      seasonEntry = {
        ratingKey: `${showRatingKey}-season-${seasonIndex}`,
        key: `/library/metadata/${showRatingKey}/children?season=${seasonIndex}`,
        type: "season",
        title: entry.parentTitle || (seasonIndex === 0 ? "Specials" : `Season ${String(seasonIndex).padStart(2, "0")}`),
        index: seasonIndex,
        leafCount: 0,
        thumb: entry.thumb,
      };
      seasonMap.set(seasonIndex, seasonEntry);
    }
    seasonEntry.leafCount += 1;
  }
  return Array.from(seasonMap.values()).sort((left, right) => left.index - right.index);
}

export function buildMockShowEpisodesResponse(showRatingKey: string): AnyRecord {
  return {
    MediaContainer: {
      Metadata: getMockEpisodesForShow(showRatingKey),
    },
  };
}

export function buildShowSelectionShow(entry: AnyRecord): AnyRecord {
  return {
    ratingKey: entry.ratingKey,
    title: entry.title,
    thumb: entry.thumb,
    year: String(entry.year ?? ""),
    Genre: entry.Genre ?? [],
    studio: entry.studio ?? entry.Studio?.[0]?.tag ?? "",
    childCount: entry.leafCount ?? entry.childCount ?? 0,
  };
}

export function buildShowSelectionShows(limit?: number): AnyRecord[] {
  return getMockShows(limit).map(buildShowSelectionShow);
}

export function buildMovieProposalItem(ratingKey: string): AnyRecord {
  const entry = getMockMovieByRatingKey(ratingKey);
  return {
    type: "movie",
    ratingKey: entry.ratingKey,
    title: entry.title,
    year: entry.year,
    file: entry.Media?.[0]?.Part?.[0]?.file ?? "",
    plexPath: entry.Media?.[0]?.Part?.[0]?.file ?? "",
    guid: entry.guid,
    collection: entry.Collection?.[0]?.tag ?? "",
    edition: entry.edition,
    editionTitle: entry.editionTitle,
    Genre: entry.Genre ?? [],
  };
}

export function buildPreviewMovieMetadata(ratingKey: string): AnyRecord {
  const entry = getMockMovieByRatingKey(ratingKey);
  return {
    ratingKey: entry.ratingKey,
    title: entry.title,
    year: entry.year,
    Media: clone(entry.Media ?? []),
    guid: entry.guid,
    Guid: clone(entry.Guid ?? []),
    Collection: clone(entry.Collection ?? []),
    Genre: clone(entry.Genre ?? []),
  };
}
