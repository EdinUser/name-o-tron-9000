#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cache_dir="${script_dir}"
real_appimage="${cache_dir}/linuxdeploy-x86_64.AppImage.real"
plugin_appimage="${cache_dir}/linuxdeploy-plugin-appimage.AppImage"
extract_root="${cache_dir}/linuxdeploy-x86_64-hoststrip"
extract_dir="${extract_root}/squashfs-root"
marker_file="${extract_root}/.patched-with-noop-strip"
plugin_extract_root="${cache_dir}/linuxdeploy-plugin-appimage-extract"
plugin_extract_dir="${plugin_extract_root}/squashfs-root"
plugin_marker_file="${plugin_extract_root}/.plugin-extracted"
debug_log="${cache_dir}/linuxdeploy-wrapper.log"
linuxdeploy_bin="${extract_dir}/usr/bin/linuxdeploy"
appimagetool_bin="${plugin_extract_dir}/usr/bin/appimagetool"
appdir_parent=""
appdir_path=""
output_mode=""
args=()
linuxdeploy_args=()

log() {
  printf '%s\n' "$*" >> "${debug_log}"
}

raw_args=("$@")
for ((i = 0; i < ${#raw_args[@]}; i++)); do
  current="${raw_args[$i]}"

  if [[ "${current}" == "--appimage-extract-and-run" ]]; then
    continue
  fi

  if [[ "${current}" == "--output" ]]; then
    next_index=$((i + 1))
    output_mode="${raw_args[$next_index]}"
    i=$next_index
    continue
  fi

  args+=("${current}")

  if [[ "${current}" == "--appdir" ]]; then
    next_index=$((i + 1))
    resolved="$(realpath -m "${raw_args[$next_index]}")"
    args+=("${resolved}")
    appdir_path="${resolved}"
    appdir_parent="$(dirname "${resolved}")"
    i=$next_index
  fi
done

linuxdeploy_args=("${args[@]}")

if [[ ! -x "${real_appimage}" ]]; then
  echo "linuxdeploy wrapper error: missing ${real_appimage}" >&2
  exit 1
fi

if [[ ! -x "${plugin_appimage}" ]]; then
  echo "linuxdeploy wrapper error: missing ${plugin_appimage}" >&2
  exit 1
fi

refresh_extract() {
  rm -rf "${extract_root}"
  mkdir -p "${extract_root}"
  (
    cd "${extract_root}"
    "${real_appimage}" --appimage-extract >/dev/null
  )
  cat > "${extract_dir}/usr/bin/strip" <<'STRIP'
#!/bin/sh
exit 0
STRIP
  chmod +x "${extract_dir}/usr/bin/strip"
  printf '%s\n' 'noop-strip' > "${marker_file}"
}

refresh_plugin_extract() {
  rm -rf "${plugin_extract_root}"
  mkdir -p "${plugin_extract_root}"
  (
    cd "${plugin_extract_root}"
    "${plugin_appimage}" --appimage-extract >/dev/null
  )
  printf '%s\n' 'plugin-extracted' > "${plugin_marker_file}"
}

prune_multimedia_libs() {
  local libdir="${appdir_path}/usr/lib"
  [[ -d "${libdir}" ]] || return 0
  find "${libdir}" -maxdepth 1 \( -type f -o -type l \) -print -delete >> "${debug_log}"
}

build_output_path() {
  local app_name arch version
  app_name="$(basename "${appdir_path}" .AppDir)"
  arch="$(uname -m)"
  case "${arch}" in
    x86_64) arch="amd64" ;;
  esac
  version="${TAURI_BUILD_VERSION:-}"
  if [[ -n "${version}" ]]; then
    printf '%s/%s_%s_%s.AppImage\n' "${appdir_parent}" "${app_name}" "${version}" "${arch}"
  else
    printf '%s/%s_%s.AppImage\n' "${appdir_parent}" "${app_name}" "${arch}"
  fi
}

if [[ ! -x "${linuxdeploy_bin}" || ! -x "${extract_dir}/usr/bin/strip" || ! -f "${marker_file}" ]]; then
  refresh_extract
fi

if [[ ! -x "${appimagetool_bin}" || ! -f "${plugin_marker_file}" ]]; then
  refresh_plugin_extract
fi

export PATH="${cache_dir}:$PATH"
export LINUXDEPLOY_PLUGIN_DIR="${cache_dir}"
export APPIMAGE_EXTRACT_AND_RUN=1
export OUTPUT="$(build_output_path)"
export LDAI_OUTPUT="${OUTPUT}"

if [[ -n "${appdir_parent}" && -d "${appdir_parent}" ]]; then
  cd "${appdir_parent}"
fi

log "invoke output=${output_mode} appdir=${appdir_path} parent=${appdir_parent} args=${linuxdeploy_args[*]}"
set +e
"${linuxdeploy_bin}" "${linuxdeploy_args[@]}"
status=$?
set -e
log "invoke status=${status}"
[[ ${status} -eq 0 ]] || exit "${status}"

if [[ "${output_mode}" == "appimage" ]]; then
  prune_multimedia_libs
  log "appimagetool output=${OUTPUT}"
  "${appimagetool_bin}" "${appdir_path}" "${OUTPUT}"
fi
