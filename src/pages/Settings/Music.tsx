import React from "react";
import Toggle from "../../components/Toggle";
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

export function Music({s, onChange}: { s: Settings; onChange: (v: Settings["music"]) => void }) {
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
