import { IconQuestionCircle } from "./icons";

type TemplateField = {
  name: string;
  description: string;
  example?: string;
  availableIn: "movies" | "episodes" | "both";
};

const TEMPLATE_FIELDS: TemplateField[] = [
  // Basic fields available in both movies and episodes
  { name: "title", description: "The main title of the movie/episode", example: "Inception", availableIn: "both" },
  { name: "year", description: "Release year (movies) or air year (episodes)", example: "2010", availableIn: "both" },
  { name: "ext", description: "File extension (e.g., .mkv, .mp4)", example: ".mkv", availableIn: "both" },

  // Movie-specific fields
  { name: "edition", description: "Edition name if available (e.g., Director's Cut, Extended)", example: "Director's Cut", availableIn: "movies" },
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

  // Formatting options
  { name: "title:02", description: "Pad numbers with leading zeros (e.g., {season:02})", example: "05", availableIn: "both" },
  { name: "title:03", description: "Pad numbers with 3 digits (e.g., {episode:03})", example: "012", availableIn: "both" },
];

type Props = {
  libraryType: "movie" | "show" | "artist" | string;
  onClose: () => void;
};

export default function TemplateHelpModal({ libraryType, onClose }: Props) {
  // Map library type to field availability
  const getFieldAvailability = (type: string): "movies" | "episodes" => {
    if (type === "movie") return "movies";
    if (type === "show") return "episodes";
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
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Example Templates</h3>
          <div className="space-y-2 text-sm">
            {fieldAvailability === "movies" && (
              <div className="bg-neutral-800 rounded p-2">
                <span className="text-neutral-400">Movies:</span>{" "}
                <code className="text-cyan-400">{"{title}[ ({year})]{ext}"}</code>
                <span className="text-neutral-300 ml-2">→ Inception (2010).mkv</span>
              </div>
            )}
            {fieldAvailability === "episodes" && (
              <div className="bg-neutral-800 rounded p-2">
                <span className="text-neutral-400">Episodes:</span>{" "}
                <code className="text-cyan-400">{"{showTitle} - S{season:02}E{episode:02} - {title}{ext}"}</code>
                <span className="text-neutral-300 ml-2">→ Breaking Bad - S05E12 - Rabid Dog.mkv</span>
              </div>
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
