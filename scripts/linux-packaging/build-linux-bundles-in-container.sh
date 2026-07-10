#!/usr/bin/env bash
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "${repo_root}"

bash scripts/install-linuxdeploy-wrapper.sh
npm ci
npm run test:types

appdir_path="${repo_root}/src-tauri/target/release/bundle/appimage/name-o-tron-9000.AppDir"
appimage_output="${repo_root}/src-tauri/target/release/bundle/appimage/name-o-tron-9000_${TAURI_BUILD_VERSION}_amd64.AppImage"
wrapper_bin="${repo_root}/src-tauri/target/appimage-tools/linuxdeploy-x86_64.AppImage"

rm -rf "${appdir_path}" "${appimage_output}"

set +e
npx tauri build --bundles appimage,deb,rpm
tauri_status=$?
set -e

if [[ ! -d "${appdir_path}" ]]; then
  echo "Expected AppDir missing after tauri build: ${appdir_path}" >&2
  exit "${tauri_status:-1}"
fi

if [[ ! -f "${appimage_output}" ]]; then
  TAURI_BUILD_VERSION="${TAURI_BUILD_VERSION}" "${wrapper_bin}" --appdir "${appdir_path}" --output appimage
fi

test -f "${appimage_output}"
find "${repo_root}/src-tauri/target/release/bundle/deb" -maxdepth 1 -type f -name '*.deb' | grep -q .
find "${repo_root}/src-tauri/target/release/bundle/rpm" -maxdepth 1 -type f -name '*.rpm' | grep -q .
