#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache_dir="${repo_root}/src-tauri/target/appimage-tools"
wrapper_src="${repo_root}/scripts/linuxdeploy/linuxdeploy-wrapper.sh"
gtk_plugin_src="${repo_root}/scripts/linuxdeploy/linuxdeploy-plugin-gtk.sh"
gstreamer_plugin_src="${repo_root}/scripts/linuxdeploy/linuxdeploy-plugin-gstreamer.sh"
linuxdeploy_wrapper="${cache_dir}/linuxdeploy-x86_64.AppImage"
linuxdeploy_real="${cache_dir}/linuxdeploy-x86_64.AppImage.real"
plugin_appimage="${cache_dir}/linuxdeploy-plugin-appimage.AppImage"
linuxdeploy_url="https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
plugin_appimage_url="https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage"

mkdir -p "${cache_dir}"
rm -rf "${cache_dir}/linuxdeploy-x86_64-hoststrip"
rm -f "${cache_dir}/linuxdeploy-wrapper.log"

if [[ ! -f "${linuxdeploy_real}" ]]; then
  curl -fsSL "${linuxdeploy_url}" -o "${linuxdeploy_real}"
fi

if [[ ! -f "${plugin_appimage}" ]]; then
  curl -fsSL "${plugin_appimage_url}" -o "${plugin_appimage}"
fi

chmod 0755 "${linuxdeploy_real}" "${plugin_appimage}"
rm -f "${linuxdeploy_wrapper}" "${cache_dir}/linuxdeploy-plugin-gtk.sh" "${cache_dir}/linuxdeploy-plugin-gstreamer.sh"
install -m 0755 "${wrapper_src}" "${linuxdeploy_wrapper}"
install -m 0755 "${gtk_plugin_src}" "${cache_dir}/linuxdeploy-plugin-gtk.sh"
install -m 0755 "${gstreamer_plugin_src}" "${cache_dir}/linuxdeploy-plugin-gstreamer.sh"

echo "Installed linuxdeploy wrapper into ${cache_dir} and cleared extracted cache state"
