export type TemplateContext = Record<string, string | number | undefined | null>;

/**
 * Simple basename implementation for browser compatibility
 */
function basename(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}

// Edition detection patterns for common movie edition keywords
const EDITION_PATTERNS = [
    // Common edition keywords in various formats
    /\b(directors?.?cut|dc)\b/i,
    /\b(extended|uncut|unrated)\b/i,
    /\b(imax|imax.?enhanced)\b/i,
    /\b(theatrical.?cut|theatrical)\b/i,
    /\b(remastered|restored)\b/i,
    /\b(special.?edition|se)\b/i,
    /\b(collectors?.?edition|ce)\b/i,
    /\b(deluxe.?edition|de)\b/i,
    /\b(anniversary.?edition|ae)\b/i,
    /\b(ultimate.?edition|ue)\b/i,
    /\b(diamond.?edition|diamond)\b/i,
    /\b(platinum.?edition|platinum)\b/i,
    /\b(gold.?edition|gold)\b/i,
    /\b(silver.?edition|silver)\b/i,
    /\b(steelbook|steel.?book)\b/i,
    /\b(criterion|cc)\b/i,
    /\b(4k|uhd)\b/i,
    /\b(hdr|hdr10|dolby.?vision)\b/i,
    /\b(dolby.?atmos|atmos)\b/i,
    /\b(dts.?x|dtsx)\b/i,
    /\b(blu.?ray|br)\b/i,
    /\b(dvd.?rip|dvd)\b/i,
    /\b(web.?dl|web.?rip|web)\b/i,
    /\b(hdtv|hd)\b/i,
    /\b(sd|standard.?definition)\b/i,
];

/**
 * Detects edition information from a file path (including folder names)
 */
export type DetectedEdition = { token?: string; title?: string };

export function detectEditionFromPath(filePath: string): DetectedEdition | null {
    // Look for Plex edition tokens in path in multiple forms:
    //  - {edition-Extended,Unrated}
    //  - (edition-Extended,Unrated)
    //  - [edition-Extended,Unrated]
    let tokenMatch = filePath.match(/\{edition-([^}]+)\}/i);
    if (!tokenMatch) tokenMatch = filePath.match(/\(edition-([^)+]+)\)/i);
    if (!tokenMatch) tokenMatch = filePath.match(/\[edition-([^\]]+)\]/i);
    if (tokenMatch) {
        const raw = tokenMatch[1]; // e.g. "Extended,Unrated"
        const token = `{edition-${raw}}`;
        const parts = raw.split(/[,\s]+/).filter(Boolean);
        const mapped = parts.map(p => mapEditionTokenToTitle(p));
        const title = mapped.filter(Boolean).join(" ") || undefined;
        return { token, title };
    }

    // Also check filename for edition keywords and build combined token
    const filename = basename(filePath);
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    const titles: string[] = [];
    const tokenParts: string[] = [];
    for (const pattern of EDITION_PATTERNS) {
        const m = nameWithoutExt.match(pattern);
        if (m) {
            const title = normalizeEditionName(m[0]);
            const part = titleToTokenPart(title);
            if (title && !titles.includes(title)) titles.push(title);
            if (part && !tokenParts.includes(part)) tokenParts.push(part);
        }
    }
    if (titles.length || tokenParts.length) {
        const token = tokenParts.length ? `{edition-${tokenParts.join(',')}}` : undefined;
        const title = titles.join(' ');
        return { token, title: title || undefined };
    }

    return null;
}

function mapEditionTokenToTitle(part: string): string {
    const key = part.toLowerCase();
    if (key === "extended") return "Extended Edition";
    if (key === "unrated") return "Unrated";
    if (key === "remastered") return "Remastered";
    if (key === "theatrical") return "Theatrical Cut";
    if (key === "imax") return "IMAX Edition";
    return part; // fallback: pass-through
}

function titleToTokenPart(title: string): string | null {
    const t = title.toLowerCase();
    if (t.includes("director")) return "directors-cut";
    if (t.includes("extended")) return "extended";
    if (t.includes("unrated")) return "unrated";
    if (t.includes("imax")) return "imax";
    if (t.includes("theatrical")) return "theatrical";
    if (t.includes("remaster")) return "remastered";
    if (t.includes("special")) return "special";
    if (t.includes("collector")) return "collectors";
    if (t.includes("deluxe")) return "deluxe";
    if (t.includes("anniversary")) return "anniversary";
    if (t.includes("ultimate")) return "ultimate";
    if (t.includes("diamond")) return "diamond";
    if (t.includes("platinum")) return "platinum";
    if (t.includes("gold")) return "gold";
    if (t.includes("silver")) return "silver";
    if (t.includes("steelbook")) return "steelbook";
    if (t.includes("criterion")) return "criterion";
    if (t.includes("4k")) return "4k";
    if (t.includes("uhd")) return "uhd";
    if (t.includes("hdr")) return "hdr";
    if (t.includes("atmos")) return "atmos";
    if (t.includes("dts")) return "dts";
    if (t.includes("blu")) return "bluray";
    if (t.includes("dvd")) return "dvd";
    if (t.includes("web")) return "web";
    if (t.includes("hdtv") || t === "hd edition" || t === "hd") return "hd";
    if (t.includes("standard")) return "sd";
    return null;
}

/**
 * Normalizes detected edition names to standard formats
 */
function normalizeEditionName(rawEdition: string): string {
    const edition = rawEdition.toLowerCase();

    // Map common patterns to standardized names
    if (/\b(directors?.?cut|dc)\b/i.test(edition)) {
        return "Director's Cut";
    }
    if (/\b(extended|uncut|unrated)\b/i.test(edition)) {
        return "Extended Edition";
    }
    if (/\b(imax|imax.?enhanced)\b/i.test(edition)) {
        return "IMAX Edition";
    }
    if (/\b(theatrical.?cut|theatrical)\b/i.test(edition)) {
        return "Theatrical Cut";
    }
    if (/\b(remastered|restored)\b/i.test(edition)) {
        return "Remastered";
    }
    if (/\b(special.?edition|se)\b/i.test(edition)) {
        return "Special Edition";
    }
    if (/\b(collectors?.?edition|ce)\b/i.test(edition)) {
        return "Collector's Edition";
    }
    if (/\b(deluxe.?edition|de)\b/i.test(edition)) {
        return "Deluxe Edition";
    }
    if (/\b(anniversary.?edition|ae)\b/i.test(edition)) {
        return "Anniversary Edition";
    }
    if (/\b(ultimate.?edition|ue)\b/i.test(edition)) {
        return "Ultimate Edition";
    }
    if (/\b(diamond.?edition|diamond)\b/i.test(edition)) {
        return "Diamond Edition";
    }
    if (/\b(platinum.?edition|platinum)\b/i.test(edition)) {
        return "Platinum Edition";
    }
    if (/\b(gold.?edition|gold)\b/i.test(edition)) {
        return "Gold Edition";
    }
    if (/\b(silver.?edition|silver)\b/i.test(edition)) {
        return "Silver Edition";
    }
    if (/\b(steelbook|steel.?book)\b/i.test(edition)) {
        return "Steelbook Edition";
    }
    if (/\b(criterion|cc)\b/i.test(edition)) {
        return "Criterion Collection";
    }
    if (/\b(4k|uhd)\b/i.test(edition)) {
        return "4K Edition";
    }
    if (/\b(hdr|hdr10|dolby.?vision)\b/i.test(edition)) {
        return "HDR Edition";
    }
    if (/\b(dolby.?atmos|atmos)\b/i.test(edition)) {
        return "Dolby Atmos";
    }
    if (/\b(dts.?x|dtsx)\b/i.test(edition)) {
        return "DTS:X";
    }
    if (/\b(blu.?ray|br)\b/i.test(edition)) {
        return "Blu-ray Edition";
    }
    if (/\b(dvd.?rip|dvd)\b/i.test(edition)) {
        return "DVD Edition";
    }
    if (/\b(web.?dl|web.?rip|web)\b/i.test(edition)) {
        return "Web Edition";
    }
    if (/\b(hdtv|hd)\b/i.test(edition)) {
        return "HD Edition";
    }
    if (/\b(sd|standard.?definition)\b/i.test(edition)) {
        return "Standard Definition";
    }

    // Return original if no mapping found
    return rawEdition;
}

/**
 * Extracts IMDB ID from a Plex GUID
 */
export function extractImdbId(guid: string): string | null {
    // Plex GUIDs for IMDB look like: "imdb://tt1234567"
    const imdbMatch = guid.match(/imdb:\/\/(tt\d+)/i);
    return imdbMatch ? imdbMatch[1] : null;
}

/**
 * Extracts TVDB ID from a Plex GUID
 */
export function extractTvdbId(guid: string): string | null {
    // Plex GUIDs for TVDB look like: "tvdb://12345"
    const tvdbMatch = guid.match(/tvdb:\/\/(\d+)/i);
    return tvdbMatch ? tvdbMatch[1] : null;
}

/**
 * Extracts TMDb ID from a Plex GUID
 */
export function extractTmdbId(guid: string): string | null {
    // Plex GUIDs for TMDb look like: "tmdb://12345"
    const tmdbMatch = guid.match(/tmdb:\/\/(\d+)/i);
    return tmdbMatch ? tmdbMatch[1] : null;
}

function padNumber(value: number, width: number): string {
  const s = String(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  return sign + s.padStart(width, "0");
}

/**
 * Renders a template with placeholders like {title}, {year}, {season:02}.
 * Optional groups in [square brackets] are omitted if all placeholders inside resolve to empty/undefined.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  if (!template) return "";

  // First, process bracketed optional groups.
  const withGroups = template.replace(/\[(.+?)\]/g, (_match, group) => {
    // Resolve placeholders within the group to check if any have values
    const resolved = group.replace(/\{([a-zA-Z0-9_]+)(?::(\d+))?\}/g, (_m: string, key: string, fmt: string) => {
      const raw = context[key];
      if (raw == null || raw === "") return "";
      if (typeof raw === "number" && fmt) return padNumber(raw, parseInt(fmt, 10));
      return String(raw);
    });
    // If the resolved group is empty or whitespace/punctuation only, drop the whole group
    const hasContent = /[a-zA-Z0-9]/.test(resolved);
    return hasContent ? resolved : "";
  });

  // Then, replace simple placeholders.
  const replaced = withGroups.replace(/\{([a-zA-Z0-9_]+)(?::(\d+))?\}/g, (_m: string, key: string, fmt: string) => {
    const raw = context[key];
    if (raw == null || raw === "") return "";
    if (typeof raw === "number" && fmt) return padNumber(raw, parseInt(fmt, 10));
    return String(raw);
  });

  // Collapse duplicate slashes that may result from empty groups
  return replaced.replace(/\/+/, "/").replace(/\s{2,}/g, " ").trim();
}



