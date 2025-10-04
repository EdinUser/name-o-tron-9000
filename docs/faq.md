# FAQ & Troubleshooting

This FAQ covers common questions and issues users encounter with Name-o-Tron 9000. Questions are organized by category for easy navigation.

## 📑 Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Plex Integration](#plex-integration)
3. [Path Mapping](#path-mapping)
4. [Preview & Renaming](#preview--renaming)
5. [File Operations](#file-operations)
6. [Settings & Configuration](#settings--configuration)
7. [Performance & Large Libraries](#performance--large-libraries)
8. [Network & Remote Access](#network--remote-access)
9. [Troubleshooting](#troubleshooting)
10. [Getting Help](#getting-help)

---

## Installation & Setup

### **How do I install Name-o-Tron 9000?**
Download the appropriate installer for your platform from the [releases page](https://github.com/your-repo/releases):
- **Windows**: Download the `.exe` installer and run it
- **macOS**: Download the `.dmg` file and drag the app to Applications
- **Linux**: Use the appropriate package (AppImage, .deb, or .rpm) for your distribution

### **What are the system requirements?**
- **Operating System**: Windows 10+, macOS 10.15+, or Linux with glibc 2.28+
- **RAM**: 256MB minimum, 1GB recommended for large libraries
- **Storage**: 100MB for application, plus space for logs
- **Network**: Access to your Plex server (local network or remote)


## Plex Integration

### **Why can't the app find my Plex server?**
**Common causes:**
- Plex server not running or not accessible on the network
- Firewall blocking SSDP multicast (UDP ports 32410, 32412-32414)
- Server on different network subnet

**Solutions:**
1. Ensure Plex Media Server is running and shows "Fully accessible" in Plex Web
2. Check firewall settings allow the required UDP ports
3. Try manual server addition on the Home screen where the Discover functionality is located
4. For remote servers, use the manual server option with IP/hostname

### **Authentication fails with Plex**
**Common causes:**
- Incorrect Plex account credentials
- Server not linked to your Plex account
- Network connectivity issues

**Solutions:**
1. Verify your Plex login works in a web browser
2. Ensure the server appears in your Plex account's server list
3. Check network connectivity between app and Plex server
4. Try logging out and back in through the app

### **Why don't my libraries appear?**
**Common causes:**
- Server not properly authenticated
- Libraries not shared with your Plex account
- Library section ID mismatch

**Solutions:**
1. Verify server authentication is working
2. In Plex Web, ensure libraries are shared with your account
3. Check that you're selecting the correct server if you have multiple

[path_mapping.png]

## Path Mapping

### **What is path mapping and why do I need it?**
Path mapping connects Plex's internal file paths to your actual folder locations. This is necessary because:
- Plex may report different paths than your local filesystem (especially on NAS)
- Different operating systems represent paths differently
- Network mounts may have different paths than Plex sees

For detailed guidance on setting up and troubleshooting path mappings, see [Path Mapping](tips.md#path-mapping) in the Tips & Best Practices guide.

### **Path mapping validation fails**
**Common causes:**
- Plex library root doesn't match local path exactly
- Network drive not mounted or accessible
- Permission issues on target folders

**Solutions:**
1. Double-check the Plex library root path in Plex Web settings
2. Ensure your local path exists and is accessible
3. Test with the "Test Mapping" button in settings
4. Verify read/write permissions on the local path

### **Path mapping works but files aren't found**
**Common causes:**
- Case sensitivity differences (Windows/macOS vs Linux)
- Trailing slash mismatches
- Symlink or mount point issues

**Solutions:**
1. Ensure consistent case usage in paths
2. Check for trailing slashes in both Plex and local paths
3. Verify symlinks are properly resolved
4. Test with simple file operations outside the app

[faq_preview.png]

## Preview & Renaming

### **Why is a file showing as "Unmatched"?**
**Common causes:**
- File not properly scanned into Plex library
- Filename doesn't match Plex's metadata matching rules
- File in wrong library section (movie in TV library, etc.)

**Solutions:**
1. Run "Scan Library Files" in Plex Web for the affected library
2. Check that the file appears in Plex Web before using the app
3. Ensure the file is in the correct library section (Movies/TV/Music)
4. Review Plex's naming guidelines for your media type

### **Why is a rename blocked with red status?**
**Common blocking issues:**
- **Invalid characters**: `\ / : * ? " < > |` in filenames
- **Path too long**: Over 255 characters (Windows limit)
- **Reserved names**: Windows reserved names like CON, AUX
- **Duplicate targets**: File would overwrite existing file
- **Permission issues**: No write access to destination

**Solutions:**
1. Use "Auto-Fix Reds" for common issues when available
2. Manually resolve conflicts before retrying
3. Check and fix permissions on target folders
4. Shorten very long paths or filenames

### **What do yellow warnings mean?**
**Common warnings:**
- **Non-Latin characters**: May cause issues on some systems
- **Path length**: Between 200-255 characters (caution zone)
- **Missing metadata**: Edition, year, or other info not found
- **Non-standard extensions**: Not in common media format list

**Solutions:**
1. Review warnings in preview before proceeding
2. Enable transliteration if non-Latin characters are problematic
3. Warnings don't block operations but should be reviewed

### **Preview is slow or hangs**
**Common causes:**
- Very large library sections (10,000+ items)
- Network issues with Plex server
- Large number of unmatched files

**Solutions:**
1. Use search to filter to specific content
2. Process libraries in smaller batches
3. Check network connectivity to Plex server
4. Restart the app if issues persist

## File Operations

[undo_last_rename.png]

### **How do I undo changes if something goes wrong?**
For comprehensive information about rollback and recovery options, see [Rollback & Recovery](features.md#rollback--recovery) in the Features guide.

**Quick access:**
- Use the "Undo Last Rename" button in the main interface for automatic rollback
- Manual rollback logs are stored in `~/.nameotron/logs/`

### **Can I preview changes before applying them?**
Yes! The app always shows a preview of what will change:
- **Before/After**: See exactly what each file will be renamed to
- **Status indicators**: Green/Yellow/Red show safety levels
- **Summary**: Total operations, warnings, and blocking issues
- **Options**: Skip problematic items or auto-fix common issues

### **Where are the logs stored and how do I read them?**
For detailed information about log storage, types, and export options, see [Rollback & Recovery](features.md#rollback--recovery) in the Features guide.

**Quick reference:**
- Logs location: `~/.nameotron/logs/` (OS-specific app data directory)
- Export formats: TXT, CSV, JSON available

## Settings & Configuration

[export_settings.png]

### **How do I backup or transfer my settings?**
**Export settings:**
1. Go to Settings > General tab
2. Click "Export Settings" button
3. Save the `.json` file to a safe location

**Import settings:**
1. Copy the settings file to the new machine
2. Go to Settings > General tab
3. Click "Import Settings" and select the file

### **Can I customize the renaming templates?**
Yes! Each media type has customizable templates:

**Template Help Available:** Click the "?" help buttons next to template fields to see all available placeholder tags and their usage examples.

**Movie template example:** `{title}[ ({year})]{ext}`
- `{title}` - Movie title
- `{year}` - Release year (optional)
- `{ext}` - File extension

**TV template example:** `{showTitle} - S{season:02}E{episode:02} - {title}{ext}`
- `{showTitle}` - TV show name
- `{season:02}` - Season number (zero-padded)
- `{episode:02}` - Episode number (zero-padded)

**Available Placeholders:** `{title}`, `{year}`, `{ext}`, `{showTitle}`, `{season}`, `{episode}`, `{grandparentTitle}`, `{parentTitle}`, and more.

**Advanced features:**
- **Optional groups**: `[ ({year})]` omits if year unavailable
- **Number formatting**: `{episode:02}` for zero-padding
- **Edition tokens**: `{edition-extended}` for special versions

## Performance & Large Libraries

### **The app is slow with my large library**
**Optimization tips:**
1. **Pagination**: App loads 200 items per page - use search to filter
2. **Search strategy**: Local search for immediate results, Plex API search always active for comprehensive coverage
3. **Batch processing**: Process large libraries in smaller chunks
4. **Network optimization**: Ensure fast connection to Plex server

### **What are the memory requirements for large libraries?**
- **Small libraries** (<1,000 items): 256MB RAM sufficient
- **Medium libraries** (1,000-10,000 items): 512MB-1GB recommended
- **Large libraries** (10,000+ items): 2GB+ for optimal performance

### **Can I process only part of my library?**
Yes! Use these strategies:
1. **Checkbox selection**: Select only items you want to rename
2. **Status filtering**: Filter by Green/Yellow/Red status
3. **Search filtering**: Search for specific titles or patterns
4. **Library sections**: Process one section at a time

## Network & Remote Access

### **Can I use this with a remote Plex server?**
Yes, with these considerations:
- **Authentication**: Works with any Plex server accessible to your account
- **Path mapping**: Local paths must still map to your filesystem
- **Network speed**: Large operations may be slower over internet
- **Firewall**: Ensure necessary ports are open if needed


### **Is my data secure?**
**Security measures:**
- **Token storage**: Plex tokens stored securely in OS credential store
- **Local operations**: File operations only affect your local files
- **No data upload**: App doesn't send your files anywhere
- **Encrypted settings**: Sensitive settings encrypted where applicable

## Troubleshooting

### **The app crashes or freezes**
**Immediate steps:**
1. **Check logs**: Look in `~/.nameotron/logs/error_*.log`
2. **Restart app**: Simple issues often resolve with restart
3. **Check resources**: Ensure sufficient RAM and disk space
4. **Update Plex**: Ensure Plex server is up to date

**If crashes persist:**
1. **Export settings** and try importing into fresh installation
2. **Check file permissions** on app directories
3. **Verify system requirements** are met
4. **Report issue** with logs and system information

### **Operations fail with permission errors**
**Common causes:**
- App doesn't have write access to media folders
- Antivirus software interfering
- Network drive access issues

**Solutions:**
1. **Run as administrator** (Windows) or with appropriate permissions
2. **Check antivirus exclusions** for the app and media folders
3. **Verify network drive** mounting and permissions
4. **Test with simple file operations** outside the app

### **Files aren't being found or matched correctly**
**Plex-related issues:**
1. **Refresh metadata** in Plex Web for affected items
2. **Re-scan library** if files were recently added
3. **Check file naming** against Plex naming conventions
4. **Verify library section** (movie in Movies, etc.)

**App-related issues:**
1. **Check path mapping** is correct for the server
2. **Verify file accessibility** from the local machine
3. **Review logs** for specific error messages
4. **Try with a single file** to isolate the issue

## Getting Help

### **Where can I find more documentation?**
- **Complete user guide**: See the `docs/` folder in the installation
- **Settings reference**: [docs/settings.md](settings.md)
- **Tips & best practices**: [docs/tips.md](tips.md)
- **Technical details**: [docs/appendix.md](appendix.md)


---

**Still having trouble?** Check the [Tips & Best Practices](tips.md) guide for more detailed troubleshooting advice, or review the complete [user guide](index.md) for comprehensive instructions.
