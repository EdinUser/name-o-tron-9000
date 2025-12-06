import json
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: generate_release.py <version> <date>")

    version = sys.argv[1]
    date = sys.argv[2]

    root = Path("upload") / version
    files = [p.name for p in root.glob("*") if p.is_file()] if root.exists() else []

    linux_exts = (".AppImage", ".deb", ".rpm")
    windows_exts = (".exe", ".msi", ".zip")

    linux_files = [f for f in files if f.endswith(linux_exts)]
    windows_files = [f for f in files if f.endswith(windows_exts)]

    release = {
        "version": version,
        "date": date,
        "platforms": {
            "linux": linux_files,
            "windows": windows_files,
        },
    }

    Path("release.json").write_text(json.dumps(release, indent=2))
    print(
        f"Generated release.json with version={version!r}, "
        f"linux={len(linux_files)}, windows={len(windows_files)}"
    )


if __name__ == "__main__":
    main()

