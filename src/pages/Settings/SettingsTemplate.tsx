import React from "react";
import {IconSun, IconMoon} from "../../components/icons";
import EditionParsersModal from "../../components/EditionParsersModal";
import { type TabKey } from "./types";
import { type Settings } from "../../state/settings";
import { General } from "./General";
import { Movies } from "./Movies";
import { TV } from "./TV";
import { Music } from "./Music";
import { Misc } from "./Misc";

type TemplateProps = {
    tab: TabKey;
    localSettings: Settings;
    hasChanges: boolean;
    isSaving: boolean;
    isEditionParsersModalOpen: boolean;
    showConfirmDialog: boolean;
    isDragging: boolean;
    modalPosition: { x: number; y: number };
    resolvedTheme: string;
    onSetTab: (tab: TabKey) => void;
    onUpdate: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
    onSaveSettingsAndClose: () => void;
    onExportSettings: () => void;
    onImportSettings: () => void;
    onHandleClose: (e?: React.MouseEvent) => void;
    onHandleConfirmClose: () => void;
    onHandleCancelClose: () => void;
    onHandleMouseDown: (e: React.MouseEvent) => void;
    onHandleMouseUp: () => void;
    onSetIsEditionParsersModalOpen: (open: boolean) => void;
    onToggleTheme: () => void;
};

export default function SettingsTemplate({
    tab,
    localSettings,
    hasChanges,
    isSaving,
    isEditionParsersModalOpen,
    showConfirmDialog,
    isDragging,
    modalPosition,
    resolvedTheme,
    onSetTab,
    onUpdate,
    onSaveSettingsAndClose,
    onExportSettings,
    onImportSettings,
    onHandleClose,
    onHandleConfirmClose,
    onHandleCancelClose,
    onHandleMouseDown,
    onHandleMouseUp,
    onSetIsEditionParsersModalOpen,
    onToggleTheme,
}: TemplateProps) {
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
                    onMouseUp={onHandleMouseUp}
                >
                    <div
                        className="settings-header flex items-center justify-between p-6 border-b border-neutral-800 cursor-grab active:cursor-grabbing"
                        onMouseDown={onHandleMouseDown}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                        <h1 className="text-xl font-semibold text-neutral-100">Settings</h1>
                        <div className="flex items-center gap-2">
                            <button onClick={onToggleTheme} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Toggle theme">
                                {resolvedTheme === 'dark' ? <IconSun className="h-5 w-5"/> : <IconMoon className="h-5 w-5"/>}
                            </button>
                            <button onClick={(e) => onHandleClose(e)} className="text-neutral-400 hover:text-neutral-200 transition-colors" title="Close (unsaved changes will be lost)">
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex flex-col max-h-[calc(90vh-140px)]">
                        <div className="px-6 pt-4">
                            <Tabs tab={tab} setTab={onSetTab}/>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-6">
                            {tab === "general" && <General s={localSettings} onChange={(v) => onUpdate("general", v)} />}
                            {tab === "movies" && <Movies s={localSettings} onChange={(v) => onUpdate("movies", v)} onConfigureParsers={() => onSetIsEditionParsersModalOpen(true)}/>}
                            {tab === "tv" && <TV s={localSettings} onChange={(v) => onUpdate("tv", v)}/>}
                            {tab === "music" && <Music s={localSettings} onChange={(v) => onUpdate("music", v)}/>}
                            {tab === "misc" && <Misc s={localSettings} onChange={(v) => onUpdate("misc", v)}/>}
                        </div>

                        <div className="px-6 pb-6 border-t border-neutral-800">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-neutral-400">
                                    {hasChanges ? "You have unsaved changes" : "Settings are up to date"}
                                </div>
                                <div className="flex gap-3 justify-between">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={onExportSettings}
                                            className="px-3 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                            title="Export settings to JSON file"
                                        >
                                            Export
                                        </button>
                                        <button
                                            onClick={onImportSettings}
                                            className="px-3 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                            title="Import settings from JSON file"
                                        >
                                            Import
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => onHandleClose(e)}
                                            className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                                            disabled={isSaving}
                                        >
                                            {hasChanges ? "Cancel" : "Close"}
                                        </button>
                                        <button
                                            onClick={onSaveSettingsAndClose}
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10000 }} onClick={onHandleCancelClose}>
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
                                onClick={onHandleCancelClose}
                                className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onHandleConfirmClose}
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
                onClose={() => onSetIsEditionParsersModalOpen(false)}
                parsers={localSettings.movies.editions.parsers}
                onChange={(parsers) => onUpdate("movies", {...localSettings.movies, editions: {...localSettings.movies.editions, parsers}})}
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
