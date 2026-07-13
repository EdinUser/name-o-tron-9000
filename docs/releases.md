---
description: "Download the latest Name-o-Tron 9000 installers for Windows, macOS, and Linux, and review recent release notes."
---

# Downloads & Releases

The latest installers are published on the server and described by `release.json`.

## Latest release

{% if release %}
- **Version:** {{ release.get("version", "unknown") }}
- **Date:** {{ release.get("date", "unknown") }}
{% else %}
_Release info unavailable. The site will update after the next release run._
{% endif %}

## What's New in 0.2.1

- **Startup risk acknowledgement**: First launch now requires an explicit acknowledgement before any library workflow is available, with a prominent beta warning and Exit option.
- **Remote search parity**: Remote Plex search results in Preview now get the same block-view poster fetching and subtitle operation markers as normally loaded rows.
- **Version metadata alignment**: npm, Tauri, Cargo, Cargo lock, and Linux metainfo release metadata are aligned on `0.2.1`.

## What's New in 0.2.0

- **Safer Plex follow-up refreshes**: Rename and undo flows now trigger scoped Plex rescans for affected movie folders, episode folders, or show folders instead of relying on an automatic full-library scan.
- **Better large-library browsing**: Preview and TV flows are more responsive with improved pagination, search fallback to Plex when local filtering finds nothing, and more stable loading behavior for larger show libraries.
- **Template workflow improvements**: The Preview template field now keeps recent per-library template history and lets you promote useful entries to saved favorites for faster reuse.
- **Support bundles for troubleshooting**: Settings → General can now export a support ZIP bundle with redacted environment details plus recent rollback logs, preview snapshots, and error excerpts to help diagnose problems.
- **Preview snapshots for bug reports**: The Preview screen can export an environment-redacted snapshot of the current state, including active filters and visible rows.
- **Expanded subtitle and rollback coverage**: Subtitle operations and rollback behavior are documented and better integrated into the overall rename workflow.

## Installers

### Linux
{% if release and release.get("platforms", {}).get("linux") %}
{% for filename in release["platforms"]["linux"] %}
- [{{ filename }}](https://name-o-tron.kirilov.dev/downloads/{{ release["version"] }}/{{ filename }})
{% endfor %}
{% else %}
No Linux installers listed.
{% endif %}

### Windows
{% if release and release.get("platforms", {}).get("windows") %}
{% for filename in release["platforms"]["windows"] %}
- [{{ filename }}](https://name-o-tron.kirilov.dev/downloads/{{ release["version"] }}/{{ filename }})
{% endfor %}
{% else %}
No Windows installers listed.
{% endif %}
