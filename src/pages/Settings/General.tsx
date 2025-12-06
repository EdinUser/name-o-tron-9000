import React from "react";
import Toggle from "../../components/Toggle";
import Radio from "../../components/Radio";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { type Settings, type EncodingMode } from "../../state/settings";

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

export function General({s, onChange}: { s: Settings; onChange: (v: Settings["general"]) => void }) {
    const g = s.general;
    const set = (patch: Partial<typeof g>) => onChange({...g, ...patch});
    const setEncoding = (patch: Partial<typeof g.encoding>) => onChange({...g, encoding: {...g.encoding, ...patch}});
    const setPagination = (patch: Partial<typeof g.pagination>) => onChange({...g, pagination: {...g.pagination, ...patch}});



    async function clearSavedCreds() {
        try { await invoke("secure_clear_token"); } catch {}
        try { await invoke("save_settings", { settings: { auth: { plexToken: null } } }); } catch {}
        try { localStorage.removeItem("plexToken"); } catch {}
        // no toast system here; silent success
    }

    async function openLogsFolder() {
        try {
            const dir = await invoke<string>("get_logs_directory_path");
            await revealItemInDir(dir);
        } catch (error) {
            alert(`Failed to open logs folder: ${error}`);
        }
    }

    async function exportDiagnostics() {
        try {
            const suggested = `name-o-tron-9000-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`;
            const target = await save({
                defaultPath: suggested,
                filters: [
                    {
                        name: "Diagnostic bundles",
                        extensions: ["zip"],
                    },
                ],
            });

            if (!target) return; // user cancelled

            const path = target.endsWith(".zip") ? target : `${target}.zip`;
            const finalPath = await invoke<string>("export_diagnostic_bundle_zip", { targetPath: path });
            alert(`Diagnostic bundle saved.\n\nPath: ${finalPath}`);
        } catch (error) {
            alert(`Failed to export diagnostic bundle: ${error}`);
        }
    }

    return (
        <>
            <Section title="Plex Login Persistence">
                <Radio
                    value={g.authPersistence || "none"}
                    onChange={(v: "none" | "secure" | "file") => set({authPersistence: v})}
                    options={[
                        { value: "none", label: "Don't remember (most secure)" },
                        { value: "secure", label: "Remember in OS Keychain (recommended)" },
                        { value: "file", label: "Remember in app config (less secure)" },
                    ]}
                    segmented
                />
                <div className="mt-2 text-right">
                    <button
                        type="button"
                        onClick={clearSavedCreds}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                    >
                        Clear saved Plex credentials
                    </button>
                </div>
            </Section>
            <Section title="General Behavior">
                <Row label="Preview before renaming">
                    <Toggle checked={g.previewBeforeRename} onChange={(checked) => set({previewBeforeRename: checked})}/>
                </Row>
                <Row label="Save rename log (txt/csv/json)">
                    <div className="flex gap-3">
                        <label className="flex items-center gap-2">
                            <Toggle checked={g.saveRenameLog.txt} onChange={(checked) => set({saveRenameLog: {...g.saveRenameLog, txt: checked}})}/>
                            <span>txt</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <Toggle checked={g.saveRenameLog.csv} onChange={(checked) => set({saveRenameLog: {...g.saveRenameLog, csv: checked}})}/>
                            <span>csv</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <Toggle checked={g.saveRenameLog.json} onChange={(checked) => set({saveRenameLog: {...g.saveRenameLog, json: checked}})}/>
                            <span>json</span>
                        </label>
                    </div>
                </Row>
                <Row label="Auto-create rollback log (undo)">
                    <Toggle checked={g.autoRollbackLog} onChange={(checked) => set({autoRollbackLog: checked})}/>
                </Row>
            </Section>

            <Section title="Support & Diagnostics">
                <Row label="Export diagnostic bundle for bug reports">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={exportDiagnostics}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                        >
                            Export bundle
                        </button>
                        <button
                            type="button"
                            onClick={openLogsFolder}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
                        >
                            Open logs folder
                        </button>
                    </div>
                </Row>
            </Section>

            <Section title="Filename Encoding">
                <Row label="Mode">
                    <Radio<EncodingMode>
                        value={g.encoding.mode}
                        onChange={(v) => setEncoding({mode: v})}
                        options={[
                            {value: "unicode", label: "Keep Unicode"},
                            {value: "transliterate", label: "Transliterate → ASCII"},
                            {value: "ascii", label: "Force ASCII only"},
                        ]}
                        segmented
                    />
                </Row>
                <Row label="Highlight non‑Latin in preview">
                    <Toggle checked={g.encoding.highlightNonLatin} onChange={(checked) => setEncoding({highlightNonLatin: checked})}/>
                </Row>
            </Section>

            <Section title="Conflict Handling">
                <Radio
                    value={g.conflictHandling}
                    onChange={(v) => set({conflictHandling: v})}
                    options={[
                        {value: "skip", label: "Skip"},
                        {value: "overwrite", label: "Overwrite"},
                        {value: "suffix2", label: "Append suffix (2)"},
                    ]}
                    segmented
                />
            </Section>

            <Section title="Safety">
                <Row label="Path length check (warn >200, block >255)">
                    <Toggle checked={g.safety.pathLengthCheck} onChange={(checked) => set({safety: {...g.safety, pathLengthCheck: checked}})}/>
                </Row>
                <Row label="Reserved filenames check (Windows: CON, AUX, …)">
                    <Toggle checked={g.safety.reservedNamesCheck} onChange={(checked) => set({safety: {...g.safety, reservedNamesCheck: checked}})}/>
                </Row>
                <Row label="Permissions check before renaming">
                    <Toggle checked={g.safety.permissionsCheck} onChange={(checked) => set({safety: {...g.safety, permissionsCheck: checked}})}/>
                </Row>
            </Section>

            <Section title="Subtitles">
                <Row label="Rename subtitles with video">
                    <Toggle checked={g.subtitles.renameWithVideo} onChange={(checked) => set({subtitles: {...g.subtitles, renameWithVideo: checked}})}/>
                </Row>
                <Row label="Preserve language codes & suffixes">
                    <Toggle checked={g.subtitles.preserveLanguageCodes} onChange={(checked) => set({subtitles: {...g.subtitles, preserveLanguageCodes: checked}})}/>
                </Row>
                <Row label="Language code handling">
                    <Radio
                        value={g.subtitles.languageCodeHandling}
                        onChange={(v) => set({subtitles: {...g.subtitles, languageCodeHandling: v}})}
                        options={[
                            {value: "preserve", label: "Preserve"},
                            {value: "normalize", label: "Normalize (ISO-639-2)"},
                            {value: "strip", label: "Strip"},
                        ]}
                        segmented
                    />
                </Row>
                <Row label="Skip subtitles">
                    <Toggle checked={g.subtitles.skipSubtitles} onChange={(checked) => set({subtitles: {...g.subtitles, skipSubtitles: checked}})}/>
                </Row>
                <Row label="Convert to UTF-8">
                    <Toggle checked={g.subtitles.convertToUtf8} onChange={(checked) => set({subtitles: {...g.subtitles, convertToUtf8: checked}})}/>
                </Row>
                {g.subtitles.convertToUtf8 && (
                    <div className="ml-3 mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <div className="text-sm text-amber-200">
                                <strong>Warning:</strong> Automatic conversion may mis-detect encodings and corrupt characters. Enable only if you see garbled text.
                            </div>
                        </div>
                    </div>
                )}
                <Row label="Backup before conversion">
                    <Toggle checked={g.subtitles.backupBeforeConversion} onChange={(checked) => set({subtitles: {...g.subtitles, backupBeforeConversion: checked}})}/>
                </Row>
                <Row label="Skip uncertain encoding detection">
                    <Toggle checked={g.subtitles.skipUncertainEncoding} onChange={(checked) => set({subtitles: {...g.subtitles, skipUncertainEncoding: checked}})}/>
                </Row>
            </Section>

            <Section title="Safety & Processing Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How safety settings affect processing:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample scenarios:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Very long movie title that exceeds path limits</div>
                                    <div>CON.txt (Windows reserved name)</div>
                                    <div>Movie with ñáéíóú characters</div>
                                    <div>File with overwrite conflict</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Safety results:</div>
                                <div className="space-y-1">
                                    {(() => {
                                        const scenarios = [
                                            { type: "path_length", content: "A Very Long Movie Title That Definitely Exceeds The Two Hundred Character Limit And Should Trigger A Warning Or Block.mkv" },
                                            { type: "reserved_name", content: "CON.txt" },
                                            { type: "unicode", content: "El Niño (2007).mkv" },
                                            { type: "conflict", content: "Existing file conflict scenario" },
                                        ];

                                        return scenarios.map((scenario, i) => {
                                            let result = "";
                                            let status = "good";

                                            if (scenario.type === "path_length" && g.safety.pathLengthCheck) {
                                                if (scenario.content.length > 255) {
                                                    result = "🟥 ERROR (>255 chars)";
                                                    status = "error";
                                                } else if (scenario.content.length > 200) {
                                                    result = "🟨 WARNING (>200 chars)";
                                                    status = "warning";
                                                } else {
                                                    result = "🟩 GOOD";
                                                }
                                            } else if (scenario.type === "reserved_name" && g.safety.reservedNamesCheck) {
                                                const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(scenario.content);
                                                if (reserved) {
                                                    result = "🟥 ERROR (reserved name)";
                                                    status = "error";
                                                } else {
                                                    result = "🟩 GOOD";
                                                }
                                            } else if (scenario.type === "unicode") {
                                                if (g.encoding.mode === "ascii") {
                                                    result = "🟥 ERROR (non-ASCII)";
                                                    status = "error";
                                                } else if (g.encoding.mode === "transliterate") {
                                                    result = "🟨 WARNING (transliterated)";
                                                    status = "warning";
                                                } else {
                                                    result = "🟩 GOOD (Unicode kept)";
                                                }
                                            } else if (scenario.type === "conflict") {
                                                if (g.conflictHandling === "skip") {
                                                    result = "⏭️ WARNING (skipped)";
                                                    status = "warning";
                                                } else if (g.conflictHandling === "overwrite") {
                                                    result = "🔄 WARNING (overwritten)";
                                                    status = "warning";
                                                } else {
                                                    result = "🔢 WARNING (renamed)";
                                                    status = "warning";
                                                }
                                            } else {
                                                result = "🟩 GOOD";
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

            <Section title="Default Load Limits">
                <Row label="Movies default limit">
                    <input
                        type="number"
                        value={g.pagination.defaultMovieLimit}
                        onChange={(e) => setPagination({defaultMovieLimit: parseInt(e.target.value) || 200})}
                        className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                        min="50"
                        max="10000"
                    />
                </Row>
                <Row label="TV Shows default limit">
                    <input
                        type="number"
                        value={g.pagination.defaultShowLimit}
                        onChange={(e) => setPagination({defaultShowLimit: parseInt(e.target.value) || 200})}
                        className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                        min="50"
                        max="10000"
                    />
                </Row>
                <Row label="Music default limit">
                    <input
                        type="number"
                        value={g.pagination.defaultMusicLimit}
                        onChange={(e) => setPagination({defaultMusicLimit: parseInt(e.target.value) || 200})}
                        className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                        min="50"
                        max="10000"
                    />
                </Row>
            </Section>
        </>
    );
}
