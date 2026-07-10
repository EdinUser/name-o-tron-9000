#! /usr/bin/env bash

# GTK3 environment variables: https://developer.gnome.org/gtk3/stable/gtk-running.html
# GTK4 environment variables: https://developer.gnome.org/gtk4/stable/gtk-running.html

set -e

if [ "$DEBUG" != "" ]; then
    set -x
    verbose="--verbose"
fi

script=$(readlink -f "$0")

show_usage() {
    echo "Usage: $script --appdir <path to AppDir>"
    echo
    echo "Bundles resources for applications that use GTK into an AppDir"
    echo
    echo "Required variables:"
    echo "  LINUXDEPLOY=\".../linuxdeploy\" path to linuxdeploy (e.g., AppImage); set automatically when plugin is run directly by linuxdeploy"
}

variable_is_true() {
    local var="$1"

    if [ -n "$var" ] && { [ "$var" == "true" ] || [ "$var" -gt 0 ]; } 2> /dev/null; then
        return 0
    else
        return 1
    fi
}

get_pkgconf_variable() {
    local variable="$1"
    local library="$2"
    local default_path="$3"

    path="$("$PKG_CONFIG" --variable="$variable" "$library")"
    if [ -n "$path" ]; then
        echo "$path"
    elif [ -n "$default_path" ]; then
        echo "$default_path"
    else
        echo "$0: there is no '$variable' variable for '$library' library." > /dev/stderr
        echo "Please check the '$library.pc' file is present in \$PKG_CONFIG_PATH (you may need to install the appropriate -dev/-devel package)." > /dev/stderr
        exit 1
    fi
}

copy_tree() {
    local src=("${@:1:$#-1}")
    local dst="${*:$#}"

    for elem in "${src[@]}"; do
        mkdir -p "${dst::-1}$elem"
        cp "$elem" --archive --parents --target-directory="$dst" $verbose
    done
}

search_tool() {
    local tool="$1"
    local directory="$2"

    if command -v "$tool"; then
        return 0
    fi

    PATH_ARRAY=(
        "/usr/lib/$(uname -m)-linux-gnu/$directory/$tool"
        "/usr/lib/$directory/$tool"
        "/usr/bin/$tool"
        "/usr/bin/$tool-64"
        "/usr/bin/$tool-32"
    )

    for path in "${PATH_ARRAY[@]}"; do
        if [ -x "$path" ]; then
            echo "$path"
            return 0
        fi
    done
}

DEPLOY_GTK_VERSION=3
APPDIR=

while [ "$1" != "" ]; do
    case "$1" in
        --plugin-api-version)
            echo "0"
            exit 0
            ;;
        --appdir)
            APPDIR="$2"
            shift
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Invalid argument: $1"
            echo
            show_usage
            exit 1
            ;;
    esac
done

if [ "$APPDIR" == "" ]; then
    show_usage
    exit 1
fi

mkdir -p "$APPDIR"
chmod +w "$APPDIR"/usr/lib64 || true

if command -v pkgconf > /dev/null; then
    PKG_CONFIG="pkgconf"
elif command -v pkg-config > /dev/null; then
    PKG_CONFIG="pkg-config"
else
    echo "$0: pkg-config/pkgconf not found in PATH, aborting"
    exit 1
fi

if ! command -v find &>/dev/null && ! type find &>/dev/null; then
    echo -e "$0: find not found.\nInstall findutils then re-run the plugin."
    exit 1
fi

if [ -z "$LINUXDEPLOY" ]; then
    echo -e "$0: LINUXDEPLOY environment variable is not set.\nDownload a suitable linuxdeploy AppImage, set the environment variable and re-run the plugin."
    exit 1
fi

gtk_versions=0
if [ "$DEPLOY_GTK_VERSION" -eq 0 ]; then
    echo "Determining which GTK version to deploy"
    while IFS= read -r -d '' file; do
        if [ "$DEPLOY_GTK_VERSION" -ne 2 ] && ldd "$file" | grep -q "libgtk-x11-2.0.so"; then
            DEPLOY_GTK_VERSION=2
            gtk_versions="$((gtk_versions+1))"
        fi
        if [ "$DEPLOY_GTK_VERSION" -ne 3 ] && ldd "$file" | grep -q "libgtk-3.so"; then
            DEPLOY_GTK_VERSION=3
            gtk_versions="$((gtk_versions+1))"
        fi
        if [ "$DEPLOY_GTK_VERSION" -ne 4 ] && ldd "$file" | grep -q "libgtk-4.so"; then
            DEPLOY_GTK_VERSION=4
            gtk_versions="$((gtk_versions+1))"
        fi
    done < <(find "$APPDIR/usr/bin" -executable -type f -print0)
fi

if [ "$gtk_versions" -gt 1 ]; then
    echo "$0: can not deploy multiple GTK versions at the same time."
    echo "Please set DEPLOY_GTK_VERSION to {2, 3, 4}."
    exit 1
elif [ "$DEPLOY_GTK_VERSION" -eq 0 ]; then
    echo "$0: failed to auto-detect GTK version."
    echo "Please set DEPLOY_GTK_VERSION to {2, 3, 4}."
    exit 1
fi

echo "Installing AppRun hook"
HOOKSDIR="$APPDIR/apprun-hooks"
HOOKFILE="$HOOKSDIR/linuxdeploy-plugin-gtk.sh"
mkdir -p "$HOOKSDIR"
cat > "$HOOKFILE" <<\EOF
#! /usr/bin/env bash

gsettings get org.gnome.desktop.interface gtk-theme 2> /dev/null | grep -qi "dark" && GTK_THEME_VARIANT="dark" || GTK_THEME_VARIANT="light"
APPIMAGE_GTK_THEME="${APPIMAGE_GTK_THEME:-"Adwaita:$GTK_THEME_VARIANT"}"

export APPDIR="${APPDIR:-"$(dirname "$(realpath "$0")")"}"
export GTK_DATA_PREFIX="$APPDIR"
export GTK_THEME="$APPIMAGE_GTK_THEME"
export GDK_BACKEND=x11
export XDG_DATA_DIRS="$APPDIR/usr/share:/usr/share:$XDG_DATA_DIRS"
EOF

echo "Installing GLib schemas"
glib_schemasdir="$(get_pkgconf_variable "schemasdir" "gio-2.0" "/usr/share/glib-2.0/schemas")"
copy_tree "$glib_schemasdir" "$APPDIR/"
glib-compile-schemas "$APPDIR/$glib_schemasdir"
cat >> "$HOOKFILE" <<EOF
export GSETTINGS_SCHEMA_DIR="\$APPDIR/$glib_schemasdir"
EOF

case "$DEPLOY_GTK_VERSION" in
    2)
        echo "WARNING: Gtk+2 applications are not fully supported by this plugin"
        ;;
    3)
        echo "Installing GTK 3.0 modules"
        gtk3_exec_prefix="$(get_pkgconf_variable "exec_prefix" "gtk+-3.0")"
        gtk3_libdir="$(get_pkgconf_variable "libdir" "gtk+-3.0")/gtk-3.0"
        gtk3_immodulesdir="$gtk3_libdir/$(get_pkgconf_variable "gtk_binary_version" "gtk+-3.0")/immodules"
        gtk3_printbackendsdir="$gtk3_libdir/$(get_pkgconf_variable "gtk_binary_version" "gtk+-3.0")/printbackends"
        gtk3_immodules_cache_file="$(dirname "$gtk3_immodulesdir")/immodules.cache"
        gtk3_immodules_query="$(search_tool "gtk-query-immodules-3.0" "libgtk-3-0")"
        copy_tree "$gtk3_libdir" "$APPDIR/"
        cat >> "$HOOKFILE" <<EOF
export GTK_EXE_PREFIX="\$APPDIR/$gtk3_exec_prefix"
export GTK_PATH="\$APPDIR/$gtk3_libdir:/usr/lib64/gtk-3.0:/usr/lib/x86_64-linux-gnu/gtk-3.0"
export GTK_IM_MODULE_FILE="\$APPDIR/$gtk3_immodules_cache_file"

EOF

        if [ -z "$gtk3_immodules_query" ] || [ ! -x "$gtk3_immodules_query" ]; then
            echo "$0: failed to determine path of gtk-query-immodules-3.0 helper executable."
            echo "Please install the package that provides it and re-run the plugin."
            exit 1
        fi

        gtk3_immodules_cache_file="$APPDIR/$gtk3_immodules_cache_file"
        GTK_EXE_PREFIX="$APPDIR/$gtk3_exec_prefix" "$gtk3_immodules_query" "$APPDIR/$gtk3_immodulesdir"/*.so > "$gtk3_immodules_cache_file"
        sed -i "s|$APPDIR||g" "$gtk3_immodules_cache_file"

        echo "Installing GTK 3.0 print backends"
        copy_tree "$gtk3_printbackendsdir" "$APPDIR/"
        ;;
    4)
        echo "$0: GTK 4 bundling is not supported by the checked-in wrapper yet."
        exit 1
        ;;
esac

echo "Bundling shared libraries"
"$LINUXDEPLOY" --appdir "$APPDIR"
