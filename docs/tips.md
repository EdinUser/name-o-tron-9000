# Tips & Best Practices

This guide provides practical advice for getting the most out of Name-o-Tron 9000 while avoiding common pitfalls.

## Plex Integration

### Server Discovery & Authentication

[tips_server_selector.png]

- **Multiple Servers**: The app can manage multiple Plex servers simultaneously. Use the server selector in the top navigation to switch between them.
- **Remembered Servers**: Discovered and manually added servers stay on the Home screen until you remove them, so remote or mock servers do not need to be re-added every launch.
- **Remote Access**: For Plex servers behind NAT/firewalls, use Home → Advanced Scan or manual server addition on the Home screen where the Discover functionality is located.

[tips_manual_server.png]
- **Token Persistence**: Choose "Secure (System Keyring)" for production use - it stores tokens encrypted in your OS credential store.

### Advanced Network Scanning
- **Complex Networks**: Use "Advanced Scan" when automatic discovery fails due to custom ports or network segmentation.
- **Custom Ports**: Specify alternative Plex Media Server ports (default is 32400).
- **Manual Hosts**: Provide specific IP addresses or hostnames to scan directly.
- **Progress Monitoring**: The scan overlay shows real-time progress and discovered servers.

### Library Organization
- **Consistent Naming**: Before using the app, ensure your Plex library is well-organized with consistent naming patterns.
- **Metadata Quality**: High-quality Plex metadata improves rename accuracy. Run "Refresh Metadata" in Plex if results seem inconsistent.
- **Library Types**: The app works best with properly configured Movie, TV Show, and Music libraries in Plex.

## Path Mapping

### Cross-Platform Setup
- **Windows**: Use UNC paths (`\\server\share`) or mapped drives (`Z:\Movies`) for network storage.
- **macOS**: Use `/Volumes/` mount points for external drives and network shares.
- **Linux**: Use `/mnt/` or `/media/` mount points consistently.

### Network Storage (NAS/SAN)

[tips_nas_mount.png]

- **Mount Stability**: Ensure NAS mounts are stable and reconnect automatically on system restart.
- **Permission Consistency**: The app needs the same file permissions as your user account.
- **Path Case Sensitivity**: Windows/macOS are case-insensitive; Linux is case-sensitive. Test mappings carefully.

### Mapping Best Practices
1. **Start Simple**: Begin with one library and expand gradually.
2. **Test Thoroughly**: Use the "Test Mapping" button before applying renames.

[tips_path_mapping_test.png]
3. **Backup First**: Always backup important data before large rename operations.
4. **Validate Paths**: Ensure both Plex paths and local paths exist and are accessible.

[tips_mapping_summary.png]

## Filename Handling

### Character Encoding

[tips_unicode_highlight.png]

- **Unicode Support**: The app preserves Unicode characters by default - ideal for international content.
- **Transliteration**: Use "Transliterate non-Latin → ASCII" for older systems or shared folders.
- **Highlight Non-Latin**: Enable this in General settings to spot potential encoding issues before renaming.

### Path Length Management

[tips_path_too_long.png]

- **255 Character Limit**: Windows has a hard limit; macOS/Linux support longer paths but >255 can cause issues.
- **Warn at 200**: The app warns at >200 characters to give buffer room.
- **Deep Nesting**: Avoid deeply nested folder structures that compound path length issues.

### Special Characters

[tips_reserved_name.png]

- **Invalid Characters**: The app automatically sanitizes `\ / : * ? " < > |` characters.
- **Reserved Names**: Windows reserved names (CON, AUX, etc.) are flagged when detected.
- **Long Filenames**: Very long base names contribute more to path length than deep folders.

## Media-Specific Tips

### Movies

[tips_movie_collections.png]

- **Collection Organization**: Use "Always group into collections" for series like Marvel movies.
- **Edition Detection**: The app automatically detects "Extended", "Director's Cut", "IMAX" from filenames.
- **Multiple Versions**: Enable "Append version name" for 4K, HDR, or commentary versions.
- **Individual Folders**: Enable "Put every movie in its own folder" for standard Plex organization.

### TV Shows

[tips_anime_specials.png]

- **Season Folders**: Always enable for proper Plex TV organization.
- **Multi-Episode Files**: Use "Normalize multi-episode files" to convert compact names like `S01E01E02` to Plex-style `S01E01-E02`.
- **Split Parts**: Files such as `S01E17 - pt1` / `part2` are treated as one episode split across files, not as multi-episode ranges.

[tips_multi_episode.png]
- **Special Episodes**: Enable "Detect OVA/Specials → Season 00" for anime and bonus content.
- **Episode Ranges**: The app handles `S01E01-E03` format for multi-episode files.

### Music

[tips_music_multidisc.png]

- **Artist/Album Structure**: Standard Plex music organization works best.
- **Multi-Disc Albums**: Enable "Put tracks into disc subfolders" for proper organization.
- **Track Numbering**: Use "Normalize track numbering" to ensure consistent `01 - Track Name` format.

## Performance & Usability

### Large Libraries

[tips_pagination.png]

- **Pagination**: Per-page limits are configurable. When a TV season page needs more rows, the app fetches the next episode batch automatically.
- **Search Behavior**: Debounced search (500ms) filters locally first, then queries Plex if no matches.
- **Preview Recalculation**: Settings changes immediately recalculate the preview - use this for experimentation.

### Batch Operations

[tips_status_filter.png]

- **Selective Processing**: Use checkboxes to select only the items you want to rename.
- **Status Filtering**: Use the status filters (Green/Yellow/Red/Unmatched) to focus on specific types of items.
- **Progress Monitoring**: Watch the progress bar during large operations.

### Search & Filtering

[tips_search.png]

- **Local Search**: Fast filtering of already-loaded items for immediate results.
- **Remote Search**: Always queries Plex API to ensure comprehensive results, as search terms may match content not yet loaded locally.
- **Search Scope**: Search includes both current library content and Plex database matches for complete coverage.

## Safety & Recovery

### Before Renaming

[tips_preview_review.png]

- **Preview Always**: Never skip the preview step - it's your safety net.
- **Status Review**: Carefully review all Yellow (warnings) and Red (blocking) items.
- **Test Runs**: Start with a small subset of files to verify behavior.
- **Backup Strategy**: Consider filesystem-level backups before large operations.

### During Operations

[tips_progress.png]

- **Progress Monitoring**: The app shows detailed progress for each operation.
- **Error Handling**: Individual failures don't stop the entire batch.
- **Rollback Logs**: Every operation creates detailed logs for potential undo (see [Rollback & Recovery](features.md#rollback--recovery)).

### After Operations

[tips_rollback_log.png]

- **Verify Results**: Check that files renamed correctly and Plex recognizes them.
- **Log Review**: Export and review logs for any issues or unexpected behavior.
- **Undo Ready**: Keep rollback logs until you're confident with the results (see [Rollback & Recovery](features.md#rollback--recovery)).

## Troubleshooting Common Issues

### Preview Issues
- **Slow Preview**: Large libraries may take time to load - be patient or use search to filter.
- **Inconsistent Results**: Check Plex metadata quality and refresh if needed.
- **Path Mapping Errors**: Verify all path mappings are correct and accessible.

### Rename Issues
- **Permission Denied**: Ensure the app has write access to destination folders.
- **Target Exists**: Use conflict resolution settings or manually resolve duplicates first.
- **Network Timeouts**: For NAS operations, ensure stable network connectivity.

### Plex Integration Issues
- **Server Not Found**: Check network connectivity and Plex server status.
- **Authentication Failed**: Verify Plex account credentials and server access.
- **Metadata Mismatch**: Refresh Plex library metadata if files aren't matching correctly.

## UI & View Modes

### Choosing View Modes
- **Table View**: Best for detailed inspection, sorting, and bulk operations on large libraries.
- **Blocks View**: Ideal for visual browsing, poster previews, and focused work on smaller sets of items.
- **Per-Library Preferences**: Set different view modes for Movies vs TV Shows based on your workflow.

### Blocks View Tips
- **Poster Loading**: Posters load progressively for better performance with large libraries.
- **Select All**: Use the left-aligned "Select all" toggle to quickly select all visible items on the current page.
- **Compact Information**: Hover over items for detailed metadata in popover cards.
- **Efficient for Reviews**: Perfect for final quality checks before applying renames.

## Advanced Recipes & Use Cases

This section covers advanced workflows for specific media types and complex setups.

### Anime & TV Specials
**For anime collections with specials/OVAs:**

1. **Enable Special Detection**: Settings > TV Shows > "Detect OVA/Specials → Season 00"
2. **Season Folder Organization**: Keep "Organize into season folders" enabled
3. **Multi-Episode Handling**: Enable "Normalize multi-episode files" so compact or dashed inputs normalize to `S01E01-E02`
4. **Template Customization**: Use `{showTitle} - S{season:02}E{episode:02} - {title}{ext}`

**Expected Results:**

[tips_anime_example.png]

- Regular episodes: `Attack on Titan - S01E01 - To You, in 2000 Years.ext`
- Specials/OVAs: `Attack on Titan - S00E01 - Special Episode.ext`
- Multi-episode: `Attack on Titan - S01E01-E02 - Combined Episode.ext`

### Multi-Disc Music Collections

[tips_classical_album.png]

**For classical music or complex album sets:**

1. **Disc Subfolders**: Settings > Music > Enable "Put tracks into disc subfolders"
2. **Track Normalization**: Enable "Normalize track numbering"
3. **Artist/Album Structure**: Use "Artist/Album/Track" format

**Setup Example:**
```
Beethoven - Complete Symphonies/
├── Symphony No. 1 in C major, Op. 21/
│   ├── CD 1/
│   │   ├── 01 - I. Adagio molto - Allegro con brio.mp3
│   │   └── 02 - II. Andante cantabile con moto.mp3
│   └── CD 2/
│       ├── 01 - III. Menuetto. Allegro molto e vivace.mp3
│       └── 02 - IV. Adagio - Allegro molto e vivace.mp3
```

### Large NAS & Network Storage
**For libraries stored on NAS or complex network setups:**

1. **Stable Mounts**: Ensure NAS mounts reconnect automatically on system restart
2. **Consistent Paths**: Use identical paths in both Plex and your local system
3. **Permission Alignment**: Ensure the app runs with the same user permissions as Plex
4. **Network Optimization**: Use wired connections for large operations

**Advanced Path Mapping:**

[tips_nas_summary.png]

- Test mappings with "Test Mapping" button before large operations
- Use UNC paths (`\\nas\media`) on Windows for reliability
- Monitor network performance during large batch operations

### Complex Movie Collections
**For extensive movie collections with multiple editions:**

1. **Collection Organization**: Use "Always group into collections" for series
2. **Edition Handling**: Enable all edition detection and expansion options
3. **Version Management**: Enable "Append version name" for 4K/HDR variants
4. **Individual Folders**: Enable "Put every movie in its own folder"

**Template Strategy:**
```
{title}[ ({year})][ - {edition}][ ({collection})]{ext}
```

**Results in:**

[tips_lotr_collection.png]

- `The Lord of the Rings - The Fellowship of the Ring (2001) (Extended Edition) (The Lord of the Rings Collection).mkv`
- `The Lord of the Rings - The Two Towers (2002) (4K HDR).mkv`

### Custom Naming Schemes
**For specialized naming requirements:**

1. **Study Template Placeholders**: Use the "?" help buttons for complete reference
2. **Test with Preview**: Experiment with settings and immediately see results
3. **Export/Import Settings**: Share successful configurations across machines
4. **Version Control Settings**: Keep settings files for backup and sharing

**Advanced Template Example:**

[tips_template_preview.png]

```
[{grandparentTitle}/]{parentTitle}/[{season:02}/]{showTitle} - S{season:02}E{episode:02} - {title}{ext}
```

### Mixed Plex/Jellyfin Libraries

[tips_dual_library.png]

**For users transitioning between Plex and Jellyfin or maintaining dual libraries:**

1. **Metadata Consistency**: Ensure both systems use similar metadata sources for consistent results
2. **Naming Convention Alignment**: Configure templates to match the target system's expectations
3. **Batch Processing**: Process libraries in smaller chunks to verify compatibility
4. **Rollback Strategy**: Keep detailed logs during transition for easy rollback if needed

**Migration Workflow:**
- Export Plex metadata before starting rename operations
- Process a test subset first to verify naming compatibility
- Monitor both systems during the transition period
- Use "Verify Results" step to ensure both systems recognize renamed files

### NAS Migration & Library Relocation

[tips_nas_migration.png]

**For moving large libraries between storage systems:**

1. **Pre-Migration Planning**: Map both old and new storage locations before starting
2. **Staged Migration**: Move and rename in smaller batches to minimize risk
3. **Network Optimization**: Use high-speed network connections for large transfers
4. **Verification Strategy**: Verify Plex recognition after each batch

**Migration Steps:**
1. Create path mappings for both old and new storage locations
2. Test with a small subset of files first
3. Process libraries in priority order (Movies → TV → Music)
4. Update Plex library paths after each completed section
5. Keep rollback logs until migration is fully verified

**Expected Results:**
- Old location: `/old-nas/Movies/Movie (2023).mkv`
- New location: `/new-nas/Media/Movies/Movie (2023)/Movie (2023).mkv`

### Very Large TV Series Collections

[tips_large_tv_series.png]

**For extensive TV collections (100+ shows, 1000+ episodes):**

1. **Pagination Strategy**: Use the app's built-in pagination (20 for TV shows, 200 for movies/music) effectively
2. **Search Optimization**: Use specific show names to process one series at a time
3. **Batch Size Management**: Process individual seasons rather than entire shows
4. **Memory Management**: Restart the app periodically for large operations

**Processing Workflow:**
1. **Show Selection**: Use search to filter to specific shows or seasons
2. **Status Filtering**: Focus on Yellow/Red items first for problem resolution
3. **Incremental Processing**: Process a few shows completely before moving to the next batch
4. **Progress Tracking**: Use exported logs to track progress across sessions

**Performance Tips:**
- Enable "Save rename log" for detailed progress tracking
- Use "Export Settings" to maintain consistent configuration across sessions
- Monitor system resources during large operations
- Consider processing during off-peak hours for network storage

### Docker & Containerized Environments
**For Plex servers running in Docker containers:**

1. **Volume Mapping**: Ensure consistent volume mounts between container and host
2. **Path Translation**: Map container paths to host filesystem paths accurately
3. **Permission Alignment**: Match container user permissions with host file access
4. **Metadata Sync**: Verify Plex metadata updates after file operations

**Container-Specific Setup:**
- Use absolute paths in path mappings when possible
- Test mappings with simple file operations before large renames
- Monitor container logs for permission or path-related issues
- Consider running the app in the same container network as Plex for optimal connectivity

### Multi-User Shared Libraries
**For libraries shared across multiple users or devices:**

1. **Consistent Naming**: Establish naming conventions that work across all users' systems
2. **Cross-Platform Compatibility**: Test naming on Windows, macOS, and Linux systems
3. **Network Path Handling**: Use UNC paths or stable mount points for shared storage
4. **Permission Coordination**: Ensure all users have appropriate file access permissions

**Sharing Strategy:**
- Choose templates that work well across different operating systems
- Use "Preserve Unicode" encoding for international content
- Test rename operations on a shared test directory first
- Communicate changes to all users before applying to shared libraries

## Advanced Usage

### Template Customization
- **Template Help Modals**: Use the "?" help buttons next to template fields to see all available placeholder tags and their usage.
- **Movie Templates**: Start with `{title}[ ({year})]{ext}` and customize as needed.
- **TV Templates**: Use `{showTitle} - S{season:02}E{episode:02} - {title}{ext}` for standard formatting.
- **Optional Groups**: Use `[ ({year})]` to omit year when not available.
- **Available Placeholders**: `{title}`, `{year}`, `{ext}`, `{showTitle}`, `{season}`, `{episode}`, `{grandparentTitle}`, `{parentTitle}`, `{imdbToken}`, `{tvdbToken}`, `{tmdbToken}`, `{plexIds}`, and more.

### Settings Export/Import
- **Backup Settings**: Export settings before major configuration changes.
- **Share Configurations**: Import settings files to replicate setups across machines.
- **Version Control**: Keep settings files in version control for team environments.

### Log Management
- **Log Location**: `~/.nameotron/logs/` (cross-platform OS app data directory).
- **Log Rotation**: Older logs are automatically cleaned up.
- **Export Formats**: Use TXT for human reading, JSON for programmatic processing.

## Getting the Best Results

### Preparation Checklist
- [ ] Plex server running and accessible
- [ ] Libraries properly configured in Plex
- [ ] Path mappings tested and working
- [ ] Settings configured for your use case
- [ ] Backup strategy in place
- [ ] Small test run completed successfully

### Optimization Tips
- **Regular Maintenance**: Periodically review and update Plex metadata.
- **Consistent Naming**: Establish naming conventions before large operations.
- **Incremental Approach**: Process libraries in smaller batches for better control.
- **Monitor Logs**: Regularly review operation logs for patterns and issues.

### When to Ask for Help
- Unexpected errors in logs
- Consistent mapping or permission failures
- Plex integration issues
- Performance problems with large libraries

Remember: The app is designed to be safe-first. When in doubt, use smaller test runs and always verify results before proceeding with larger operations.
