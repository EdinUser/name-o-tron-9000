#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_tag="${LINUX_BUNDLE_IMAGE_TAG:-name-o-tron-linux-builder:local}"
app_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "${repo_root}/package.json")"

docker build \
  -f "${repo_root}/scripts/linux-packaging/Dockerfile" \
  -t "${image_tag}" \
  "${repo_root}"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e REPO_ROOT=/workspace \
  -e TAURI_BUILD_VERSION="${app_version}" \
  -v "${repo_root}:/workspace" \
  -w /workspace \
  "${image_tag}" \
  bash scripts/linux-packaging/build-linux-bundles-in-container.sh
