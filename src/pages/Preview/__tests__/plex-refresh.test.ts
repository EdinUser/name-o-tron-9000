import { describe, expect, it } from "vitest";
import {
    collectAutomaticRefreshTargets,
    collectUndoRefreshTargets,
    dirnamePlexPath,
    localPathToPlexPath,
    type RefreshOperation,
    type RefreshPathMapping,
} from "../plexRefresh";
import type { PreviewRow } from "../types";

const mappings: RefreshPathMapping[] = [
    {
        server_id: "test-server-id",
        plex_root: "/share/Movies",
        local_root: "/mnt/Movies",
    },
    {
        server_id: "test-server-id",
        plex_root: "/share/TV",
        local_root: "/mnt/TV",
    },
];

describe("Preview Plex refresh helpers", () => {
    it("maps a local path back to a Plex path using the longest matching root", () => {
        expect(
            localPathToPlexPath(
                "/mnt/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv",
                mappings,
                "test-server-id",
            ),
        ).toBe("/share/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv");
    });

    it("collects movie folder targets from renamed preview rows", () => {
        const rows: PreviewRow[] = [
            {
                id: "movie-1",
                kind: "movie",
                filePath: "/mnt/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv",
                plexPath: "/share/Movies/Normal/A-I/50 First Dates/50 First Dates (2004).mkv",
                proposed: "50 First Dates (2004).mkv",
                status: "warning",
                flags: [],
            },
        ];

        expect(collectAutomaticRefreshTargets("movie", rows)).toEqual([
            "/share/Movies/Normal/A-I/50 First Dates",
        ]);
    });

    it("uses show-folder refresh targets for undo when more than two TV episodes were reverted", () => {
        const operations: RefreshOperation[] = [
            {
                operation_type: "rename",
                original_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E01 - One.mkv",
                new_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E01 - Uno.mkv",
            },
            {
                operation_type: "rename",
                original_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E02 - Two.mkv",
                new_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E02 - Dos.mkv",
            },
            {
                operation_type: "rename",
                original_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E03 - Three.mkv",
                new_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E03 - Tres.mkv",
            },
        ];

        expect(collectUndoRefreshTargets("show", operations, mappings, "test-server-id")).toEqual([
            "/share/TV/Example Show",
        ]);
    });

    it("keeps episode-folder refresh targets for undo when two or fewer TV episodes were reverted", () => {
        const operations: RefreshOperation[] = [
            {
                operation_type: "rename",
                original_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E01 - One.mkv",
                new_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E01 - Uno.mkv",
            },
            {
                operation_type: "rename",
                original_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E02 - Two.mkv",
                new_path: "/mnt/TV/Example Show/Season 01/Example Show - S01E02 - Dos.mkv",
            },
        ];

        expect(collectUndoRefreshTargets("show", operations, mappings, "test-server-id")).toEqual([
            "/share/TV/Example Show/Season 01",
        ]);
    });

    it("normalizes dirname extraction for Plex-style paths", () => {
        expect(dirnamePlexPath("/share/TV/Example Show/Season 01/")).toBe("/share/TV/Example Show");
    });
});
