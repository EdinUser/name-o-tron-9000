#!/usr/bin/env bash
set -euo pipefail

OUT="./test_media"
CLEAN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="$2"
      shift 2
      ;;
    --no-clean)
      CLEAN=0
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--out <path>] [--no-clean]" >&2
      exit 1
      ;;
  esac
done

if [[ "$CLEAN" -eq 1 ]]; then
  rm -rf "$OUT"
fi

mkdir -p \
  "$OUT/Movies/Incoming" \
  "$OUT/Movies/Staging" \
  "$OUT/Movies/Conflicts" \
  "$OUT/Movies/Editions" \
  "$OUT/TV/Abyssal_Gate/Season 01" \
  "$OUT/TV/Abyssal_Gate/Specials" \
  "$OUT/TV/Northwind_Homicide/Season 01" \
  "$OUT/TV/Northwind_Homicide/Season 02" \
  "$OUT/TV/Northwind_Homicide/Specials" \
  "$OUT/TV/Quiet_Harbor/Season 01" \
  "$OUT/Music/Mock Artist/Mock Album" \
  "$OUT/Misc"

: > "$OUT/Movies/Incoming/Interstellar.2014.1080p.BluRay.x264.mkv"
: > "$OUT/Movies/Staging/Arrival.2016.1080p.WEB-DL.mkv"
cat > "$OUT/Movies/Staging/Arrival.2016.1080p.WEB-DL.eng.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,500
We are ready.
EOF
: > "$OUT/Movies/Conflicts/Conflict.Movie.2020.1080p.mkv"
: > "$OUT/Movies/Editions/Blade.Runner.1982.Directors.Cut.mkv"
cat > "$OUT/Movies/Editions/Blade.Runner.1982.Directors.Cut.eng.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,500
I've seen things you people wouldn't believe.
EOF
: > "$OUT/Movies/Editions/Kingdom.of.Heaven.2005.Theatrical.Release.mkv"
: > "$OUT/Movies/Editions/Kingdom.of.Heaven.2005.Directors.Cut.mkv"
: > "$OUT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.mkv"
cat > "$OUT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.eng.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,500
The world is changing.
EOF
: > "$OUT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Extended.Edition.mkv"

: > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E01.mkv"
: > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E02.mkv"
: > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.mkv"
cat > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.eng.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,500
Two episodes share this single file.
EOF
: > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E05.Part1.mkv"
: > "$OUT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E06.Part2.mkv"
: > "$OUT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.mkv"

: > "$OUT/TV/Northwind_Homicide/Season 01/Northwind_Homicide.S01E01.mkv"
: > "$OUT/TV/Northwind_Homicide/Season 01/Northwind_Homicide.S01E02.mkv"
: > "$OUT/TV/Northwind_Homicide/Season 02/Northwind_Homicide.S02E01.mkv"
: > "$OUT/TV/Northwind_Homicide/Season 02/Northwind_Homicide.S02E02.mkv"
: > "$OUT/TV/Northwind_Homicide/Specials/Northwind_Homicide.S00E01.Holiday.Special.mkv"

: > "$OUT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E01.mkv"
: > "$OUT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.mkv"
cat > "$OUT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.eng.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,500
The tide is turning.
EOF

: > "$OUT/Music/Mock Artist/Mock Album/01 Mock Track.mp3"
printf '%s\n' "mock plex local media" > "$OUT/Misc/README.txt"

echo "Mock Plex local media ready at: $OUT"
echo "Movies:"
echo "  - Incoming/Interstellar.2014.1080p.BluRay.x264.mkv"
echo "  - Staging/Arrival.2016.1080p.WEB-DL.mkv"
echo "  - Staging/Arrival.2016.1080p.WEB-DL.eng.srt"
echo "  - Conflicts/Conflict.Movie.2020.1080p.mkv"
echo "  - Editions/Blade.Runner.1982.Directors.Cut.mkv"
echo "  - Editions/Blade.Runner.1982.Directors.Cut.eng.srt"
echo "  - Editions/Kingdom.of.Heaven.2005.Theatrical.Release.mkv"
echo "  - Editions/Kingdom.of.Heaven.2005.Directors.Cut.mkv"
echo "  - Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.mkv"
echo "  - Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.eng.srt"
echo "  - Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Extended.Edition.mkv"
echo "TV:"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E01.mkv"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E02.mkv"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.mkv"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.eng.srt"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E05.Part1.mkv"
echo "  - Abyssal_Gate/Season 01/Abyssal_Gate.S01E06.Part2.mkv"
echo "  - Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.mkv"
echo "  - Northwind_Homicide/Season 01/Northwind_Homicide.S01E01.mkv"
echo "  - Northwind_Homicide/Season 01/Northwind_Homicide.S01E02.mkv"
echo "  - Northwind_Homicide/Season 02/Northwind_Homicide.S02E01.mkv"
echo "  - Northwind_Homicide/Season 02/Northwind_Homicide.S02E02.mkv"
echo "  - Northwind_Homicide/Specials/Northwind_Homicide.S00E01.Holiday.Special.mkv"
echo "  - Quiet_Harbor/Season 01/Quiet_Harbor.S01E01.mkv"
echo "  - Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.mkv"
echo "  - Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.eng.srt"
