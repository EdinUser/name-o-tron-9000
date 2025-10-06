import React, {useEffect, useState, useCallback} from "react";
import { invoke } from "@tauri-apps/api/core";
import {useSettings, type Settings} from "../../state/settings";
import {useTheme} from "../../state/theme";
import { save } from '@tauri-apps/plugin-dialog';
import { type Props, type TabKey } from "./types";
import SettingsTemplate from "./SettingsTemplate";

export default function SettingsContainer({onClose}: Props) {
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
        <SettingsTemplate
            tab={tab}
            localSettings={localSettings}
            hasChanges={hasChanges}
            isSaving={isSaving}
            isEditionParsersModalOpen={isEditionParsersModalOpen}
            showConfirmDialog={showConfirmDialog}
            isDragging={isDragging}
            modalPosition={modalPosition}
            resolvedTheme={resolvedTheme}
            onSetTab={setTab}
            onUpdate={update}
            onSaveSettingsAndClose={saveSettingsAndClose}
            onExportSettings={exportSettings}
            onImportSettings={importSettings}
            onHandleClose={handleClose}
            onHandleConfirmClose={handleConfirmClose}
            onHandleCancelClose={handleCancelClose}
            onHandleMouseDown={handleMouseDown}
            onHandleMouseUp={handleMouseUp}
            onSetIsEditionParsersModalOpen={setIsEditionParsersModalOpen}
            onToggleTheme={toggleTheme}
        />
    );
}
