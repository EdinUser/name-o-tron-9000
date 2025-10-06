import React, {useEffect, useState, useCallback} from "react";
import { invoke } from "@tauri-apps/api/core";
import {useSettings, type Settings} from "../state/settings";
import {useTheme} from "../state/theme";
import { save } from '@tauri-apps/plugin-dialog';
import {IconSun, IconMoon} from "../components/icons";
import EditionParsersModal from "../components/EditionParsersModal";
import { type Props, type TabKey } from "./Settings/types";
import { General } from "./Settings/General";
import { Movies } from "./Settings/Movies";
import { TV } from "./Settings/TV";
import { Music } from "./Settings/Music";
import { Misc } from "./Settings/Misc";

export default function SettingsModal({onClose}: Props) {
    const { settings, updateSettings } = useSettings();
    const { resolvedTheme, toggleTheme } = useTheme();
    const [tab, setTab] = useState<TabKey>(() => {
        try { return (localStorage.getItem("nameotron.settings.lastTab") as TabKey) || "general"; } catch { return "general"; }
    });
    const [localSettings, setLocalSettings] = useState<Settings>(settings);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditionParsersModalOpen, setIsEditionParsersModalOpen] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
    const [dragStartModalPos, setDragStartModalPos] = useState({ x: 0, y: 0 });
    const [justFinishedDragging, setJustFinishedDragging] = useState(false);
    const [originalBodyOverflow, setOriginalBodyOverflow] = useState<string>("");

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

    async function exportSettings() {
        try {
            const settingsJson = JSON.stringify(localSettings, null, 2);

            // Use Tauri's native save dialog
            const filePath = await save({
                defaultPath: 'name-o-tron-9000-settings.json',
                filters: [{
                    name: 'JSON',
                    extensions: ['json']
                }]
            });

            if (filePath) {
                // Write the file using our new Tauri command
                await invoke('write_text_file', {
                    path: filePath,
                    contents: settingsJson
                });

                alert("Settings exported successfully!");
                console.log("Settings exported to file:", filePath);
            }
            // If user cancelled, filePath will be null - do nothing
        } catch (error) {
            console.error("Failed to export settings:", error);
            alert("Failed to export settings. Please try again.");
        }
    }

    async function importSettings() {
        try {
            // Create file input element
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';

            // Handle file selection
            input.onchange = async (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const importedSettings = JSON.parse(text);

                    // Merge with current settings (shallow merge for safety)
                    const mergedSettings = { ...localSettings, ...importedSettings };
                    setLocalSettings(mergedSettings);
                    setHasChanges(true);
                    updateSettings(mergedSettings);

                    alert("Settings imported successfully!");
                    console.log("Settings imported successfully");
                } catch (parseError) {
                    alert("Failed to parse settings JSON. Please check the file format and try again.");
                    console.error("Failed to parse imported settings:", parseError);
                }
            };

            // Trigger file dialog
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        } catch (error) {
            console.error("Failed to import settings:", error);
            alert("Failed to import settings. Please try again.");
        }
    }

    const handleClose = useCallback((e?: React.MouseEvent) => {
        // Prevent default behavior and event propagation
        e?.preventDefault();
        e?.stopPropagation();

        if (hasChanges) {
            setShowConfirmDialog(true);
        } else {
            onClose();
        }
    }, [hasChanges, onClose]);

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

    const handleMouseUp = () => {
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

    // Body scroll lock when modal opens
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        setOriginalBodyOverflow(originalOverflow);

        // Prevent body scroll when modal is open
        document.body.style.overflow = "hidden";

        // Cleanup function to restore original overflow
        return () => {
            document.body.style.overflow = originalBodyOverflow;
        };
    }, []); // Run once when modal mounts

    // Escape key handler to close modal
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [handleClose]); // Run when handleClose changes

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ zIndex: 9999, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
                <div
                    className="settings-modal-content bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
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
                        <div className="flex items-center gap-2">
                            <button onClick={toggleTheme} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Toggle theme">
                                {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
                            </button>
                            <button onClick={(e) => handleClose(e)} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Close (unsaved changes will be lost)">
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex flex-col max-h-[calc(90vh-140px)]">
                        <div className="px-6 pt-4">
                            <Tabs tab={tab} setTab={setTab}/>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-6">
                            {tab === "general" && <General s={localSettings} onChange={(v) => update("general", v)} />}
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
                                <div className="flex gap-3 justify-between">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={exportSettings}
                                            className="px-3 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                            title="Export settings to JSON file"
                                        >
                                            Export
                                        </button>
                                        <button
                                            onClick={importSettings}
                                            className="px-3 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                            title="Import settings from JSON file"
                                        >
                                            Import
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
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
            </div>

            {/* Custom confirm dialog for unsaved changes */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10000 }} onClick={handleCancelClose}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 shadow-2xl max-w-md w-full mx-4" style={{ backgroundColor: 'var(--bg-secondary)' }} onClick={(e) => e.stopPropagation()}>
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


