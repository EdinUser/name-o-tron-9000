import { IconQuestionCircle } from "./icons";

type TemplateField = {
  name: string;
  description: string;
  example?: string;
  availableIn: "movies" | "episodes" | "music" | "both";
};

const TEMPLATE_FIELDS: TemplateField[] = [
  // Basic fields available in both movies and episodes
  { name: "title", description: "The main title of the movie/episode", example: "Inception", availableIn: "both" },
  { name: "year", description: "Release year (movies) or air year (episodes)", example: "2010", availableIn: "both" },
  { name: "ext", description: "File extension (e.g., .mkv, .mp4)", example: ".mkv", availableIn: "both" },

  // Movie-specific fields
  { name: "edition", description: "Edition name (processed based on settings - use actual Plex tokens like {edition-extended})", example: "{edition-extended}", availableIn: "movies" },
  { name: "editionToken", description: "The raw Plex edition token (e.g., '{edition-extended}')", example: "{edition-extended}", availableIn: "movies" },
  { name: "editionTitle", description: "Human-readable edition name (e.g., 'Extended Edition')", example: "Extended Edition", availableIn: "movies" },
  { name: "genre", description: "Primary genre of the movie", example: "Sci-Fi", availableIn: "movies" },
  { name: "rating", description: "Content rating (e.g., PG-13, R)", example: "PG-13", availableIn: "movies" },
  { name: "studio", description: "Production studio", example: "Warner Bros.", availableIn: "movies" },
  { name: "director", description: "Director name", example: "Christopher Nolan", availableIn: "movies" },
  { name: "writer", description: "Writer name", example: "Christopher Nolan", availableIn: "movies" },
  { name: "country", description: "Country of origin", example: "USA", availableIn: "movies" },
  { name: "tagline", description: "Movie tagline", example: "Your mind is the scene of the crime", availableIn: "movies" },
  { name: "summary", description: "Brief plot summary", example: "A thief who steals corporate secrets...", availableIn: "movies" },

  // Episode-specific fields
  { name: "showTitle", description: "The TV show title", example: "Breaking Bad", availableIn: "episodes" },
  { name: "season", description: "Season number (can be formatted with padding)", example: "5", availableIn: "episodes" },
  { name: "episode", description: "Episode number (can be formatted with padding)", example: "12", availableIn: "episodes" },
  { name: "grandparentTitle", description: "Alternative show title field", example: "Breaking Bad", availableIn: "episodes" },
  { name: "parentTitle", description: "Season title if available", example: "Season 5", availableIn: "episodes" },
  { name: "parentIndex", description: "Season number (alternative to season)", example: "5", availableIn: "episodes" },
  { name: "index", description: "Episode number (alternative to episode)", example: "12", availableIn: "episodes" },

  // Music-specific fields
  { name: "artist", description: "The artist name", example: "The Beatles", availableIn: "music" },
  { name: "album", description: "The album name", example: "Abbey Road", availableIn: "music" },
  { name: "track", description: "The track title", example: "Come Together", availableIn: "music" },
  { name: "trackNumber", description: "Track number (can be formatted with padding)", example: "1", availableIn: "music" },
  { name: "disc", description: "Disc number (for multi-disc albums)", example: "1", availableIn: "music" },
  { name: "year", description: "Release year of the track/album", example: "1969", availableIn: "music" },
  { name: "genre", description: "Music genre", example: "Rock", availableIn: "music" },

  // Formatting options
  { name: "title:02", description: "Pad numbers with leading zeros (e.g., {season:02})", example: "05", availableIn: "both" },
  { name: "title:03", description: "Pad numbers with 3 digits (e.g., {episode:03})", example: "012", availableIn: "both" },

  // ID fields available in both movies and episodes
  { name: "imdb", description: "IMDB ID (extracted from Plex GUID)", example: "tt0111161", availableIn: "both" },
  { name: "thetvdb", description: "TVDB ID (extracted from Plex GUID)", example: "81189", availableIn: "both" },
  { name: "tmdb", description: "TMDb ID (extracted from Plex GUID)", example: "278", availableIn: "both" },
  { name: "ids", description: "All available IDs combined (based on settings)", example: " {imdb} {thetvdb}", availableIn: "both" },
];

type Props = {
  libraryType: "movie" | "show" | "artist" | string;
  onClose: () => void;
};

export default function TemplateHelpModal({ libraryType, onClose }: Props) {
  // Map library type to field availability
  const getFieldAvailability = (type: string): "movies" | "episodes" | "music" => {
    if (type === "movie") return "movies";
    if (type === "show") return "episodes";
    if (type === "artist") return "music";
    return "movies"; // Default fallback
  };

  const fieldAvailability = getFieldAvailability(libraryType);

  const filteredFields = TEMPLATE_FIELDS.filter(field =>
    field.availableIn === "both" || field.availableIn === fieldAvailability
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <IconQuestionCircle className="h-6 w-6 text-neutral-400" />
          <h2 className="text-xl font-semibold text-neutral-100">Template Field Reference</h2>
        </div>

        <p className="text-neutral-300 mb-4">
          Use these fields in your template patterns. Fields in <code className="bg-neutral-800 px-1 rounded">{"{curly braces}"}</code> will be replaced with actual values.
          You can also format numbers with padding like <code className="bg-neutral-800 px-1 rounded">{"{season:02}"}</code> for zero-padded numbers.
        </p>

        {fieldAvailability === "movies" && (
          <div className="mb-4">
            <p className="text-neutral-300 text-sm">Showing fields for movies</p>
          </div>
        )}
        {fieldAvailability === "episodes" && (
          <div className="mb-4">
            <p className="text-neutral-300 text-sm">Showing fields for TV episodes</p>
          </div>
        )}
        {fieldAvailability === "music" && (
          <div className="mb-4">
            <p className="text-neutral-300 text-sm">Showing fields for music tracks</p>
          </div>
        )}

        <div className="grid gap-3">
          {filteredFields.map((field) => (
            <div key={field.name} className="bg-neutral-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <code className="bg-neutral-900 px-2 py-1 rounded text-cyan-400 font-mono text-sm">
                    {field.name}
                  </code>
                  <p className="text-neutral-300 text-sm mt-1">{field.description}</p>
                  {field.example && (
                    <p className="text-neutral-400 text-xs mt-1">
                      Example: <code className="bg-neutral-900 px-1 rounded">{field.example}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-neutral-700">
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Optional Groups (Conditional Naming)</h3>
          <p className="text-neutral-300 text-sm mb-3">
            Use <code className="bg-neutral-800 px-1 rounded">{"[square brackets]"}</code> for optional content.
            If all placeholders inside the brackets are empty or undefined, the entire group is omitted.
          </p>
          <div className="space-y-2 text-sm mb-4">
            <div className="bg-neutral-800 rounded p-2">
              <span className="text-neutral-400">Optional Year:</span>{" "}
              <code className="text-cyan-400">{"{title}[ ({year})]{ext}"}</code>
              <div className="text-neutral-300 ml-2 mt-1">
                → Inception (2010).mkv <span className="text-neutral-400">(with year)</span><br/>
                → Inception.mkv <span className="text-neutral-400">(without year)</span>
              </div>
            </div>
            <div className="bg-neutral-800 rounded p-2">
              <span className="text-neutral-400">Nested Optional:</span>{" "}
              <code className="text-cyan-400">{"{title}[ ({year}[ - {edition}])]{ext}"}</code>
              <div className="text-neutral-300 ml-2 mt-1">
                → Inception (2010 - Extended).mkv <span className="text-neutral-400">(all present)</span><br/>
                → Inception (2010).mkv <span className="text-neutral-400">(year only)</span><br/>
                → Inception - Extended.mkv <span className="text-neutral-400">(edition only)</span>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-medium text-neutral-200 mb-2">Example Templates</h3>
          <div className="space-y-2 text-sm">
            {fieldAvailability === "movies" && (
              <>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">Movies:</span>{" "}
                  <code className="text-cyan-400">{"{title}[ ({year})]{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Inception (2010).mkv</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">With Edition:</span>{" "}
                  <code className="text-cyan-400">{"{title}[ ({year})]{edition}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Inception (2010) Extended.mkv</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">With Collection:</span>{" "}
                  <code className="text-cyan-400">{"{title}[ ({year})][ ({collection})]{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Inception (2010) (Trilogy).mkv</span>
                </div>
              </>
            )}
            {fieldAvailability === "episodes" && (
              <>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">Episodes:</span>{" "}
                  <code className="text-cyan-400">{"{showTitle} - S{season:02}E{episode:02} - {title}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Breaking Bad - S05E12 - Rabid Dog.mkv</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">Auto-normalized Multi-Episode:</span>{" "}
                  <code className="text-cyan-400">{"{showTitle} - S{season:02}E{episode:02} - {title}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Abyssal Gate - S01E03-E04 - The Divide / No Return.mkv</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">With Year:</span>{" "}
                  <code className="text-cyan-400">{"{showTitle} - S{season:02}E{episode:02}[ ({year})] - {title}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ Breaking Bad - S05E12 (2013) - Rabid Dog.mkv</span>
                </div>
              </>
            )}
            {fieldAvailability === "music" && (
              <>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">Music:</span>{" "}
                  <code className="text-cyan-400">{"{artist}/{album}/{trackNumber:02} - {track}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ The Beatles/Abbey Road/01 - Come Together.mp3</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">Simple:</span>{" "}
                  <code className="text-cyan-400">{"{trackNumber:02} - {track}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ 01 - Come Together.mp3</span>
                </div>
                <div className="bg-neutral-800 rounded p-2">
                  <span className="text-neutral-400">With Disc:</span>{" "}
                  <code className="text-cyan-400">{"{artist}/{album}[/Disc {disc}]/{trackNumber:02} - {track}{ext}"}</code>
                  <span className="text-neutral-300 ml-2">→ The Beatles/Abbey Road/Disc 2/01 - Come Together.mp3</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
