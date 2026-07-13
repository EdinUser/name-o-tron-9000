---
description: "How Name-o-Tron renames Plex subtitle files with media files, preserves or normalizes language codes, handles forced/SDH subtitles, and previews subtitle operations safely."
---

# Plex Subtitle Renamer

Name-o-Tron can rename subtitle sidecar files together with the media item they belong to. This keeps video and subtitle basenames aligned after a rename or folder reorganization.

## Why Subtitle Names Matter

Media servers usually discover external subtitles by matching them to the video basename and language or role suffixes.

Before:

```text
Bad.Movie.Name.1080p.mkv
random.subtitle.en.srt
```

After:

```text
Blade Runner (1982).mkv
Blade Runner (1982).eng.srt
```

## What Name-o-Tron Handles

- Detect subtitle files associated with selected media.
- Rename subtitles to follow the finalized video basename.
- Preserve, normalize, or strip language codes according to settings.
- Preserve or normalize forced and SDH markers depending on settings.
- Convert subtitle encoding to UTF-8 when enabled.
- Create backups before subtitle conversion when enabled.
- Include subtitle operations in preview and rollback logs.

## Subtitle Safety

Subtitle operations are previewed before apply. They are treated as part of the complete media item, not as unrelated files.

Name-o-Tron checks for target conflicts, duplicate subtitle operations, missing sources, and uncertain encoding situations before touching files.

## Example

```text
Blade.Runner.1982.mkv
Blade.Runner.1982.en.forced.srt
Blade.Runner.1982.en.sdh.srt
```

can become:

```text
Blade Runner (1982).mkv
Blade Runner (1982).eng.forced.srt
Blade Runner (1982).eng.sdh.srt
```

The exact suffix format depends on subtitle settings.

For filename templates, see [Renaming & Templates](renaming-and-templates.md). For subtitle settings, see [Configuration & Settings](settings.md#general-tab).
