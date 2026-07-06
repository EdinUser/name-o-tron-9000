#!/usr/bin/env bash
set -euo pipefail

MEDIA_ROOT="./test_media"
OUT="tests/mock-plex/generated/mock-path-mappings.json"
SERVER_ID="http://localhost:32400"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --media-root)
      MEDIA_ROOT="$2"
      shift 2
      ;;
    --out)
      OUT="$2"
      shift 2
      ;;
    --server-id)
      SERVER_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--media-root <path>] [--out <path>] [--server-id <id>]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$MEDIA_ROOT" ]]; then
  echo "Media root does not exist: $MEDIA_ROOT" >&2
  echo "Run: bash tests/mock-plex/bin/setup-test-media.sh --out $MEDIA_ROOT" >&2
  exit 1
fi

MEDIA_ROOT_ABS="$(cd "$MEDIA_ROOT" && pwd -P)"
OUT_DIR="$(dirname "$OUT")"
mkdir -p "$OUT_DIR"

cat > "$OUT" <<EOF
[
  {
    "server_id": "$SERVER_ID",
    "plex_root": "/mount/server/HDD1/Movies",
    "local_root": "$MEDIA_ROOT_ABS/Movies",
    "platform": "linux"
  },
  {
    "server_id": "$SERVER_ID",
    "plex_root": "/share/plex/Series",
    "local_root": "$MEDIA_ROOT_ABS/TV",
    "platform": "linux"
  },
  {
    "server_id": "$SERVER_ID",
    "plex_root": "/volume1/Media/Music",
    "local_root": "$MEDIA_ROOT_ABS/Music",
    "platform": "linux"
  }
]
EOF

echo "Wrote sample mock Plex path mappings to: $OUT"
echo "Server id: $SERVER_ID"
echo "Media root: $MEDIA_ROOT_ABS"
