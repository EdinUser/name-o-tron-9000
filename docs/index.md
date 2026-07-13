---
description: "Name-o-Tron 9000 is a Plex file renamer and media-library organizer that uses existing Plex metadata to create clean, portable files and folders with preview, validation, and rollback."
---

# Name-o-Tron 9000

<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
  <img src="assets/name-o-tron-animate.svg" alt="Name-o-Tron 9000 animated logo" style="max-width:180px;min-width:140px;">
  <div>
    <p><strong>Your media library should outlive your media server.</strong></p>
    <p>Name-o-Tron uses metadata already curated in Plex to rename, organize, and normalize your Movies, TV Shows, and Music.</p>
    <p style="margin-top:4px;color:#9ca3af;">Plex file renamer, Plex metadata organizer, media-library normalization, subtitle renamer, folder structure cleanup.</p>
  </div>
</div>

Name-o-Tron 9000 is a Plex file renamer and media-library organizer that uses your existing Plex metadata to safely normalize files, folders, and subtitles.

Name-o-Tron does not identify your media again through another scraper. It uses the titles, years, episodes, albums, editions, and provider IDs you have already matched and corrected in Plex, then applies them to your files and folders.

Name-o-Tron is intended for users whose media is already matched correctly in Plex but whose underlying filenames, folders, subtitles, or library structure remain inconsistent, ambiguous, or difficult to migrate.

Name-o-Tron currently requires access to a Plex Media Server because Plex provides the matched metadata. A portable library means the identity of your media remains visible in filenames, folders, provider-ID tags, and subtitles instead of existing only inside one media-server database.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Name-o-Tron 9000",
  "description": "A safety-first Plex file renamer and media-library organizer that uses existing Plex metadata to rename, organize, and normalize Movies, TV Shows, Music, subtitles, and folders.",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Windows, macOS, Linux",
  "url": "https://name-o-tron.kirilov.dev/",
  "downloadUrl": "https://name-o-tron.kirilov.dev/downloads/",
  "license": "https://github.com/EdinUser/name-o-tron-9000/blob/main/LICENSE",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>

## What It Does

- **Use Plex's existing matches**: read titles, years, seasons, episodes, albums, artwork references, and provider IDs from Plex instead of rematching files through another scraper.
- **Normalize the filesystem**: rename media files, create predictable folders, and apply configurable structures for Movies, TV Shows, and Music.
- **Preserve identity**: keep or append stable identifiers such as IMDb, TMDb, and TVDB IDs when metadata exposes them.
- **Handle related files**: rename subtitles with the media item and support subtitle language-code and encoding workflows.
- **Work with real storage**: map Plex server paths to local Windows, macOS, Linux, NAS, and remote mount paths.
- **Preview and recover**: validate paths, conflicts, permissions, and unsafe names before applying changes, then record operations for rollback.

## Example Output

```text
Movies/
└── Blade Runner (1982) {imdb-tt0083658}/
    ├── Blade Runner (1982) {imdb-tt0083658}.mkv
    └── Blade Runner (1982) {imdb-tt0083658}.eng.srt
```

Stable provider IDs reduce ambiguity between remakes, alternate titles, regional titles, and similarly named media. They can help compatible tools identify the correct item without relying only on title matching.

## Start Here

If you are evaluating the app, read [What is Name-o-Tron?](what-is-name-o-tron.md) for the shortest factual overview.

If you already know you want to rename files using Plex metadata, start with [Rename with Plex Metadata](rename-files-using-plex-metadata.md), then configure [Renaming & Templates](renaming-and-templates.md).

If your main concern is library layout, see [Folder Structures](plex-folder-structure.md). For sidecar subtitle files, see [Subtitle Renaming](plex-subtitle-renamer.md).

Join the [Name-o-Tron Discord](https://discord.gg/Hp9B3Ayuj7) for discussion, feedback, and release questions.

## Quick Start

1. Install Name-o-Tron from the [Downloads](releases.md) page.
2. Open the app and accept the startup risk acknowledgement only when you are ready to work with real files.
3. Connect to Plex through discovery, manual server entry, and PIN authentication.
4. Select a Movies, TV Shows, or Music library.
5. Configure path mappings so Plex server paths resolve to local filesystem paths.
6. Choose or edit templates for filenames and folders.
7. Preview the proposed operations and review the traffic-light statuses.
8. Apply only safe selected operations; use rollback if a completed batch needs to be reversed.

## Safety Model

Name-o-Tron never treats renaming as a blind text replacement. It shows proposed changes first and blocks selected operations with red status. Warnings stay visible for review, and completed operations are logged so the latest supported rename batch can be undone.

For the full capability list, see [Features](features.md). For every setting, see [Configuration & Settings](settings.md). For practical workflow advice, see [Tips & Best Practices](tips.md).
