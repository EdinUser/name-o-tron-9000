---
description: "Detailed guide to Name-o-Tron renaming templates, placeholders, optional groups, recent templates, saved templates, provider IDs, editions, and subtitle behavior."
---

# Renaming & Templates

Templates control how Plex metadata becomes filenames. They are one of the most important parts of Name-o-Tron because they define the visible shape of your normalized library.

Name-o-Tron templates are previewed before anything is applied. A template creates a proposal; validation decides whether that proposal is safe.

## Core Rule

Templates describe the filename stem and optional folder structure. The real file extension is preserved and appended by the app.

Recommended:

```text
{title}[ ({year})]
```

Not recommended for new templates:

```text
{title}[ ({year})]{ext}
```

Legacy `{ext}` entries are tolerated, but the app treats the real source extension as authoritative.

## Common Placeholders

| Placeholder | Meaning |
| --- | --- |
| `{title}` | Movie, episode, track, or item title depending on media type. |
| `{year}` | Release year when available. |
| `{showTitle}` | TV show title. |
| `{season}` | TV season number. |
| `{episode}` | TV episode number. |
| `{artist}` | Music artist where available. |
| `{album}` | Music album where available. |
| `{track}` | Music track number where available. |
| `{disc}` | Music disc number where available. |
| `{ids}` | Provider ID token output when the relevant ID setting enables it. |
| `{imdbToken}` | IMDb token such as `{imdb-tt0083658}` when available. |
| `{tmdbToken}` | TMDb token when available. |
| `{tvdbToken}` | TVDB token when available. |

Available values depend on what Plex exposes for the selected item.

## Formatting

Use numeric padding for season, episode, track, and disc numbers:

```text
{showTitle} - S{season:02}E{episode:02} - {title}
```

If season is `1` and episode is `3`, this renders as:

```text
Show Name - S01E03 - Episode Title.mkv
```

## Optional Groups

Text inside square brackets appears only when the placeholders inside it have values.

```text
{title}[ ({year})]
```

If `year` is available:

```text
Blade Runner (1982).mkv
```

If `year` is missing:

```text
Blade Runner.mkv
```

## Movie Templates

Simple movie template:

```text
{title}[ ({year})]
```

Movie template with provider ID:

```text
{title}[ ({year})] [{imdbToken}]
```

Example output:

```text
Blade Runner (1982) {imdb-tt0083658}.mkv
```

Movie folder settings can also create collection folders, alphabetical folders, decade folders, genre folders, or one folder per movie.

## TV Templates

Common episode template:

```text
{showTitle} - S{season:02}E{episode:02} - {title}
```

Multi-episode files are normalized into a Plex-style range when detected:

```text
Show Name - S01E01-E02 - Episode Title.mkv
```

Season folders are controlled by TV settings. Specials can be placed under Season 00 or Specials depending on settings.

## Music Templates

Music templates support artist, album, disc, track, and title values when Plex exposes them.

Common track template:

```text
{artist}/{album}/{track:02} - {title}
```

Example output:

```text
Artist Name/Album Name/01 - Track Title.flac
```

Disc subfolders and track normalization are controlled by Music settings.

## Editions and Versions

Movie edition handling can preserve Plex edition tokens, expand them into readable labels, or keep both depending on settings.

Example:

```text
Blade Runner (1982) - Final Cut {edition-Final Cut}.mkv
```

Name-o-Tron can also detect edition-like terms from filenames when that setting is enabled, then route the result through the same preview and validation system.

## Recent and Saved Templates

The Preview screen keeps recent templates per library workflow so you can quickly return to templates you tried during a session.

Useful recent templates can be promoted to saved templates. Saved templates are persistent favorites intended for repeated workflows, such as:

- clean movie filenames
- movie folders with IMDb IDs
- TV episodes with season folders
- compact music track naming

Recent templates are for experimentation. Saved templates are for stable naming schemes.

## Manual Metadata Fixes

Manual metadata edits in Preview flow through the same template system. If you change a title, year, season number, episode number, or edition in the preview interface, the proposal is recalculated from that corrected value.

This is useful for one-off cleanup without changing your global template.

## Subtitles

When subtitle renaming is enabled, subtitles follow the finalized media basename.

Example:

```text
Blade Runner (1982).mkv
Blade Runner (1982).eng.srt
Blade Runner (1982).forced.srt
```

Language codes can be preserved, normalized, or stripped according to subtitle settings. Encoding conversion to UTF-8 can also be enabled with optional backups.

For subtitle-specific behavior, see [Subtitle Renaming](plex-subtitle-renamer.md).

## Preview and Safety

Templates do not directly rename files. They generate proposals. Name-o-Tron then validates those proposals for unsafe characters, long paths, reserved names, duplicate targets, existing targets, permission problems, and related issues.

That separation is important: template creativity is allowed, but unsafe operations are still blocked before apply.
