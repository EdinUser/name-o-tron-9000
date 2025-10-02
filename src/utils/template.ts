export type TemplateContext = Record<string, string | number | undefined | null>;

/**
 * Simple basename implementation for browser compatibility
 */
function basename(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}


/**
 * Detects edition information from a file path (including folder names)
 */
export type DetectedEdition = { token?: string; title?: string };

export type EditionParserConfig = {
  id: string;
  name: string;
  category: "content" | "technical";
  enabled: boolean;
}[];

export function detectEditionFromPath(filePath: string): DetectedEdition | null {
    return detectEditionFromPathWithPriority(filePath);
}

export function detectEditionFromPathWithPriority(filePath: string, enabledParsers?: EditionParserConfig): DetectedEdition | null {
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

    // Check filename for edition keywords with priority ordering
    const filename = basename(filePath);
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    // Filter patterns based on enabled parsers
    const enabledCommonPatterns = filterEnabledPatterns(COMMON_EDITION_PATTERNS, enabledParsers);
    const enabledTechnicalPatterns = filterEnabledPatterns(TECHNICAL_EDITION_PATTERNS, enabledParsers);

    // Detect all editions (both common and technical) using only enabled patterns
    const commonEditions = detectEditionsByPriority(nameWithoutExt, enabledCommonPatterns);
    const technicalEditions = detectEditionsByPriority(nameWithoutExt, enabledTechnicalPatterns);

    const allTitles = [...commonEditions, ...technicalEditions];
    const allTokens = allTitles.map(title => titleToTokenPart(title)).filter(Boolean);

    if (allTitles.length || allTokens.length) {
        const token = allTokens.length ? `{edition-${allTokens.join(',')}}` : undefined;
        const title = allTitles.join(' ');
        return { token, title: title || undefined };
    }

    return null;
}

// Common content editions - higher priority
const COMMON_EDITION_PATTERNS = [
    { pattern: /\b(directors?.?cut|dc)\b/i, id: "directors-cut" },
    { pattern: /\b(extended|uncut|unrated)\b/i, id: "extended" },
    { pattern: /\b(theatrical.?cut|theatrical)\b/i, id: "theatrical" },
    { pattern: /\b(remastered|restored)\b/i, id: "remastered" },
    { pattern: /\b(special.?edition|se)\b/i, id: "special" },
    { pattern: /\b(collectors?.?edition|ce)\b/i, id: "collectors" },
    { pattern: /\b(deluxe.?edition|de)\b/i, id: "deluxe" },
    { pattern: /\b(anniversary.?edition|ae)\b/i, id: "anniversary" },
    { pattern: /\b(ultimate.?edition|ue)\b/i, id: "ultimate" },
    { pattern: /\b(diamond.?edition|diamond)\b/i, id: "diamond" },
    { pattern: /\b(platinum.?edition|platinum)\b/i, id: "platinum" },
    { pattern: /\b(gold.?edition|gold)\b/i, id: "gold" },
    { pattern: /\b(silver.?edition|silver)\b/i, id: "silver" },
    { pattern: /\b(steelbook|steel.?book)\b/i, id: "steelbook" },
    { pattern: /\b(criterion|cc)\b/i, id: "criterion" },
];

// Technical editions - lower priority, only used if no common editions found
const TECHNICAL_EDITION_PATTERNS = [
    { pattern: /\b(imax|imax.?enhanced)\b/i, id: "imax" },
    { pattern: /\b(4k|uhd)\b/i, id: "4k" },
    { pattern: /\b(hdr|hdr10|dolby.?vision)\b/i, id: "hdr" },
    { pattern: /\b(dolby.?atmos|atmos)\b/i, id: "atmos" },
    { pattern: /\b(bluray|blu.?ray|bd)\b/i, id: "bluray" },
    { pattern: /\b(dvd|dvd.?r|dvd.?rw)\b/i, id: "dvd" },
    { pattern: /\b(web.?dl|webrip|web)\b/i, id: "web" },
    { pattern: /\b(hdtv|hd.?tv)\b/i, id: "hdtv" },
];

function filterEnabledPatterns(patterns: typeof COMMON_EDITION_PATTERNS, enabledParsers?: EditionParserConfig): RegExp[] {
  if (!enabledParsers) {
    // If no parser config provided, use all patterns
    return patterns.map(p => p.pattern);
  }

  // Filter patterns based on enabled parsers
  return patterns
    .filter(patternInfo => enabledParsers.some(parser => parser.id === patternInfo.id && parser.enabled))
    .map(p => p.pattern);
}

function detectEditionsByPriority(text: string, patterns: RegExp[]): string[] {
    const titles: string[] = [];
    const tokenParts: string[] = [];

    // Debug logging for the specific file
    if (text.toLowerCase().includes('unrated') || text.toLowerCase().includes('40-year-old virgin') || text.toLowerCase().includes('bluray')) {
        console.log(`🎯 DEBUG: Checking text: "${text}"`);
    }

    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) {
            const rawMatch = m[0];
            const title = normalizeEditionName(rawMatch);
            const part = titleToTokenPart(title);

            // Debug logging for the specific file
            if (text.toLowerCase().includes('unrated') || text.toLowerCase().includes('40-year-old virgin') || text.toLowerCase().includes('bluray')) {
                console.log(`🎯 DEBUG: Pattern ${pattern} matched "${rawMatch}" -> title="${title}", part="${part}"`);
            }

            if (title && !titles.includes(title)) titles.push(title);
            if (part && !tokenParts.includes(part)) tokenParts.push(part);
        }
    }

    return titles;
}

export function mapEditionTokenToTitle(part: string): string {
    const key = part.toLowerCase();
    if (key === "extended" || key === "uncut") return "Extended Edition";
    if (key === "unrated") return "Unrated";
    if (key === "remastered" || key === "restored") return "Remastered";
    if (key === "theatrical") return "Theatrical Cut";
    if (key === "imax") return "IMAX Edition";
    if (key === "directors" || key === "dc") return "Director's Cut";
    if (key === "special" || key === "se") return "Special Edition";
    if (key === "collectors" || key === "ce") return "Collector's Edition";
    if (key === "deluxe" || key === "de") return "Deluxe Edition";
    if (key === "anniversary" || key === "ae") return "Anniversary Edition";
    if (key === "ultimate" || key === "ue") return "Ultimate Edition";
    if (key === "diamond") return "Diamond Edition";
    if (key === "platinum") return "Platinum Edition";
    if (key === "gold") return "Gold Edition";
    if (key === "silver") return "Silver Edition";
    if (key === "steelbook") return "Steelbook Edition";
    if (key === "criterion" || key === "cc") return "Criterion Collection";
    if (key === "4k" || key === "uhd") return "4K Edition";
    if (key === "hdr" || key === "hdr10" || key === "dolby") return "HDR Edition";
    if (key === "atmos") return "Dolby Atmos Edition";
    if (key === "bluray" || key === "blu" || key === "bd") return "Blu-ray Edition";
    if (key === "dvd") return "DVD Edition";
    if (key === "web") return "Web Edition";
    if (key === "hdtv") return "HDTV Edition";
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
    if (/\b(extended|uncut)\b/i.test(edition)) {
        return "Extended Edition";
    }
    if (/\bunrated\b/i.test(edition)) {
        return "Unrated";
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



