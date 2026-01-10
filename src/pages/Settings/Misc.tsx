import React, { useState, useCallback } from "react";
import Select from "../../components/Select";
import Toggle from "../../components/Toggle";
import Radio from "../../components/Radio";
import { type Settings } from "../../state/settings";
import { clearAllShowMappingCaches, getCacheDirectoryPath } from "../../utils/cache";

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
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [cachePathModal, setCachePathModal] = useState<{
        success: boolean;
        path?: string;
        error?: string;
    } | null>(null);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [cacheClearResult, setCacheClearResult] = useState<{total_files_found: number, files_removed: string[], cache_directory_exists: boolean} | null>(null);

    const handleResetCache = useCallback(async () => {
        try {
            console.log("🔄 Starting cache clearing process...");
            const result = await clearAllShowMappingCaches();
            if (!result) {
                console.error("❌ Cache clearing failed (no result returned)");
                alert("Failed to clear cache. Check console for details.");
                return;
            }
            console.log("✅ Cache clearing completed successfully");
            setCacheClearResult(result);
            setShowSuccessDialog(true);
            setShowConfirmDialog(false);
        } catch (error) {
            console.error("❌ Cache clear error:", error);
            alert("Failed to clear cache. Check console for details.");
        }
    }, []);

    const handleShowCachePath = useCallback(async () => {
        try {
            const cachePath = await getCacheDirectoryPath();
            console.log("📁 Cache directory path:", cachePath);
            setCachePathModal({
                success: true,
                path: cachePath
            });
        } catch (error) {
            console.error("❌ Failed to get cache path:", error);
            setCachePathModal({
                success: false,
                error: String(error)
            });
        }
    }, []);

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

            <Section title="Cache Management">
                <div className="space-y-3">
                    <div className="text-sm text-neutral-300">
                        Clear cached data for TV show libraries. This will force the app to re-analyze show locations on next load.
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-neutral-200">Reset cached libraries</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowConfirmDialog(true)}
                                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                                Reset Cache
                            </button>
                            <button
                                onClick={handleShowCachePath}
                                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Show Cache Path
                            </button>
                        </div>
                    </div>
                </div>
            </Section>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                                <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">Reset Cache</h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <p className="mb-6 text-neutral-200">
                            Are you sure you want to reset all cached library data? This will require re-analyzing show locations on next load.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetCache}
                                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Dialog */}
            {showSuccessDialog && cacheClearResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                                <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">Cache Cleared</h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <div className="mb-6 space-y-3 text-neutral-200">
                            <div className="text-sm">
                                <span className="font-medium">Cache directory: </span>
                                <span className={`px-2 py-1 rounded text-xs ${cacheClearResult.cache_directory_exists ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    {cacheClearResult.cache_directory_exists ? 'Exists' : 'Not found'}
                                </span>
                            </div>

                            <div className="text-sm">
                                <span className="font-medium">Total files found: </span>
                                <span className="text-cyan-400">{cacheClearResult.total_files_found}</span>
                            </div>

                            <div className="text-sm">
                                <span className="font-medium">Files removed: </span>
                                <span className="text-green-400">{cacheClearResult.files_removed.length}</span>
                            </div>

                            {cacheClearResult.files_removed.length > 0 && (
                                <div className="mt-3">
                                    <div className="text-sm font-medium text-neutral-300 mb-2">Removed files:</div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {cacheClearResult.files_removed.map((file, index) => (
                                            <div key={index} className="text-xs font-mono bg-neutral-800 px-2 py-1 rounded text-neutral-300">
                                                {file}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowSuccessDialog(false); setCacheClearResult(null); }}
                                className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cache Path Modal */}
            {cachePathModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                cachePathModal.success ? 'bg-blue-500/20' : 'bg-red-500/20'
                            }`}>
                                {cachePathModal.success ? (
                                    <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-100">
                                    {cachePathModal.success ? "Cache Directory" : "Error"}
                                </h3>
                                <p className="text-sm text-neutral-300">name-o-tron-9000</p>
                            </div>
                        </div>

                        <div className="mb-6 text-neutral-200">
                            {cachePathModal.success && cachePathModal.path ? (
                                <div>
                                    <div className="text-sm mb-2">Cache directory location:</div>
                                    <div className="text-xs font-mono bg-neutral-800 px-3 py-2 rounded text-neutral-300 break-all">
                                        {cachePathModal.path}
                                    </div>
                                    <div className="mt-3 text-xs text-neutral-400">
                                        This directory contains cached TV show mapping data and image thumbnails.
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="text-sm mb-2">Failed to get cache directory:</div>
                                    <div className="text-sm text-red-300">
                                        {cachePathModal.error || "Unknown error occurred"}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            {cachePathModal.success && cachePathModal.path && (
                                <button
                                    onClick={async () => {
                                        try {
                                            await import("@tauri-apps/plugin-opener").then(({ revealItemInDir }) => revealItemInDir(cachePathModal.path!));
                                        } catch (error) {
                                            console.error('Failed to open folder:', error);
                                        }
                                    }}
                                    className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                                >
                                    Open Folder
                                </button>
                            )}
                            <button
                                onClick={() => setCachePathModal(null)}
                                className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
