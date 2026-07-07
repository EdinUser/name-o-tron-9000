#!/usr/bin/env bash
set -euo pipefail

manifest=""
out=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      manifest="$2"
      shift 2
      ;;
    --out)
      out="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$manifest" || -z "$out" ]]; then
  echo "Usage: $0 --manifest <path> --out <path>" >&2
  exit 1
fi

mkdir -p "$out"

node - "$manifest" "$out" <<'NODE'
const fs = require("fs");
const path = require("path");

const manifestPath = path.resolve(process.argv[2]);
const outRoot = path.resolve(process.argv[3]);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, contents) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function relativeToLibrary(library, relativePath) {
  return path.join(outRoot, library.local_root, relativePath);
}

const librariesByKey = new Map();
const pathMappings = [];
const resolvedLibraries = [];

for (const library of manifest.libraries || []) {
  const resolvedLocalRoot = path.join(outRoot, library.local_root);
  mkdirp(resolvedLocalRoot);
  librariesByKey.set(String(library.key), { ...library, resolvedLocalRoot });
  pathMappings.push({
    server_id: manifest.server_id,
    plex_root: library.plex_root,
    local_root: resolvedLocalRoot,
    platform: process.platform,
  });

  const resolvedItems = [];
  for (const item of library.items || []) {
    const resolvedLocalPath = relativeToLibrary(library, item.local_file);
    writeFile(resolvedLocalPath, item.seed_contents || "");

    const resolvedSubtitles = [];
    for (const subtitle of item.subtitles || []) {
      const resolvedSubtitlePath = relativeToLibrary(library, subtitle.local_file);
      writeFile(resolvedSubtitlePath, subtitle.contents || "");
      resolvedSubtitles.push({
        ...subtitle,
        resolved_local_path: resolvedSubtitlePath,
      });
    }

    resolvedItems.push({
      ...item,
      resolved_local_path: resolvedLocalPath,
      subtitles: resolvedSubtitles,
    });
  }

  resolvedLibraries.push({
    ...library,
    resolved_local_root: resolvedLocalRoot,
    items: resolvedItems,
  });
}

const resolvedDirectories = [];
for (const directory of manifest.directories || []) {
  const library = librariesByKey.get(String(directory.library_key));
  if (!library) {
    throw new Error(`Unknown library key for directory: ${directory.library_key}`);
  }
  const resolvedPath = relativeToLibrary(library, directory.relative_path);
  mkdirp(resolvedPath);
  if (directory.state === "non_empty") {
    writeFile(path.join(resolvedPath, directory.seed_file || ".keep"), directory.contents || "keep");
  }
  resolvedDirectories.push({
    ...directory,
    resolved_path: resolvedPath,
  });
}

const resolvedConflicts = [];
for (const conflict of manifest.conflicts || []) {
  const library = librariesByKey.get(String(conflict.library_key));
  if (!library) {
    throw new Error(`Unknown library key for conflict: ${conflict.library_key}`);
  }
  const resolvedPath = relativeToLibrary(library, conflict.relative_path);
  writeFile(resolvedPath, conflict.contents || "conflict");
  resolvedConflicts.push({
    ...conflict,
    resolved_path: resolvedPath,
  });
}

const resolvedFixture = {
  name: manifest.name,
  schema_version: manifest.schema_version,
  server_id: manifest.server_id,
  manifest_path: manifestPath,
  output_root: outRoot,
  path_mappings: pathMappings,
  libraries: resolvedLibraries,
  directories: resolvedDirectories,
  conflicts: resolvedConflicts,
  assertions: manifest.assertions || {},
};

writeFile(
  path.join(outRoot, "resolved-fixture.json"),
  `${JSON.stringify(resolvedFixture, null, 2)}\n`,
);
NODE
