import React, {useEffect, useState} from "react";
import Select from "../components/Select";
import Toggle from "../components/Toggle";
import Radio from "../components/Radio";
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
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
    const [dragStartModalPos, setDragStartModalPos] = useState({ x: 0, y: 0 });
    const [justFinishedDragging, setJustFinishedDragging] = useState(false);

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
        // Update global settings in real-time for immediate preview updates
        updateSettings(next);
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

    const handleClose = (e?: React.MouseEvent) => {
        // Prevent default behavior and event propagation
        e?.preventDefault();
        e?.stopPropagation();

        if (hasChanges) {
            setShowConfirmDialog(true);
        } else {
            onClose();
        }
    };

    const handleConfirmClose = () => {
        setShowConfirmDialog(false);
        onClose();
    };

    const handleCancelClose = () => {
        setShowConfirmDialog(false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as Element;
        if (target.closest('.settings-header') && !target.closest('button')) {
            setDragStartPos({ x: e.clientX, y: e.clientY });
            // Don't start dragging immediately, wait for mouse move
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging && dragStartPos.x !== 0) {
            // Check if mouse has moved enough to start dragging (minimum 3px for more responsive feel)
            const deltaX = Math.abs(e.clientX - dragStartPos.x);
            const deltaY = Math.abs(e.clientY - dragStartPos.y);
            if (deltaX > 3 || deltaY > 3) {
                setIsDragging(true);
                // Get current modal transform as the starting position
                const modalElement = document.querySelector('.settings-modal-content') as HTMLElement;
                if (modalElement) {
                    const computedStyle = getComputedStyle(modalElement);
                    const transform = computedStyle.transform;

                    if (transform && transform !== 'none') {
                        const matrix = new DOMMatrix(transform);
                        setDragStartModalPos({ x: matrix.m41, y: matrix.m42 });
                    } else {
                        setDragStartModalPos({ x: 0, y: 0 });
                    }
                }
            }
        } else if (isDragging) {
            // Calculate new position based on mouse movement from start
            const deltaX = e.clientX - dragStartPos.x;
            const deltaY = e.clientY - dragStartPos.y;

            const newX = dragStartModalPos.x + deltaX;
            const newY = dragStartModalPos.y + deltaY;

            // Keep modal within viewport bounds (allow dragging off-screen slightly)
            const modalElement = document.querySelector('.settings-modal-content') as HTMLElement;
            if (modalElement) {
                const modalRect = modalElement.getBoundingClientRect();
                const minX = -modalRect.width + 100; // Allow dragging 100px off left edge
                const maxX = window.innerWidth - 100; // Allow dragging 100px off right edge
                const minY = -modalRect.height + 100; // Allow dragging 100px off top edge
                const maxY = window.innerHeight - 100; // Allow dragging 100px off bottom edge

                setModalPosition({
                    x: Math.max(minX, Math.min(newX, maxX)),
                    y: Math.max(minY, Math.min(newY, maxY))
                });
            }
        }
    };

    const handleMouseUp = (e?: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
        // This handler is mainly for the modal content onMouseUp
        // The global mouseup handler in useEffect will handle the state cleanup
        if (isDragging) {
            // If we're still dragging when this handler runs, the global handler might not have run yet
            // So we need to ensure cleanup happens
            setIsDragging(false);
            setDragStartPos({ x: 0, y: 0 });
            setDragStartModalPos({ x: 0, y: 0 });
            setJustFinishedDragging(true);
            setTimeout(() => setJustFinishedDragging(false), 100);
        }
    };

    // Add global mouse event listeners for dragging
    useEffect(() => {
        if (isDragging || dragStartPos.x !== 0) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mouseup', handleMouseUp); // Also listen on window
            if (isDragging) {
                document.body.style.userSelect = 'none'; // Prevent text selection during drag
            }
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('mouseup', handleMouseUp);
                document.body.style.userSelect = ''; // Restore text selection
            };
        }
    }, [isDragging, dragStartPos, dragStartModalPos, justFinishedDragging]);

    // Ensure drag state is always cleaned up on mouse release
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            const needsCleanup = isDragging || dragStartPos.x !== 0;
            if (needsCleanup) {
                setIsDragging(false);
                setDragStartPos({ x: 0, y: 0 });
                setDragStartModalPos({ x: 0, y: 0 });
                setJustFinishedDragging(true);
                setTimeout(() => setJustFinishedDragging(false), 100);
            }
        };

        document.addEventListener('mouseup', handleGlobalMouseUp, true); // Use capture phase
        window.addEventListener('mouseup', handleGlobalMouseUp, true);

        return () => {
            document.removeEventListener('mouseup', handleGlobalMouseUp, true);
            window.removeEventListener('mouseup', handleGlobalMouseUp, true);
        };
    }, [isDragging, dragStartPos, dragStartModalPos]);

    // Reset modal position when it opens
    useEffect(() => {
        setModalPosition({ x: 0, y: 0 });
        setIsDragging(false);
        setDragStartPos({ x: 0, y: 0 });
        setDragStartModalPos({ x: 0, y: 0 });
        setJustFinishedDragging(false);
    }, [settings]); // Reset when settings change (modal reopens)

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => (!isDragging && !justFinishedDragging && dragStartPos.x === 0) && handleClose(e)} style={{ zIndex: 9999 }}>
                <div
                    className="settings-modal-content bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl"
                    style={{
                        transform: modalPosition.x !== 0 || modalPosition.y !== 0 ? `translate(${modalPosition.x}px, ${modalPosition.y}px)` : undefined,
                        cursor: isDragging ? 'grabbing' : 'default'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseUp={handleMouseUp}
                >
                    <div
                        className="settings-header flex items-center justify-between p-6 border-b border-neutral-800 cursor-grab active:cursor-grabbing"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                        <h1 className="text-xl font-semibold text-neutral-100">Settings</h1>
                        <button onClick={(e) => handleClose(e)} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Close (unsaved changes will be lost)">
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
                                        onClick={(e) => handleClose(e)}
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

            {/* Custom confirm dialog for unsaved changes */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10000 }} onClick={handleCancelClose}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 shadow-2xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-neutral-100">Unsaved Changes</h3>
                        </div>
                        <p className="text-neutral-300 mb-6">
                            You have unsaved changes. Are you sure you want to close without saving?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelClose}
                                className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmClose}
                                className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded"
                            >
                                Close Without Saving
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                    value={g.authPersistence || "none"}
                    onChange={(v) => set({authPersistence: v})}
                    options={[
                        { value: "none", label: "Don’t remember (most secure)" },
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

function Movies({s, onChange, onConfigureParsers}: { s: Settings; onChange: (v: Settings["movies"]) => void; onConfigureParsers?: () => void }) {
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

                                                // Apply mode logic
                                                if (m.collections.mode === "if2plus") {
                                                    // For "if2plus", we'd need to check if there are 2+ movies in collection
                                                    // For this preview, assume Star Wars has 2+ and others don't
                                                    const shouldUseCollection = movie.collection === "Star Wars Collection";
                                                    if (shouldUseCollection) {
                                                        result = `${collectionFolder}/${movie.title} (${movie.year}).mkv`;
                                                    } else {
                                                        result = `${movie.title} (${movie.year}).mkv`;
                                                    }
                                                } else { // always
                                                    result = `${collectionFolder}/${movie.title} (${movie.year}).mkv`;
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
                <Row label="Put every movie in its own folder">
                    <Toggle checked={m.ownFolderPerMovie} onChange={(checked) => set({ownFolderPerMovie: checked})}/>
                </Row>
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
                <Row label="Normalize multi-episode files (E01-02 → E01E02)">
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
                                                dynamicTemplate = dynamicTemplate.replace(/\{thetvdb[^}]*\}/g, '');
                                                dynamicTemplate = dynamicTemplate.replace(/\{tmdb[^}]*\}/g, '');
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
                                                episode = ep.episode; // Keep first episode number
                                                title = `${title} (Episodes ${ep.episode}-2)`;
                                            }

                                            let result = dynamicTemplate
                                                .replace(/\{showTitle\}/g, ep.showTitle)
                                                .replace(/\{season(?::(\d+))?\}/g, (match, padding) => {
                                                    const pad = padding ? parseInt(padding) : 2;
                                                    return String(season).padStart(pad, '0');
                                                })
                                                .replace(/\{episode(?::(\d+))?\}/g, (match, padding) => {
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
                    <Toggle checked={m.formatAAT} onChange={(checked) => set({formatAAT: checked})}/>
                </Row>
                <Row label="Put tracks into disc subfolders if multi-disc">
                    <Toggle checked={m.discSubfolders} onChange={(checked) => set({discSubfolders: checked})}/>
                </Row>
                <Row label="Normalize track numbering (01-Track → 01 - Track)">
                    <Toggle checked={m.normalizeTrackNumbers} onChange={(checked) => set({normalizeTrackNumbers: checked})}/>
                </Row>
            </Section>

            <Section title="Music Organization Preview">
                <div className="space-y-2 text-sm">
                    <div className="text-neutral-300 font-medium mb-3">How music files are organized:</div>
                    <div className="grid gap-2 font-mono text-xs">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-neutral-400 mb-1">Sample tracks:</div>
                                <div className="space-y-1 text-neutral-300">
                                    <div>Daft Punk - Random Access Memories - 01 - Give Life Back to Music.mp3</div>
                                    <div>Miles Davis - Kind of Blue - 02 - So What.mp3</div>
                                    <div>Radiohead - OK Computer - 1-03 - Let Down.mp3</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 mb-1">Organized as:</div>
                                <div className="space-y-1 text-cyan-300">
                                    {(() => {
                                        const examples = [
                                            { artist: "Daft Punk", album: "Random Access Memories", track: 1, title: "Give Life Back to Music", disc: 1 },
                                            { artist: "Miles Davis", album: "Kind of Blue", track: 2, title: "So What", disc: 1 },
                                            { artist: "Radiohead", album: "OK Computer", track: 3, title: "Let Down", disc: 1 },
                                        ];

                                        return examples.map((track, i) => {
                                            let path = "";

                                            if (m.formatAAT) {
                                                // Artist/Album/Track - Title format
                                                const trackNum = m.normalizeTrackNumbers
                                                    ? `${String(track.track).padStart(2, '0')} - ${track.title}`
                                                    : track.title;
                                                path = `${track.artist}/${track.album}/${trackNum}.mp3`;

                                                // Add disc subfolders if enabled and multi-disc
                                                if (m.discSubfolders && track.disc > 1) {
                                                    path = `${track.artist}/${track.album}/Disc ${track.disc}/${trackNum}.mp3`;
                                                }
                                            } else {
                                                // Simple format
                                                const trackNum = m.normalizeTrackNumbers
                                                    ? `${String(track.track).padStart(2, '0')} - ${track.title}`
                                                    : track.title;
                                                path = `${trackNum}.mp3`;
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
        </>
    );
}

function Misc({s, onChange}: { s: Settings; onChange: (v: Settings["misc"]) => void }) {
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

