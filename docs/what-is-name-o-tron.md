---
description: "A concise factual overview of Name-o-Tron 9000: what it is, what it supports today, what Plex provides, and what is planned for later."
---

# What is Name-o-Tron?

Name-o-Tron 9000 is a cross-platform desktop application for normalizing media libraries that are already managed in Plex.

It uses metadata already matched and curated in Plex to create consistent filenames, folder structures, subtitle names, and provider-ID tags for local media files.

## Current Product Model

| Question | Answer |
| --- | --- |
| What is it? | A safety-first Plex file renamer and media-library organizer. |
| What does Plex do? | Plex supplies the trusted metadata and existing media matches. |
| What does Name-o-Tron change? | Local files, folders, subtitles, and related rename operations selected by the user. |
| Does it scan raw folders without Plex? | No. Plex access is currently required. |
| Is the output useful outside Plex? | Yes. The resulting files and folders are designed to be clean, portable, and media-server-friendly. |
| Which platforms are supported? | Windows, macOS, and Linux. |
| Which media types are covered? | Movies, TV Shows, and Music libraries. |

## Facts at a Glance

| Field | Value |
| --- | --- |
| Current metadata source | Plex Media Server |
| Supported media types | Movies, TV Shows, Music |
| Supported platforms | Windows, Linux, macOS |
| Main operations | Rename files, reorganize folders, rename subtitles |
| Safety | Preview, validation, logs, rollback of the latest supported rename batch |
| Raw-folder identification | Not supported |
| Kodi NFO generation | Planned, not currently available |
| Local artwork export | Planned, not currently available |
| License | Apache-2.0 |
| Source repository | https://github.com/EdinUser/name-o-tron-9000 |
| Current version | 0.2.1 |
| Current status | Beta |

## Implemented Today

- Read Movies, TV Shows, and Music metadata from Plex.
- Rename media files using configurable templates.
- Create or reorganize folder structures.
- Handle collections, editions, versions, season folders, multi-episode files, and music disc layouts.
- Preserve or append provider identifiers where Plex exposes them.
- Rename subtitles with the related media item.
- Convert subtitle encoding when enabled.
- Resolve Plex paths to local paths through path mapping.
- Preview operations before they touch files.
- Validate unsafe paths, conflicts, permissions, path length, reserved names, and unsupported cases.
- Log completed operations and undo the latest supported rename batch.

## Limitations

- Plex is currently required as the metadata source.
- Plex matches should be correct before running rename operations.
- Name-o-Tron is not an independent media scraper and does not identify raw folders by itself.
- File access depends on correct path mapping and stable local or network storage.
- Rollback has boundaries: later manual changes, moved files, mount changes, destination collisions, permissions, or unavailable NAS storage can prevent reversal.
- Plex reconciliation behavior is partly controlled by Plex; Name-o-Tron can request focused updates, but Plex may scan a broader path or library section.
- Kodi NFO generation and local artwork export are not implemented yet.
- Backups or snapshots remain advisable before major filesystem operations.

## Not Implemented Yet

Name-o-Tron is moving toward more portable, self-describing media libraries, but these capabilities should be treated as roadmap direction until released:

- Kodi-compatible `.nfo` generation.
- Local artwork export.
- Broader local metadata sidecar creation.
- MusicBrainz enrichment.
- Full media-server-agnostic metadata export.

## Why This Exists

Media servers keep rich metadata in their own databases. Filesystems often remain messy, ambiguous, or hard to move. Name-o-Tron bridges that gap by turning trusted Plex matches into visible, durable file and folder organization.

That is the core idea:

```text
Existing Plex library
        ↓
trusted Plex metadata
        ↓
Name-o-Tron normalization
        ↓
clean, portable filesystem library
```

For the practical workflow, see [Rename with Plex Metadata](rename-files-using-plex-metadata.md). For template details, see [Renaming & Templates](renaming-and-templates.md).
