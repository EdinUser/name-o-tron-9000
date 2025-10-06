// Windows reserved filenames that cannot be used as paths
export const RESERVED = new Set([
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
]);

// Supported video file extensions
export const VIDEO_EXTS = new Set([".mkv", ".mp4", ".avi", ".mov", ".iso", ".m4v"]);

// Priority order for edition types (higher number = higher priority)
export const EDITION_PRIORITY: Record<string, number> = {
    // Common content editions (highest priority)
    "directors": 100,
    "dc": 100,
    "extended": 95,
    "uncut": 95,
    "unrated": 95,
    "theatrical": 90,
    "remastered": 85,
    "restored": 85,
    "special": 80,
    "se": 80,
    "collectors": 75,
    "ce": 75,
    "deluxe": 70,
    "de": 70,
    "anniversary": 65,
    "ae": 65,
    "ultimate": 60,
    "ue": 60,
    "diamond": 55,
    "platinum": 50,
    "gold": 45,
    "silver": 40,
    "steelbook": 35,
    "criterion": 30,
    "cc": 30,

    // Technical editions (lower priority)
    "imax": 25,
    "4k": 20,
    "uhd": 20,
    "hdr": 15,
    "hdr10": 15,
    "dolby": 15,
    "atmos": 15,
    "bluray": 10,
    "blu": 10,
    "bd": 10,
    "dvd": 5,
    "web": 1,
    "hdtv": 1,
};
