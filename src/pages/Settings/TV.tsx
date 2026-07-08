import React from "react";
import Toggle from "../../components/Toggle";
import Radio from "../../components/Radio";
import { type Settings } from "../../state/settings";
import { renderEpisodeTemplateWithPlexTokens } from "../Preview/episodeTokens";

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

export function TV({s, onChange}: { s: Settings; onChange: (v: Settings["tv"]) => void }) {
    const t = s.tv;
    const set = (patch: Partial<typeof t>) => onChange({...t, ...patch});
    return (
        <>
            <Section title="Structure">
                <Row label="Always put episodes in Season folders">
                    <Toggle checked={t.seasonFolders} onChange={(checked) => set({seasonFolders: checked})}/>
                </Row>
                <Row label="Treat mini-series as TV shows">
                    <Toggle checked={t.treatMiniSeriesAsTv} onChange={(checked) => set({treatMiniSeriesAsTv: checked})}/>
                </Row>
            </Section>

            <Section title="TV Structure Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How structure settings affect TV show organization:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample shows:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Breaking Bad S01E01 Pilot</div>
                                    <div>Stranger Things S03E08 The Battle of Starcourt</div>
                                    <div>The Office S02E01 The Dundies</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Show types:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Regular TV Show</div>
                                    <div>Regular TV Show</div>
                                    <div>Mini-series</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Organized as:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { showTitle: "Breaking Bad", season: 1, episode: 1, title: "Pilot", isMiniSeries: false },
                                            { showTitle: "Stranger Things", season: 3, episode: 8, title: "The Battle of Starcourt", isMiniSeries: false },
                                            { showTitle: "The Office", season: 2, episode: 1, title: "The Dundies", isMiniSeries: true },
                                        ];

                                        return examples.map((show, i) => {
                                            let result = "";

                                            if (t.seasonFolders) {
                                                const seasonLabel = `Season ${String(show.season).padStart(2, '0')}`;
                                                result = `${show.showTitle}/${seasonLabel}/${show.showTitle} - S${String(show.season).padStart(2, '0')}E${String(show.episode).padStart(2, '0')} - ${show.title}.mkv`;
                                            } else {
                                                result = `${show.showTitle} - S${String(show.season).padStart(2, '0')}E${String(show.episode).padStart(2, '0')} - ${show.title}.mkv`;
                                            }

                                            // Handle mini-series logic
                                            if (show.isMiniSeries && !t.treatMiniSeriesAsTv) {
                                                result = `${show.showTitle}/${show.title}.mkv`;
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
            <Section title="Detection">
                <Row label="Detect Extended / Uncut / Director's Cut episodes">
                    <Toggle checked={t.detectCuts} onChange={(checked) => set({detectCuts: checked})}/>
                </Row>
                <Row label="Detect OVA / Specials → Suggest Season 00">
                    <Toggle checked={t.detectOVAsSeason00} onChange={(checked) => set({detectOVAsSeason00: checked})}/>
                </Row>
                <Row label="Normalize multi-episode files (S01E01E02 → S01E01-E02)">
                    <Toggle checked={t.normalizeMultiEpisode} onChange={(checked) => set({normalizeMultiEpisode: checked})}/>
                </Row>
                <Row label="Warn if episode count doesn't match Plex DB">
                    <Toggle checked={t.warnEpisodeCountMismatch} onChange={(checked) => set({warnEpisodeCountMismatch: checked})}/>
                </Row>
                <Row label="Include IDs in filenames">
                    <Radio value={t.ids} onChange={(v) => set({ids: v})} options={[
                        {value: "none", label: "None"},
                        {value: "preserve", label: "Keep unchanged"},
                        {value: "auto_append_all", label: "Always add"},
                    ]} segmented/>
                </Row>
            </Section>

            <Section title="TV Episode Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How episode naming works with current settings:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample episodes:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Breaking Bad S01E01 Pilot</div>
                                    <div>Stranger Things S03E08 The Battle of Starcourt</div>
                                    <div>The Office S02E01 The Dundies</div>
                                    <div>Attack on Titan S00 OVA 1</div>
                                    <div>Doctor Who S08E01-02 Deep Breath</div>
                                    <div>Game of Thrones S08E67 Extended Cut</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Organized as:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const template = s.templates.episode;
                                        const examples = [
                                            { showTitle: "Breaking Bad", season: 1, episode: 1, title: "Pilot", year: 2008, imdb: "tt0959621", tvdb: "81189", isOVA: false, isMultiEpisode: false, hasCut: false },
                                            { showTitle: "Stranger Things", season: 3, episode: 8, title: "The Battle of Starcourt", year: 2019, imdb: "tt4574334", tmdb: "60574", isOVA: false, isMultiEpisode: false, hasCut: false },
                                            { showTitle: "The Office", season: 2, episode: 1, title: "The Dundies", year: 2005, imdb: "tt0664521", tvdb: "367201", tmdb: "2316", isOVA: false, isMultiEpisode: false, hasCut: false },
                                            { showTitle: "Attack on Titan", season: 1, episode: 1, title: "OVA 1", year: 2013, imdb: "tt2560140", isOVA: true, isMultiEpisode: false, hasCut: false },
                                            { showTitle: "Doctor Who", season: 8, episode: 1, title: "Deep Breath", year: 2014, imdb: "tt3588894", isOVA: false, isMultiEpisode: true, hasCut: false },
                                            { showTitle: "Game of Thrones", season: 8, episode: 6, title: "The Iron Throne", year: 2019, imdb: "tt4271860", isOVA: false, isMultiEpisode: false, hasCut: true },
                                        ];

                                        return examples.map((ep, i) => {
                                            // Build dynamic template based on settings (same logic as in Preview.tsx)
                                            let dynamicTemplate = template;

                                            // Apply ID settings to template
                                            if (t.ids === "none") {
                                                // Remove ID placeholders from template when IDs are disabled
                                                dynamicTemplate = dynamicTemplate.replace(/\{imdb[^}]*\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{tvdb\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{tvdbToken\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{thetvdb[^}]*\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{tmdb[^}]*\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{plexIds\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{ids\}/g, '');
                                            }

                                            // Apply OVA detection
                                            let season = ep.season;
                                            if (t.detectOVAsSeason00 && ep.isOVA) {
                                                season = 0;
                                            }

                                            // Apply multi-episode normalization
                                            let episode = ep.episode;
                                            let title = ep.title;
                                            if (t.normalizeMultiEpisode && ep.isMultiEpisode) {
                                                dynamicTemplate = renderEpisodeTemplateWithPlexTokens(dynamicTemplate, {
                                                    startEpisode: ep.episode,
                                                    endEpisode: ep.episode + 1,
                                                });
                                            }

                                            let result = dynamicTemplate
                                                .replace(/\{showTitle\}/g, ep.showTitle)
                                                .replace(/\{season(?::(\d+))?\}/g, (_, padding) => {
                                                    const pad = padding ? parseInt(padding) : 2;
                                                    return String(season).padStart(pad, '0');
                                                })
                                                .replace(/\{episode(?::(\d+))?\}/g, (_, padding) => {
                                                    const pad = padding ? parseInt(padding) : 2;
                                                    return String(episode).padStart(pad, '0');
                                                })
                                                .replace(/\{title\}/g, title)
                                                .replace(/\{year\}/g, ep.year.toString());

                                            // Apply folder structure settings BEFORE template rendering
                                            let folderPrefix = "";

                                            // For "Keep unchanged" ID setting, preserve existing show folder structure
                                            if (t.ids === "preserve") {
                                                // Use the show title with ID placeholder for preview
                                                if (t.seasonFolders) {
                                                    // Create Series/Season XX/ structure
                                                    let seasonNum = season;
                                                    if (t.detectOVAsSeason00 && ep.isOVA) {
                                                        seasonNum = 0;
                                                    }
                                                    const seasonLabel = `Season ${String(seasonNum).padStart(2, '0')}`;
                                                    folderPrefix = `${ep.showTitle} {tvdb-377543}/${seasonLabel}/`;
                                                } else {
                                                    // Create Series/Episode structure (no season folders)
                                                    folderPrefix = `${ep.showTitle} {tvdb-377543}/`;
                                                }
                                            } else {
                                                // For other ID settings, ALWAYS create Series folder
                                                if (t.seasonFolders) {
                                                    // Create Series/Season XX/ structure
                                                    let seasonNum = season;
                                                    if (t.detectOVAsSeason00 && ep.isOVA) {
                                                        seasonNum = 0;
                                                    }
                                                    const seasonLabel = `Season ${String(seasonNum).padStart(2, '0')}`;
                                                    folderPrefix = `${ep.showTitle}/${seasonLabel}/`;
                                                } else {
                                                    // Create Series/Episode structure (no season folders)
                                                    folderPrefix = `${ep.showTitle}/`;
                                                }
                                            }

                                            // Apply folder prefix if needed
                                            if (folderPrefix) {
                                                result = folderPrefix + result;
                                            }

                                            // Add cut detection flags
                                            if (t.detectCuts && ep.hasCut) {
                                                result += " [CUT]";
                                            }

                                            // Add IDs based on settings
                                            if (t.ids === "preserve") {
                                                // For "Keep unchanged": IDs are preserved in folder structure, not filename
                                                // Don't add IDs to filename in preview
                                            } else if (t.ids === "auto_append_all") {
                                                // Auto-append all available IDs
                                                result += " {imdb-tt1234567} {tvdb-123456}";
                                            }

                                            return <div key={i} className="truncate" title={result}>{result}</div>;
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="text-neutral-400 text-xs mt-2">
                        Template: <span className="font-mono text-cyan-300">{s.templates.episode}</span>
                    </div>
                    <div className="text-neutral-400 text-xs mt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="font-medium mb-1">Detection Features:</div>
                                <div className="space-y-1">
                                    {t.detectOVAsSeason00 && <div>• OVAs/Specials → Season 00</div>}
                                    {t.normalizeMultiEpisode && <div>• Multi-episode normalization</div>}
                                    {t.detectCuts && <div>• Cut/edition detection</div>}
                                    {t.warnEpisodeCountMismatch && <div>• Episode count validation</div>}
                                </div>
                            </div>
                            <div>
                                <div className="font-medium mb-1">Structure Features:</div>
                                <div className="space-y-1">
                                    {t.seasonFolders && <div>• Season folders</div>}
                                    {!t.seasonFolders && <div>• No season folders (episodes in series folder)</div>}
                                    {!t.treatMiniSeriesAsTv && <div>• Mini-series as movies</div>}
                                    {t.ids === "preserve" && <div>• IDs in folder names</div>}
                                    {t.ids === "auto_append_all" && <div>• IDs in filenames</div>}
                                    {t.ids === "none" && <div>• No IDs</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Subtitles">
                <Row label="Flatten per-episode subfolders">
                    <Toggle checked={t.subtitles.flattenPerEpisodeSubfolders} onChange={(checked) => set({subtitles: {...t.subtitles, flattenPerEpisodeSubfolders: checked}})}/>
                </Row>
                <Row label="Handle non-matching names">
                    <Toggle checked={t.subtitles.handleNonMatchingNames} onChange={(checked) => set({subtitles: {...t.subtitles, handleNonMatchingNames: checked}})}/>
                </Row>
                <Row label="Multi-sub handling">
                    <Radio
                        value={t.subtitles.multiSubHandling}
                        onChange={(v) => set({subtitles: {...t.subtitles, multiSubHandling: v}})}
                        options={[
                            {value: "preserve", label: "Preserve"},
                            {value: "number", label: "Number (.eng.1.srt, .eng.2.srt)"},
                            {value: "first_only", label: "First Only"},
                        ]}
                        segmented
                    />
                </Row>
            </Section>
        </>
    );
}
