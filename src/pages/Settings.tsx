import React, {useEffect, useState} from "react";
import { invoke } from "@tauri-apps/api/core";
import {useSettings, type Settings, type EncodingMode} from "../state/settings";
import EditionParsersModal from "../components/EditionParsersModal";

type Props = { onClose: () => void };

type TabKey = "general" | "movies" | "tv" | "music" | "misc";

export default function SettingsModal({onClose}: Props) {
    const { settings, updateSettings } = useSettings();
    const [tab, setTab] = useState<TabKey>(() => {
        try { return (localStorage.getItem("nameotron.settings.lastTab") as TabKey) || "general"; } catch { return "general"; }
    });
    const [localSettings, setLocalSettings] = useState<Settings>(settings);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditionParsersModalOpen, setIsEditionParsersModalOpen] = useState(false);

    // Update local settings when global settings change
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // Persist last opened tab
    useEffect(() => {
        try { localStorage.setItem("nameotron.settings.lastTab", tab); } catch {}
    }, [tab]);

    function update<K extends keyof Settings>(k: K, v: Settings[K]) {
        const next = {...localSettings, [k]: v} as Settings;
        setLocalSettings(next);
        setHasChanges(true);
    }

    async function saveSettingsAndClose() {
        if (!hasChanges) {
            onClose();
            return;
        }

        setIsSaving(true);
        try {
            updateSettings(localSettings);
            setHasChanges(false);
            onClose();
        } catch (error) {
            console.error("Failed to save settings:", error);
        } finally {
            setIsSaving(false);
        }
    }

    const handleClose = () => {
        if (hasChanges) {
            if (confirm("You have unsaved changes. Are you sure you want to close without saving?")) {
                onClose();
            }
        } else {
            onClose();
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose} style={{ zIndex: 9999 }}>
                <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                        <h1 className="text-xl font-semibold text-neutral-100">Settings</h1>
                        <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Close (unsaved changes will be lost)">
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </div>

                    <div className="flex flex-col max-h-[calc(90vh-140px)]">
                        <div className="px-6 pt-4">
                            <Tabs tab={tab} setTab={setTab}/>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-6">
                            {tab === "general" && <General s={localSettings} onChange={(v) => update("general", v)}/>}
                            {tab === "movies" && <Movies s={localSettings} onChange={(v) => update("movies", v)} onConfigureParsers={() => setIsEditionParsersModalOpen(true)}/>}
                            {tab === "tv" && <TV s={localSettings} onChange={(v) => update("tv", v)}/>}
                            {tab === "music" && <Music s={localSettings} onChange={(v) => update("music", v)}/>}
                            {tab === "misc" && <Misc s={localSettings} onChange={(v) => update("misc", v)}/>}
                        </div>

                        <div className="px-6 pb-6 border-t border-neutral-800">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-neutral-400">
                                    {hasChanges ? "You have unsaved changes" : "Settings are up to date"}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleClose}
                                        className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                        disabled={isSaving}
                                    >
                                        {hasChanges ? "Cancel" : "Close"}
                                    </button>
                                    <button
                                        onClick={saveSettingsAndClose}
                                        disabled={!hasChanges || isSaving}
                                        className={`px-4 py-2 text-sm font-medium rounded ${
                                            hasChanges && !isSaving
                                                ? "bg-cyan-500 text-neutral-900 hover:bg-cyan-400"
                                                : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
                                        }`}
                                    >
                                        {isSaving ? "Saving..." : "Save & Close"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <EditionParsersModal
                isOpen={isEditionParsersModalOpen}
                onClose={() => setIsEditionParsersModalOpen(false)}
                parsers={localSettings.movies.editions.parsers}
                onChange={(parsers) => update("movies", {...localSettings.movies, editions: {...localSettings.movies.editions, parsers}})}
            />
        </>
    );
}

function Tabs({tab, setTab}: { tab: TabKey; setTab: (t: TabKey) => void }) {
    const items: { key: TabKey; label: string }[] = [
        {key: "general", label: "General"},
        {key: "movies", label: "Movies"},
        {key: "tv", label: "TV Shows"},
        {key: "music", label: "Music"},
        {key: "misc", label: "Misc"},
    ];
    return (
        <div className="flex flex-wrap justify-center gap-2">
            {items.map((it) => (
                <button key={it.key} onClick={() => setTab(it.key)} className={`rounded-md border px-3 py-1.5 text-sm ${tab === it.key ? "border-cyan-500 bg-cyan-500/10" : "border-neutral-700 bg-neutral-800 hover:bg-neutral-700"}`}>{it.label}</button>
            ))}
        </div>
    );
}

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

function Radio<T extends string>({value, setValue, opts}: { value: T; setValue: (v: T) => void; opts: { value: T; label: string }[] }) {
    return (
        <div className="flex gap-3">
            {opts.map((o) => (
                <label key={o.value} className="inline-flex items-center gap-1">
                    <input type="radio" className="h-4 w-4 accent-cyan-500" checked={value === o.value} onChange={() => setValue(o.value)}/>
                    <span>{o.label}</span>
                </label>
            ))}
        </div>
    );
}

function General({s, onChange}: { s: Settings; onChange: (v: Settings["general"]) => void }) {
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

    return (
        <>
            <Section title="Plex Login Persistence">
                <Radio
                    value={(g.authPersistence || "none") as any}
                    setValue={(v) => set({authPersistence: v as any})}
                    opts={[
                        { value: "none" as any, label: "Don’t remember (most secure)" },
                        { value: "secure" as any, label: "Remember in OS Keychain (recommended)" },
                        { value: "file" as any, label: "Remember in app config (less secure)" },
                    ]}
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
                    <input type="checkbox" checked={g.previewBeforeRename} onChange={(e) => set({previewBeforeRename: e.target.checked})}/>
                </Row>
                <Row label="Save rename log (txt/csv/json)">
                    <label><input type="checkbox" checked={g.saveRenameLog.txt} onChange={(e) => set({saveRenameLog: {...g.saveRenameLog, txt: e.target.checked}})}/> txt</label>
                    <label style={{marginLeft: 12}}><input type="checkbox" checked={g.saveRenameLog.csv} onChange={(e) => set({saveRenameLog: {...g.saveRenameLog, csv: e.target.checked}})}/> csv</label>
                    <label style={{marginLeft: 12}}><input type="checkbox" checked={g.saveRenameLog.json} onChange={(e) => set({saveRenameLog: {...g.saveRenameLog, json: e.target.checked}})}/> json</label>
                </Row>
                <Row label="Auto-create rollback log (undo)">
                    <input type="checkbox" checked={g.autoRollbackLog} onChange={(e) => set({autoRollbackLog: e.target.checked})}/>
                </Row>
            </Section>

            <Section title="Filename Encoding">
                <Row label="Mode">
                    <Radio<EncodingMode>
                        value={g.encoding.mode}
                        setValue={(v) => setEncoding({mode: v})}
                        opts={[
                            {value: "unicode", label: "Keep Unicode"},
                            {value: "transliterate", label: "Transliterate → ASCII"},
                            {value: "ascii", label: "Force ASCII only"},
                        ]}
                    />
                </Row>
                <Row label="Highlight non‑Latin in preview">
                    <input type="checkbox" checked={g.encoding.highlightNonLatin} onChange={(e) => setEncoding({highlightNonLatin: e.target.checked})}/>
                </Row>
            </Section>

            <Section title="Conflict Handling">
                <Radio
                    value={g.conflictHandling}
                    setValue={(v) => set({conflictHandling: v as any})}
                    opts={[
                        {value: "skip", label: "Skip"},
                        {value: "overwrite", label: "Overwrite"},
                        {value: "suffix2", label: "Append suffix (2)"},
                    ]}
                />
            </Section>

            <Section title="Safety">
                <Row label="Path length check (warn >200, block >255)">
                    <input type="checkbox" checked={g.safety.pathLengthCheck} onChange={(e) => set({safety: {...g.safety, pathLengthCheck: e.target.checked}})}/>
                </Row>
                <Row label="Reserved filenames check (Windows: CON, AUX, …)">
                    <input type="checkbox" checked={g.safety.reservedNamesCheck} onChange={(e) => set({safety: {...g.safety, reservedNamesCheck: e.target.checked}})}/>
                </Row>
                <Row label="Permissions check before renaming">
                    <input type="checkbox" checked={g.safety.permissionsCheck} onChange={(e) => set({safety: {...g.safety, permissionsCheck: e.target.checked}})}/>
                </Row>
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

function Movies({s, onChange, onConfigureParsers}: { s: Settings; onChange: (v: Settings["movies"]) => void; onConfigureParsers?: () => void }) {
    const m = s.movies;
    const set = (patch: Partial<typeof m>) => onChange({...m, ...patch});
    return (
        <>
            <Section title="Collections">
                <Row label="Enable collections">
                    <input type="checkbox" checked={m.collections.enabled} onChange={(e) => set({collections: {...m.collections, enabled: e.target.checked}})}/>
                </Row>
                <Row label="Mode">
                    <Radio value={m.collections.mode} setValue={(v) => set({collections: {...m.collections, mode: v as any}})} opts={[{value: "always", label: "Always"}, {value: "if2plus", label: "Only if 2+"}]}/>
                </Row>
                <Row label="Naming style">
                    <Radio value={m.collections.naming} setValue={(v) => set({collections: {...m.collections, naming: v as any}})} opts={[
                        {value: "original", label: "Original"},
                        {value: "prefix_", label: "Prefix _"},
                        {value: "prefix_collection", label: "Prefix 'Collection - '"},
                        {value: "suffix_collection", label: "Suffix '(Collection)'"},
                    ]}/>
                </Row>
            </Section>

            <Section title="Folders & Ordering">
                <Row label="Chronological prefix">
                    <Radio value={m.chronologicalPrefix} setValue={(v) => set({chronologicalPrefix: v as any})} opts={[{value: "none", label: "None"}, {value: "year", label: "By year"}, {value: "collection_order", label: "By collection order"}]}/>
                </Row>
                <Row label="Folder structure">
                    <Radio value={m.folderStructure} setValue={(v) => set({folderStructure: v as any})} opts={[{value: "none", label: "None"}, {value: "alpha", label: "Alphabetical"}, {value: "alpha_ranges", label: "Alphabet ranges"}, {value: "genre", label: "By Genre"}, {value: "year_decade", label: "By Year/Decade"}]}/>
                </Row>
                <Row label="Put every movie in its own folder">
                    <input type="checkbox" checked={m.ownFolderPerMovie} onChange={(e) => set({ownFolderPerMovie: e.target.checked})}/>
                </Row>
            </Section>

            <Section title="Editions & Versions">
                <Row label="Edition handling">
                    <Radio value={m.editions.mode} setValue={(v) => set({editions: {...m.editions, mode: v as any}})} opts={[
                        {value: "preserve", label: "Preserve Plex tokens ({edition-extended})"},
                        {value: "expand", label: "Expand to human-readable (- Extended Edition)"},
                        {value: "both", label: "Keep both (- Extended Edition {edition-extended})"},
                        {value: "none", label: "None"},
                    ]}/>
                </Row>
                <Row label="Create editions from file names">
                    <input type="checkbox" checked={m.editions.createFromFilenames} onChange={(e) => set({editions: {...m.editions, createFromFilenames: e.target.checked}})}/>
                </Row>
                <Row label="Create multiple edition tags (if applicable)">
                    <input
                        type="checkbox"
                        checked={m.editions.createMultipleTags}
                        disabled={!m.editions.createFromFilenames}
                        onChange={(e) => set({editions: {...m.editions, createMultipleTags: e.target.checked}})}
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
                <Row label="IDs">
                    <Radio value={m.ids} setValue={(v) => set({ids: v as any})} opts={[{value: "none", label: "Do not include"}, {value: "preserve", label: "Preserve existing"}, {value: "auto_append_all", label: "Auto-append all"}]}/>
                </Row>
                <Row label="Special cases">
                    <label><input type="checkbox" checked={m.specials.moveExtras} onChange={(e) => set({specials: {...m.specials, moveExtras: e.target.checked}})}/> Move extras to Extras/</label>
                    <label style={{marginLeft: 12}}><input type="checkbox" checked={m.specials.markISO} onChange={(e) => set({specials: {...m.specials, markISO: e.target.checked}})}/> Mark ISO with [ISO]</label>
                </Row>
            </Section>
        </>
    );
}

function TV({s, onChange}: { s: Settings; onChange: (v: Settings["tv"]) => void }) {
    const t = s.tv;
    const set = (patch: Partial<typeof t>) => onChange({...t, ...patch});
    return (
        <>
            <Section title="Structure">
                <Row label="Always put episodes in Season folders">
                    <input type="checkbox" checked={t.seasonFolders} onChange={(e) => set({seasonFolders: e.target.checked})}/>
                </Row>
                <Row label="Treat mini-series as TV shows">
                    <input type="checkbox" checked={t.treatMiniSeriesAsTv} onChange={(e) => set({treatMiniSeriesAsTv: e.target.checked})}/>
                </Row>
            </Section>
            <Section title="Detection">
                <Row label="Detect Extended / Uncut / Director’s Cut episodes">
                    <input type="checkbox" checked={t.detectCuts} onChange={(e) => set({detectCuts: e.target.checked})}/>
                </Row>
                <Row label="Detect OVA / Specials → Suggest Season 00">
                    <input type="checkbox" checked={t.detectOVAsSeason00} onChange={(e) => set({detectOVAsSeason00: e.target.checked})}/>
                </Row>
                <Row label="Normalize multi-episode files (E01-02 → E01E02)">
                    <input type="checkbox" checked={t.normalizeMultiEpisode} onChange={(e) => set({normalizeMultiEpisode: e.target.checked})}/>
                </Row>
                <Row label="Warn if episode count doesn’t match Plex DB">
                    <input type="checkbox" checked={t.warnEpisodeCountMismatch} onChange={(e) => set({warnEpisodeCountMismatch: e.target.checked})}/>
                </Row>
            </Section>
            <Section title="IDs">
                <Row label="Include IDs in filenames">
                    <Radio value={t.ids} setValue={(v) => set({ids: v as any})} opts={[
                        {value: "none", label: "Do not include"},
                        {value: "preserve", label: "Preserve existing"},
                        {value: "auto_append_all", label: "Auto-append all"},
                    ]}/>
                </Row>
            </Section>
        </>
    );
}

function Music({s, onChange}: { s: Settings; onChange: (v: Settings["music"]) => void }) {
    const m = s.music;
    const set = (patch: Partial<typeof m>) => onChange({...m, ...patch});
    return (
        <>
            <Section title="Organization">
                <Row label="Artist / Album / Track - Title format">
                    <input type="checkbox" checked={m.formatAAT} onChange={(e) => set({formatAAT: e.target.checked})}/>
                </Row>
                <Row label="Put tracks into disc subfolders if multi-disc">
                    <input type="checkbox" checked={m.discSubfolders} onChange={(e) => set({discSubfolders: e.target.checked})}/>
                </Row>
                <Row label="Normalize track numbering (01-Track → 01 - Track)">
                    <input type="checkbox" checked={m.normalizeTrackNumbers} onChange={(e) => set({normalizeTrackNumbers: e.target.checked})}/>
                </Row>
            </Section>
        </>
    );
}

function Misc({s, onChange}: { s: Settings; onChange: (v: Settings["misc"]) => void }) {
    const m = s.misc;
    const set = (patch: Partial<typeof m>) => onChange({...m, ...patch});
    return (
        <>
            <Section title="Unmatched Files">
                <Radio value={m.unmatchedHandling} setValue={(v) => set({unmatchedHandling: v as any})} opts={[
                    {value: "leave", label: "Leave in place"},
                    {value: "move_unmatched", label: "Move to Unmatched/"},
                    {value: "move_extras", label: "Move to Extras/"},
                    {value: "delete", label: "Delete (⚠ confirm)"},
                ]}/>
            </Section>
            <Section title="Non-Media Files">
                <Radio value={m.nonMediaHandling} setValue={(v) => set({nonMediaHandling: v as any})} opts={[
                    {value: "skip", label: "Skip"},
                    {value: "move_extras", label: "Move to Extras/"},
                    {value: "delete", label: "Delete (⚠ confirm)"},
                ]}/>
            </Section>
            <Section title="Advanced Warnings">
                <Row label="Path length check">
                    <input type="checkbox" checked={m.warnings.pathLength} onChange={(e) => set({warnings: {...m.warnings, pathLength: e.target.checked}})}/>
                </Row>
                <Row label="Reserved names check">
                    <input type="checkbox" checked={m.warnings.reservedNames} onChange={(e) => set({warnings: {...m.warnings, reservedNames: e.target.checked}})}/>
                </Row>
                <Row label="Non-media detection (.txt, .nfo, .jpg)">
                    <input type="checkbox" checked={m.warnings.nonMediaDetection} onChange={(e) => set({warnings: {...m.warnings, nonMediaDetection: e.target.checked}})}/>
                </Row>
            </Section>
        </>
    );
}

