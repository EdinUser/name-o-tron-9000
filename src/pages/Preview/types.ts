import type { PlexLibrary, PlexServer } from "../../types/plex";

export type Props = {
    server: PlexServer;
    library: PlexLibrary;
    onBack: () => void;
};

export type MovieItem = {
    type: "movie";
    ratingKey: string;
    title: string;
    year?: number;
    file: string;
    plexPath?: string; // Original Plex path
    edition?: string;
    editionTitle?: string;
    genre?: string;
    rating?: string;
    studio?: string;
    director?: string;
    writer?: string;
    country?: string;
    tagline?: string;
    summary?: string;
    guid?: string;
    imdbId?: string;
    thetvdbId?: string;
    thumb?: string;
};

export type EpisodeItem = {
    type: "episode";
    ratingKey: string;
    showTitle: string;
    title: string;
    season?: number;
    index?: number; // episode number
    file: string;
    plexPath?: string; // Original Plex path
    grandparentTitle?: string;
    parentTitle?: string;
    parentIndex?: number;
    year?: number;
    guid?: string;
    imdbId?: string;
    thetvdbId?: string;
    thumb?: string;
};

export type MusicItem = {
    type: "music";
    ratingKey: string;
    artist: string;
    album: string;
    track: string;
    trackNumber?: number;
    disc?: number;
    file: string;
    plexPath?: string; // Original Plex path
    year?: number;
    genre?: string;
    guid?: string;
    thumb?: string;
};

export type PreviewRow = {
    id: string;
    kind: "movie" | "episode" | "music";
    filePath: string;
    plexPath?: string; // Original Plex path
    proposed: string;
    status: "good" | "warning" | "error" | "unmatched";
    flags: string[];
    // Original Plex metadata for popover display
    metadata?: MovieItem | EpisodeItem | MusicItem;
    // Subtitle operations for this file
    subtitleOperations?: Array<{
        originalPath: string;
        proposedPath: string;
        operationType: string;
        warningFlags: string[];
    }>;
};

export type SectionResponse = any; // shape varies by library type (mock fixtures)

export type RawMediaItem = MovieItem | EpisodeItem | MusicItem;
