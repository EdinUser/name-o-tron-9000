import React, {useEffect, useState} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {type EncodingMode, loadSettings, saveSettings, type Settings} from "../state/settings";
import {IconArrowBack, IconHome} from "../components/icons";

type Props = { onBack: () => void };

type TabKey = "general" | "movies" | "tv" | "music" | "misc";

export default function SettingsPage({onBack}: Props) {
    const [tab, setTab] = useState<TabKey>("general");
    const [s, setS] = useState<Settings>(() => loadSettings());
    useEffect(() => { try { getCurrentWindow().setTitle("Name-o-Tron 9000 — Settings"); } catch {} }, []);

    function update<K extends keyof Settings>(k: K, v: Settings[K]) {
        const next = {...s, [k]: v} as Settings;
        setS(next);
        saveSettings(next);
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100">
            <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconArrowBack className="h-5 w-5"/>
                            Back
                        </button>
                        <button onClick={() => (window as any).__goto_home?.()} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
                            <IconHome className="h-5 w-5"/>
                            Home
                        </button>
                        <h1 className="ml-2 text-lg font-semibold">Settings</h1>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-6 py-6">
                <Tabs tab={tab} setTab={setTab}/>

                {tab === "general" && <General s={s} onChange={(v) => update("general", v)}/>}
                {tab === "movies" && <Movies s={s} onChange={(v) => update("movies", v)}/>}
                {tab === "tv" && <TV s={s} onChange={(v) => update("tv", v)}/>}
                {tab === "music" && <Music s={s} onChange={(v) => update("music", v)}/>}
                {tab === "misc" && <Misc s={s} onChange={(v) => update("misc", v)}/>}
            </div>
        </main>
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

    return (
        <>
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
        </>
    );
}

function Movies({s, onChange}: { s: Settings; onChange: (v: Settings["movies"]) => void }) {
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
                <Row label="Preserve Plex edition tokens ({edition-extended})">
                    <input type="checkbox" checked={m.editions.preserveTokens} onChange={(e) => set({editions: {...m.editions, preserveTokens: e.target.checked}})}/>
                </Row>
                <Row label="Expand to human-readable (- Extended Edition)">
                    <input type="checkbox" checked={m.editions.expandHuman} onChange={(e) => set({editions: {...m.editions, expandHuman: e.target.checked}})}/>
                </Row>
                <Row label="Keep both (Edition + token)">
                    <input type="checkbox" checked={m.editions.keepBoth} onChange={(e) => set({editions: {...m.editions, keepBoth: e.target.checked}})}/>
                </Row>
                <Row label="Detect editions from filenames">
                    <input type="checkbox" checked={m.editions.detectFromFilenames} onChange={(e) => set({editions: {...m.editions, detectFromFilenames: e.target.checked}})}/>
                </Row>
                <Row label="Append version name if multiple exist">
                    <input type="checkbox" checked={m.versions.appendVersionIfMultiple} onChange={(e) => set({versions: {appendVersionIfMultiple: e.target.checked}})}/>
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
