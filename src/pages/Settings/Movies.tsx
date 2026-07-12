import React from "react";
import Toggle from "../../components/Toggle";
import Radio from "../../components/Radio";
import { type Settings } from "../../state/settings";

function Section({title, children}: { title: string; children: React.ReactNode }) {
    return (
        <section className="mx-auto mt-5 max-w-4xl">
            <h2 className="mb-2 text-lg font-semibold">{title}</h2>
            <div className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">{children}</div>
        </section>
    );
}

function Row({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="text-neutral-200">{label}</div>
            <div>{children}</div>
        </div>
    );
}

export function Movies({s, onChange, onConfigureParsers}: { s: Settings; onChange: (v: Settings["movies"]) => void; onConfigureParsers?: () => void }) {
    const m = s.movies;
    const set = (patch: Partial<typeof m>) => onChange({...m, ...patch});
    return (
        <>
            <Section title="Collections">
                <Row label="Enable collections">
                    <Toggle checked={m.collections.enabled} onChange={(checked) => set({collections: {...m.collections, enabled: checked}})}/>
                </Row>
                <Row label="Mode">
                    <Radio
                        value={m.collections.mode}
                        onChange={(v) => set({collections: {...m.collections, mode: v}})}
                        options={[{value: "always", label: "Always"}, {value: "if2plus", label: "Only if 2+"}]}
                        segmented
                    />
                </Row>
                <Row label="Naming style">
                    <Radio
                        value={m.collections.naming}
                        onChange={(v) => set({collections: {...m.collections, naming: v}})}
                        options={[
                            {value: "original", label: "Original"},
                            {value: "prefix_", label: "Prefix _"},
                            {value: "prefix_collection", label: "Prefix 'Collection - '"},
                            {value: "suffix_collection", label: "Suffix '(Collection)'"},
                        ]}
                        segmented
                    />
                </Row>
            </Section>

            <Section title="Collections Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How collection settings affect movie organization:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample movies:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Star Wars: A New Hope (1977)</div>
                                    <div>Star Wars: Empire Strikes Back (1980)</div>
                                    <div>The Matrix (1999)</div>
                                    <div>Blade Runner (1982)</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Collections:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Star Wars Collection</div>
                                    <div>Star Wars Collection</div>
                                    <div>(No Collection)</div>
                                    <div>(No Collection)</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Organized as:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { title: "Star Wars: A New Hope", year: 1977, collection: "Star Wars Collection", hasCollection: true },
                                            { title: "Star Wars: Empire Strikes Back", year: 1980, collection: "Star Wars Collection", hasCollection: true },
                                            { title: "The Matrix", year: 1999, collection: null, hasCollection: false },
                                            { title: "Blade Runner", year: 1982, collection: null, hasCollection: false },
                                        ];

                                        return examples.map((movie, i) => {
                                            let result = "";

                                            if (movie.hasCollection && m.collections.enabled) {
                                                let collectionFolder = movie.collection;

                                                // Apply naming style
                                                switch (m.collections.naming) {
                                                    case "prefix_":
                                                        collectionFolder = `_${collectionFolder}`;
                                                        break;
                                                    case "prefix_collection":
                                                        collectionFolder = `Collection - ${collectionFolder}`;
                                                        break;
                                                    case "suffix_collection":
                                                        collectionFolder = `${collectionFolder} (Collection)`;
                                                        break;
                                                    case "original":
                                                    default:
                                                        // Keep original name
                                                        break;
                                                }

                                                const fileName = `${movie.title} (${movie.year}).mkv`;

                                                // Apply mode logic
                                                if (m.collections.mode === "if2plus") {
                                                    // For "if2plus", we'd need to check if there are 2+ movies in collection
                                                    // For this preview, assume Star Wars has 2+ and others don't
                                                    const shouldUseCollection = movie.collection === "Star Wars Collection";
                                                    if (shouldUseCollection) {
                                                        result = m.ownFolderPerMovie
                                                            ? `${collectionFolder}/${movie.title}/${fileName}`
                                                            : `${collectionFolder}/${fileName}`;
                                                    } else {
                                                        result = fileName;
                                                    }
                                                } else { // always
                                                    result = m.ownFolderPerMovie
                                                        ? `${collectionFolder}/${movie.title}/${fileName}`
                                                        : `${collectionFolder}/${fileName}`;
                                                }
                                            } else {
                                                result = `${movie.title} (${movie.year}).mkv`;
                                            }

                                            return <div key={i} className="truncate" title={result}>{result}</div>;
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Folders & Ordering">
                <Row label="Chronological prefix">
                    <Radio value={m.chronologicalPrefix} onChange={(v) => set({chronologicalPrefix: v})} options={[{value: "none", label: "None"}, {value: "year", label: "By year"}, {value: "collection_order", label: "By collection order"}]} segmented/>
                </Row>
                <Row label="Folder structure">
                    <Radio value={m.folderStructure} onChange={(v) => set({folderStructure: v})} options={[{value: "none", label: "None"}, {value: "alpha", label: "Alphabetical"}, {value: "alpha_ranges", label: "Alphabet ranges"}, {value: "genre", label: "By Genre"}, {value: "year_decade", label: "By Year/Decade"}]} segmented/>
                </Row>
                <Row label="Alphabetical article handling">
                    <Radio value={m.alphaArticleHandling} onChange={(v) => set({alphaArticleHandling: v})} options={[
                        {value: "ignore", label: "Ignore (The Matrix → M)"},
                        {value: "include", label: "Include (The Matrix → T)"}
                    ]} segmented/>
                </Row>
                <Row label="Folder structure behavior">
                    <Radio value={m.folderStructureBehavior} onChange={(v) => set({folderStructureBehavior: v})} options={[
                        {value: "intelligent", label: "Intelligent (preserve good existing structure)"},
                        {value: "reorganize_all", label: "Reorganize all (apply settings to everything)"},
                        {value: "preserve_existing", label: "Preserve existing (never change folder structure)"}
                    ]} segmented/>
                </Row>
                <Row label="Create a separate folder for each movie">
                    <Toggle checked={m.ownFolderPerMovie} onChange={(checked) => set({ownFolderPerMovie: checked})}/>
                </Row>
                {m.ownFolderPerMovie && (
                    <Row label="If a movie is already inside a shared folder">
                        <Radio
                            value={m.ownFolderWithinSharedFolder}
                            onChange={(v) => set({ownFolderWithinSharedFolder: v})}
                            options={[
                                {value: "add_movie_folder", label: "Add a movie folder inside the shared folder"},
                                {value: "keep_shared_folder", label: "Keep the shared folder as the final folder"},
                            ]}
                            segmented
                        />
                    </Row>
                )}
            </Section>

            <Section title="Folder Structure Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">Example organizations with current settings:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample movies:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>The Matrix (1999)</div>
                                    <div>Avatar: The Way of Water (2022)</div>
                                    <div>Dune (2021)</div>
                                    <div>Blade Runner 2049 (2017)</div>
                                    <div>An Inconvenient Truth (2006)</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Would organize as:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { title: "The Matrix", year: 1999, genre: "Sci-Fi" },
                                            { title: "Avatar: The Way of Water", year: 2022, genre: "Adventure" },
                                            { title: "Dune", year: 2021, genre: "Sci-Fi" },
                                            { title: "Blade Runner 2049", year: 2017, genre: "Sci-Fi" },
                                            { title: "An Inconvenient Truth", year: 2006, genre: "Documentary" },
                                        ];

                                        return examples.map((movie, i) => {
                                            let path = "";
                                            const baseName = movie.title;

                                            // Helper function to get sorting title for preview
                                            const getSortingTitlePreview = (title: string) => {
                                                if (m.alphaArticleHandling === "ignore") {
                                                    const articles = /^(the|a|an)\s+/i;
                                                    return title.replace(articles, "");
                                                }
                                                return title;
                                            };

                                            // Apply folder structure logic based on behavior setting
                                            if (m.folderStructureBehavior === "preserve_existing") {
                                                // Preserve existing structure - just use base name
                                                path = baseName;
                                            } else if (m.folderStructureBehavior === "reorganize_all") {
                                                // Always reorganize
                                                switch (m.folderStructure) {
                                                    case "none":
                                                        path = m.ownFolderPerMovie ? `${baseName}/${baseName}` : baseName;
                                                        break;
                                                    case "alpha":
                                                        const sortingTitle = getSortingTitlePreview(movie.title);
                                                        const firstLetter = sortingTitle.charAt(0).toUpperCase();
                                                        const alphaFolder = firstLetter >= 'A' && firstLetter <= 'Z' ? firstLetter : 'Other';
                                                        path = `${alphaFolder}/${baseName}`;
                                                        break;
                                                    case "alpha_ranges":
                                                        const sortingTitleRanges = getSortingTitlePreview(movie.title);
                                                        const letterRanges = sortingTitleRanges.charAt(0).toUpperCase();
                                                        let rangeFolder = 'Other';
                                                        if (letterRanges >= 'A' && letterRanges <= 'D') rangeFolder = 'A-D';
                                                        else if (letterRanges >= 'E' && letterRanges <= 'H') rangeFolder = 'E-H';
                                                        else if (letterRanges >= 'I' && letterRanges <= 'L') rangeFolder = 'I-L';
                                                        else if (letterRanges >= 'M' && letterRanges <= 'P') rangeFolder = 'M-P';
                                                        else if (letterRanges >= 'Q' && letterRanges <= 'T') rangeFolder = 'Q-T';
                                                        else if (letterRanges >= 'U' && letterRanges <= 'Z') rangeFolder = 'U-Z';
                                                        path = `${rangeFolder}/${baseName}`;
                                                        break;
                                                    case "genre":
                                                        path = `${movie.genre}/${baseName}`;
                                                        break;
                                                    case "year_decade":
                                                        const decade = Math.floor(movie.year / 10) * 10;
                                                        path = `${decade}s/${baseName}`;
                                                        break;
                                                }
                                            } else { // intelligent
                                                // For preview, show what would happen with intelligent behavior
                                                // Assume movies already have some structure for demonstration
                                                const hasExistingStructure = movie.title === "The Matrix"; // Simulate existing A folder
                                                if (hasExistingStructure && m.folderStructure === "alpha") {
                                                    const sortingTitle = getSortingTitlePreview(movie.title);
                                                    const firstLetter = sortingTitle.charAt(0).toUpperCase();
                                                    const alphaFolder = firstLetter >= 'A' && firstLetter <= 'Z' ? firstLetter : 'Other';
                                                    path = `${alphaFolder}/${baseName}`;
                                                } else {
                                                    // Apply new structure
                                                    switch (m.folderStructure) {
                                                        case "none":
                                                            path = m.ownFolderPerMovie ? `${baseName}/${baseName}` : baseName;
                                                            break;
                                                        case "alpha":
                                                            const sortingTitle = getSortingTitlePreview(movie.title);
                                                            const firstLetter = sortingTitle.charAt(0).toUpperCase();
                                                            const alphaFolder = firstLetter >= 'A' && firstLetter <= 'Z' ? firstLetter : 'Other';
                                                            path = `${alphaFolder}/${baseName}`;
                                                            break;
                                                        case "alpha_ranges":
                                                            const sortingTitleRanges = getSortingTitlePreview(movie.title);
                                                            const letterRanges = sortingTitleRanges.charAt(0).toUpperCase();
                                                            let rangeFolder = 'Other';
                                                            if (letterRanges >= 'A' && letterRanges <= 'D') rangeFolder = 'A-D';
                                                            else if (letterRanges >= 'E' && letterRanges <= 'H') rangeFolder = 'E-H';
                                                            else if (letterRanges >= 'I' && letterRanges <= 'L') rangeFolder = 'I-L';
                                                            else if (letterRanges >= 'M' && letterRanges <= 'P') rangeFolder = 'M-P';
                                                            else if (letterRanges >= 'Q' && letterRanges <= 'T') rangeFolder = 'Q-T';
                                                            else if (letterRanges >= 'U' && letterRanges <= 'Z') rangeFolder = 'U-Z';
                                                            path = `${rangeFolder}/${baseName}`;
                                                            break;
                                                        case "genre":
                                                            path = `${movie.genre}/${baseName}`;
                                                            break;
                                                        case "year_decade":
                                                            const decade = Math.floor(movie.year / 10) * 10;
                                                            path = `${decade}s/${baseName}`;
                                                            break;
                                                    }
                                                }
                                            }

                                            // Apply chronological prefix
                                            if (m.chronologicalPrefix !== "none" && movie.year) {
                                                const prefix = m.chronologicalPrefix === "year" ? `${movie.year} - ` : `${movie.year} - `;
                                                if (path.includes('/')) {
                                                    const lastSlash = path.lastIndexOf('/');
                                                    path = path.substring(0, lastSlash + 1) + prefix + path.substring(lastSlash + 1);
                                                } else {
                                                    path = prefix + path;
                                                }
                                            }

                                            return <div key={i} className="truncate" title={path}>{path}</div>;
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Editions & Versions">
                <Row label="Edition handling">
                    <Radio value={m.editions.mode} onChange={(v) => set({editions: {...m.editions, mode: v}})} options={[
                        {value: "preserve", label: "Preserve Plex tokens ({edition-extended})"},
                        {value: "expand", label: "Expand to human-readable (- Extended Edition)"},
                        {value: "both", label: "Keep both (- Extended Edition {edition-extended})"},
                        {value: "none", label: "None"},
                    ]} segmented/>
                </Row>
                <Row label="Create editions from file names">
                    <Toggle checked={m.editions.createFromFilenames} onChange={(checked) => set({editions: {...m.editions, createFromFilenames: checked}})}/>
                </Row>
                <Row label="Create multiple edition tags (if applicable)">
                    <Toggle
                        checked={m.editions.createMultipleTags}
                        disabled={!m.editions.createFromFilenames}
                        onChange={(checked) => set({editions: {...m.editions, createMultipleTags: checked}})}
                    />
                </Row>
                <Row label="Configure edition parsers">
                    <button
                        onClick={onConfigureParsers}
                        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded"
                    >
                        Configure
                    </button>
                </Row>
                <Row label="Special cases">
                    <div className="flex gap-3">
                        <label className="flex items-center gap-2">
                            <Toggle checked={m.specials.moveExtras} onChange={(checked) => set({specials: {...m.specials, moveExtras: checked}})}/>
                            <span>Move extras to Extras/</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <Toggle checked={m.specials.markISO} onChange={(checked) => set({specials: {...m.specials, markISO: checked}})}/>
                            <span>Mark ISO with [ISO]</span>
                        </label>
                    </div>
                </Row>
                <Row label="Include IDs in filenames">
                    <Radio value={m.ids} onChange={(v) => set({ids: v})} options={[
                        {value: "none", label: "None"},
                        {value: "preserve", label: "Keep unchanged"},
                        {value: "auto_append_all", label: "Always add"},
                    ]} segmented/>
                </Row>
            </Section>

            <Section title="Editions Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How edition settings affect movie names:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample movies:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>The Matrix (1999) [Extended]</div>
                                    <div>Blade Runner (1982) [Director's Cut]</div>
                                    <div>Alien (1979) [Theatrical]</div>
                                    <div>Dune (2021) {'{imdb-tt1160419}'} [Extended]</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Final filename:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { title: "The Matrix", year: 1999, plexEdition: "extended", imdb: "tt0133093", tmdb: "603" },
                                            { title: "Blade Runner", year: 1982, plexEdition: "directors-cut", imdb: "tt0083658", tvdb: "78" },
                                            { title: "Alien", year: 1979, plexEdition: "theatrical", imdb: "tt0078748", tmdb: "348" },
                                            { title: "Dune", year: 2021, plexEdition: "extended", imdb: "tt1160419", tmdb: "438631", hasExistingId: true },
                                        ];

                                        return examples.map((movie, i) => {
                                            let editionDisplay = "";

                                            if (m.editions.mode === "preserve") {
                                                editionDisplay = ` {edition-${movie.plexEdition}}`;
                                            } else if (m.editions.mode === "expand") {
                                                const editionMap: Record<string, string> = {
                                                    "extended": "Extended Edition",
                                                    "directors-cut": "Director's Cut",
                                                    "theatrical": "Theatrical Cut"
                                                };
                                                editionDisplay = ` - ${editionMap[movie.plexEdition] || movie.plexEdition}`;
                                            } else if (m.editions.mode === "both") {
                                                const editionMap: Record<string, string> = {
                                                    "extended": "Extended Edition",
                                                    "directors-cut": "Director's Cut",
                                                    "theatrical": "Theatrical Cut"
                                                };
                                                editionDisplay = ` - ${editionMap[movie.plexEdition] || movie.plexEdition} {edition-${movie.plexEdition}}`;
                                            } else {
                                                editionDisplay = "";
                                            }

                                            // Handle IDs based on settings
                                            let idDisplay = "";
                                            if (m.ids === "auto_append_all") {
                                                // Always add: add all available IDs
                                                const ids = [];
                                                if (movie.imdb) ids.push(`{imdb-${movie.imdb}}`);
                                                if (movie.tvdb) ids.push(`{tvdb-${movie.tvdb}}`);
                                                if (movie.tmdb) ids.push(`{tmdb-${movie.tmdb}}`);
                                                idDisplay = ids.length > 0 ? ` ${ids.join(' ')}` : "";
                                            } else if (m.ids === "preserve") {
                                                // Keep unchanged: preserve existing IDs only
                                                if (movie.hasExistingId && movie.imdb) {
                                                    idDisplay = ` {imdb-${movie.imdb}}`;
                                                } else {
                                                    idDisplay = "";
                                                }
                                            }

                                            const baseName = `${movie.title} (${movie.year})`;
                                            const fullName = `${baseName}${editionDisplay}${idDisplay}.mkv`;

                                            return <div key={i} className="truncate" title={fullName}>{fullName}</div>;
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Subtitles">
                <Row label="Forced/SDH handling">
                    <Radio
                        value={m.subtitles.forcedSdhHandling}
                        onChange={(v) => set({subtitles: {...m.subtitles, forcedSdhHandling: v}})}
                        options={[
                            {value: "preserve", label: "Preserve"},
                            {value: "normalize", label: "Normalize to .forced"},
                            {value: "strip", label: "Strip .sdh"},
                        ]}
                        segmented
                    />
                </Row>
                <Row label="Unknown subtitle handling">
                    <Radio
                        value={m.subtitles.unknownSubtitleHandling}
                        onChange={(v) => set({subtitles: {...m.subtitles, unknownSubtitleHandling: v}})}
                        options={[
                            {value: "preserve", label: "Preserve"},
                            {value: "append_unk", label: "Append .unk"},
                        ]}
                        segmented
                    />
                </Row>
            </Section>
        </>
    );
}
