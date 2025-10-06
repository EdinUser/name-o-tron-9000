import React from "react";
import Select from "../../components/Select";
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

export function Misc({s, onChange}: { s: Settings; onChange: (v: Settings["misc"]) => void }) {
    const m = s.misc;
    const set = (patch: Partial<typeof m>) => onChange({...m, ...patch});
    return (
        <>
            <Section title="Unmatched Files">
                <Radio value={m.unmatchedHandling} onChange={(v) => set({unmatchedHandling: v})} options={[
                    {value: "leave", label: "Leave in place"},
                    {value: "move_unmatched", label: "Move to Unmatched/"},
                    {value: "move_extras", label: "Move to Extras/"},
                    {value: "delete", label: "Delete (⚠ confirm)"},
                ]} segmented/>
            </Section>
            <Section title="Non-Media Files">
                <Radio value={m.nonMediaHandling} onChange={(v) => set({nonMediaHandling: v})} options={[
                    {value: "skip", label: "Skip"},
                    {value: "move_extras", label: "Move to Extras/"},
                    {value: "delete", label: "Delete (⚠ confirm)"},
                ]} segmented/>
            </Section>
            <Section title="Advanced Warnings">
                <Row label="Path length check">
                    <Toggle checked={m.warnings.pathLength} onChange={(checked) => set({warnings: {...m.warnings, pathLength: checked}})}/>
                </Row>
                <Row label="Reserved names check">
                    <Toggle checked={m.warnings.reservedNames} onChange={(checked) => set({warnings: {...m.warnings, reservedNames: checked}})}/>
                </Row>
                <Row label="Non-media detection (.txt, .nfo, .jpg)">
                    <Toggle checked={m.warnings.nonMediaDetection} onChange={(checked) => set({warnings: {...m.warnings, nonMediaDetection: checked}})}/>
                </Row>
            </Section>

            <Section title="Character Replacement">
                <div className="space-y-4">
                    <div className="text-sm text-neutral-300">
                        Configure how invalid characters in filenames are replaced during renaming.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-200 mb-2">
                                Separators (:)
                            </label>
                            <Select
                                value={m.characterReplacement.separators}
                                onChange={(v) => set({characterReplacement: {...m.characterReplacement, separators: v as "-" | "_" | "remove"}})}
                                options={[{value: "-", label: "-"}, {value: "_", label: "_"}, {value: "remove", label: "Remove"}]}
                            />
                            <div className="text-xs text-neutral-400 mt-1">e.g. "Star Trek: Discovery" → "Star Trek - Discovery"</div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-200 mb-2">
                                Quotes (")
                            </label>
                            <Select
                                value={m.characterReplacement.quotes}
                                onChange={(v) => set({characterReplacement: {...m.characterReplacement, quotes: v as "'" | "`" | "remove"}})}
                                options={[{value: "'", label: "'"}, {value: "`", label: "`"}, {value: "remove", label: "Remove"}]}
                            />
                            <div className="text-xs text-neutral-400 mt-1">Swap double quotes with single quotes</div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-200 mb-2">
                                Wildcards (* ?)
                            </label>
                            <Select
                                value={m.characterReplacement.wildcards}
                                onChange={(v) => set({characterReplacement: {...m.characterReplacement, wildcards: v as "-" | "remove"}})}
                                options={[{value: "-", label: "-"}, {value: "remove", label: "Remove"}]}
                            />
                            <div className="text-xs text-neutral-400 mt-1">Replace asterisks and question marks</div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-200 mb-2">
                                Brackets (&lt; &gt;)
                            </label>
                            <Select
                                value={m.characterReplacement.brackets}
                                onChange={(v) => set({characterReplacement: {...m.characterReplacement, brackets: v as "()" | "[]" | "remove"}})}
                                options={[{value: "()", label: "( )"}, {value: "[]", label: "[ ]"}, {value: "remove", label: "Remove"}]}
                            />
                            <div className="text-xs text-neutral-400 mt-1">Convert angle brackets to parentheses or square brackets</div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-neutral-200 mb-2">
                                General (\ / |)
                            </label>
                            <Select
                                value={m.characterReplacement.general}
                                onChange={(v) => set({characterReplacement: {...m.characterReplacement, general: v as "-" | "_" | "remove"}})}
                                options={[{value: "-", label: "-"}, {value: "_", label: "_"}, {value: "remove", label: "Remove"}]}
                            />
                            <div className="text-xs text-neutral-400 mt-1">Replace backslashes, forward slashes, and pipes</div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="File Handling Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How file handling settings work:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample files:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Movie.Not.In.Plex.mkv</div>
                                    <div>movie.nfo</div>
                                    <div>poster.jpg</div>
                                    <div>CON.txt</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">File types:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Unmatched video</div>
                                    <div>Metadata file</div>
                                    <div>Image file</div>
                                    <div>Reserved name</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Handling result:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { file: "Movie.Not.In.Plex.mkv", type: "unmatched" },
                                            { file: "movie.nfo", type: "nonmedia" },
                                            { file: "poster.jpg", type: "nonmedia" },
                                            { file: "CON.txt", type: "reserved" },
                                        ];

                                        return examples.map((example, i) => {
                                            let result = "";
                                            let status = "good";

                                            if (example.type === "unmatched") {
                                                if (m.unmatchedHandling === "leave") {
                                                    result = "✅ Left in place";
                                                } else if (m.unmatchedHandling === "move_unmatched") {
                                                    result = "📁 WARNING (moved)";
                                                    status = "warning";
                                                } else if (m.unmatchedHandling === "move_extras") {
                                                    result = "📁 WARNING (moved)";
                                                    status = "warning";
                                                } else if (m.unmatchedHandling === "delete") {
                                                    result = "🗑️ WARNING (deleted)";
                                                    status = "warning";
                                                }
                                            } else if (example.type === "nonmedia") {
                                                if (m.nonMediaHandling === "skip") {
                                                    result = "⏭️ WARNING (skipped)";
                                                    status = "warning";
                                                } else if (m.nonMediaHandling === "move_extras") {
                                                    result = "📁 WARNING (moved)";
                                                    status = "warning";
                                                } else if (m.nonMediaHandling === "delete") {
                                                    result = "🗑️ WARNING (deleted)";
                                                    status = "warning";
                                                }
                                            } else if (example.type === "reserved") {
                                                if (m.warnings.reservedNames) {
                                                    result = "🟥 ERROR (reserved)";
                                                    status = "error";
                                                } else {
                                                    result = "✅ GOOD (processed)";
                                                }
                                            }

                                            return (
                                                <div key={i} className={`truncate ${status === "error" ? "text-red-400" : status === "warning" ? "text-amber-400" : "text-emerald-400"}`}>
                                                    {result}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>
        </>
    );
}
