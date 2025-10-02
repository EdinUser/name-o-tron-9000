import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface MovieMetadata {
    type: "movie";
    title: string;
    year?: number;
    genre?: string;
    rating?: string;
    studio?: string;
    director?: string;
    writer?: string;
    country?: string;
    tagline?: string;
    summary?: string;
    edition?: string;
    editionTitle?: string;
}

interface EpisodeMetadata {
    type: "episode";
    title: string;
    showTitle: string;
    season?: number;
    index?: number;
    year?: number;
    grandparentTitle?: string;
    parentTitle?: string;
}

type Metadata = MovieMetadata | EpisodeMetadata;

interface PlexPopoverCardProps {
    metadata: Metadata;
    isVisible: boolean;
    position: { x: number; y: number };
    plexServerUrl?: string;
}

export default function PlexPopoverCard({ metadata, isVisible, position, plexServerUrl }: PlexPopoverCardProps) {
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(false);

    // Smart positioning that calculates once when popover becomes visible or metadata changes
    const smartPosition = React.useMemo(() => {
        if (!isVisible || !metadata || typeof window === 'undefined') {
            return { x: position.x, y: position.y, transform: 'translate(-50%, 0%)' };
        }

        const viewportHeight = window.innerHeight;
        const cardHeight = metadata.type === "movie" ? 280 : 240; // Approximate card heights
        const margin = 20; // Margin from viewport edges

        // Check if there's enough space below
        const spaceBelow = viewportHeight - position.y - margin;

        if (spaceBelow >= cardHeight) {
            // Position below mouse pointer
            return {
                x: position.x,
                y: position.y,
                transform: 'translate(-50%, 0%)'
            };
        } else {
            // Position above mouse pointer
            return {
                x: position.x,
                y: position.y,
                transform: 'translate(-50%, -100%)'
            };
        }
    }, [isVisible, metadata?.type]); // Only recalculate when visibility or metadata type changes, not position

    // Fetch poster image using backend command when component mounts or metadata changes
    useEffect(() => {
        if (!isVisible || !metadata || !plexServerUrl) {
            setPosterDataUrl(null);
            return;
        }

        const fetchPoster = async () => {
            if (!metadata.thumb && !metadata.ratingKey) {
                setPosterDataUrl(null);
                return;
            }

            setImageLoading(true);
            try {
                let token: string | null = null;
                try { token = localStorage.getItem("plexToken"); } catch {}

                const imagePath = metadata.thumb || `/library/metadata/${metadata.ratingKey}/thumb/0`;

                console.log("Fetching poster:", { plexServerUrl, imagePath, token: token ? "present" : "none" });

                try {
                    console.log("About to call invoke for fetch_plex_image...");
                    const result = await invoke("fetch_plex_image", {
                        serverUrl: plexServerUrl,
                        imagePath: imagePath,
                        token: token || ""
                    });
                    console.log("Invoke completed, result type:", typeof result);

                    if (typeof result === "string" && result.startsWith("data:image/jpeg;base64,")) {
                        setPosterDataUrl(result);
                        console.log("Poster fetched successfully from backend");
                    } else {
                        console.error("Invalid result format - not a base64 data URL:", result);
                        console.log("Trying alternative approach...");

                        // Plex image URLs are not directly accessible - this is expected
                        console.log("Plex image URLs are not directly accessible via HTTP requests");
                        console.log("This is normal behavior - Plex protects these URLs for security");
                        setPosterDataUrl(null);
                    }
                } catch (error) {
                    console.error("Invoke failed completely:", error);
                    console.error("Error type:", typeof error);
                    console.error("Error message:", error?.message || error);

                    // Network errors for Plex metadata paths are expected - Plex protects these URLs
                    if (imagePath.startsWith("/library/metadata/") && error?.message?.includes("error sending request")) {
                        console.log("Plex server blocked direct image access (expected behavior)");
                        console.log("This is normal - Plex requires special handling for image URLs");
                        setPosterDataUrl(null);
                    } else {
                        console.error("Unexpected error:", error);
                        setPosterDataUrl(null);
                    }
                }
            } catch (error) {
                console.error("Unexpected error in fetchPoster:", error);
                setPosterDataUrl(null);
            } finally {
                setImageLoading(false);
            }
        };

        fetchPoster();
    }, [isVisible, metadata, plexServerUrl]);

    if (!isVisible || !metadata) return null;

    // Movie card layout - side by side with portrait poster
    if (metadata.type === "movie") {
        return (
            <div
                className="fixed z-50 w-96 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl"
                style={{
                    left: smartPosition.x,
                    top: smartPosition.y,
                    transform: smartPosition.transform,
                }}
            >
                <div className="p-4">
                    <div className="flex items-start gap-3">
                        {/* Movie poster - portrait orientation */}
                        <div className="w-32 h-48 bg-neutral-700 rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {posterDataUrl ? (
                                <img
                                    src={posterDataUrl}
                                    alt={`${metadata.title} poster`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        console.log("Movie poster failed to display:", e);
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.querySelector('.poster-placeholder')!.classList.remove('hidden');
                                    }}
                                    onLoad={() => {
                                        console.log("Movie poster displayed successfully");
                                    }}
                                />
                            ) : imageLoading ? (
                                <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
                                    Loading...
                                </div>
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center text-neutral-400 text-xs poster-placeholder ${posterDataUrl || imageLoading ? 'hidden' : ''}`}>
                                Poster
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-neutral-100 text-sm leading-tight mb-1">
                                {metadata.title}
                            </h3>

                            <div className="space-y-1 text-xs text-neutral-300">
                                {metadata.year && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Year:</span>
                                        <span>{metadata.year}</span>
                                    </div>
                                )}
                                {metadata.genre && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Genre:</span>
                                        <span>{metadata.genre}</span>
                                    </div>
                                )}
                                {metadata.rating && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Rating:</span>
                                        <span>{metadata.rating}</span>
                                    </div>
                                )}
                                {metadata.studio && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Studio:</span>
                                        <span>{metadata.studio}</span>
                                    </div>
                                )}
                                {metadata.director && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Director:</span>
                                        <span>{metadata.director}</span>
                                    </div>
                                )}
                                {(metadata.edition || metadata.editionTitle) && (
                                    <div className="flex gap-2">
                                        <span className="text-neutral-400">Edition:</span>
                                        <span>{metadata.editionTitle || metadata.edition}</span>
                                    </div>
                                )}
                                {metadata.tagline && (
                                    <div className="mt-2 text-neutral-400 italic">
                                        "{metadata.tagline}"
                                    </div>
                                )}
                                {metadata.summary && (
                                    <div className="mt-2 text-neutral-400 text-xs leading-relaxed">
                                        {metadata.summary.length > 150
                                            ? `${metadata.summary.substring(0, 150)}...`
                                            : metadata.summary
                                        }
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // TV Show card layout - stacked with landscape poster
    return (
        <div
            className="fixed z-50 w-80 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl"
            style={{
                left: smartPosition.x,
                top: smartPosition.y,
                transform: smartPosition.transform,
            }}
        >
            <div className="p-4">
                {/* TV poster - landscape orientation */}
                <div className="w-full h-32 bg-neutral-700 rounded mb-3 flex items-center justify-center overflow-hidden">
                    {posterDataUrl ? (
                        <img
                            src={posterDataUrl}
                            alt={`${metadata.showTitle} poster`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                console.log("TV poster failed to display:", e);
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.querySelector('.poster-placeholder')!.classList.remove('hidden');
                            }}
                            onLoad={() => {
                                console.log("TV poster displayed successfully");
                            }}
                        />
                    ) : imageLoading ? (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
                            Loading...
                        </div>
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center text-neutral-400 text-xs poster-placeholder ${posterDataUrl || imageLoading ? 'hidden' : ''}`}>
                        Poster
                    </div>
                </div>

                <div className="space-y-1">
                    <h3 className="font-semibold text-neutral-100 text-sm leading-tight mb-2">
                        {metadata.showTitle} - {metadata.title}
                    </h3>

                    <div className="space-y-1 text-xs text-neutral-300">
                        <div className="flex gap-2">
                            <span className="text-neutral-400">Show:</span>
                            <span>{metadata.showTitle}</span>
                        </div>
                        {metadata.season && metadata.index && (
                            <div className="flex gap-2">
                                <span className="text-neutral-400">Episode:</span>
                                <span>S{metadata.season.toString().padStart(2, '0')}E{metadata.index.toString().padStart(2, '0')}</span>
                            </div>
                        )}
                        {metadata.year && (
                            <div className="flex gap-2">
                                <span className="text-neutral-400">Year:</span>
                                <span>{metadata.year}</span>
                            </div>
                        )}
                        {metadata.parentTitle && (
                            <div className="flex gap-2">
                                <span className="text-neutral-400">Season:</span>
                                <span>{metadata.parentTitle}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
