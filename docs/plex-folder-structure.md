---
description: "Guide to organizing Plex movie, TV, and music folder structures with Name-o-Tron using Plex metadata, templates, collections, IDs, and path mapping."
---

# Plex Folder Structure

Name-o-Tron can do more than rename filenames. It can use Plex metadata and your settings to create predictable folder structures for Movies, TV Shows, and Music.

The output is media-server-friendly, but it is not limited to a single rigid Plex convention. You choose the structure that fits your library.

## Movie Folders

Common movie layout:

```text
Movies/
└── Blade Runner (1982)/
    ├── Blade Runner (1982).mkv
    └── Blade Runner (1982).eng.srt
```

Movie layout with provider ID:

```text
Movies/
└── Blade Runner (1982) {imdb-tt0083658}/
    └── Blade Runner (1982) {imdb-tt0083658}.mkv
```

Available movie organization settings include:

- one folder per movie
- alphabetical folders
- alphabetical ranges
- genre folders
- decade folders
- collection folders
- edition and version handling
- provider ID preservation or appending

## TV Show Folders

Common TV layout:

```text
TV Shows/
└── Show Name/
    └── Season 01/
        ├── Show Name - S01E01 - Pilot.mkv
        └── Show Name - S01E02 - Episode Title.mkv
```

Specials and OVA-like episodes can use Season 00 or Specials behavior depending on settings.

Multi-episode files are normalized into episode ranges when detected:

```text
Show Name - S01E01-E02 - Combined Episode.mkv
```

## Music Folders

Common music layout:

```text
Music/
└── Artist Name/
    └── Album Name/
        ├── 01 - First Track.flac
        └── 02 - Second Track.flac
```

Music settings can control artist, album, disc, and track formatting. Multi-disc albums can use disc subfolders when enabled.

## Collections and IDs

Collections help group related movies. Provider IDs help preserve identity across tools that understand tags such as IMDb, TMDb, or TVDB identifiers.

Adding IDs can make names longer, but it can also make files easier to recognize reliably after moving libraries, rebuilding a server database, or comparing metadata across tools.

## Path Mapping

If Plex runs on another machine, Plex paths may not match paths on the computer running Name-o-Tron.

Example:

```text
Plex sees:  /media/Movies
Local sees: /mnt/nas/Movies
```

Path mapping tells Name-o-Tron how to resolve those roots safely before it previews or applies changes.

For practical setup advice, see [Tips & Best Practices](tips.md#path-mapping). For all folder-related options, see [Configuration & Settings](settings.md).
