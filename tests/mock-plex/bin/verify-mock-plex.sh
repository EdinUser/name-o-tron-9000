#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:32400"
MEDIA_ROOT="./test_media"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --media-root)
      MEDIA_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--base-url <url>] [--media-root <path>]" >&2
      exit 1
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for verification" >&2
  exit 1
fi

check_endpoint() {
  local url="$1"
  local needle="$2"
  local body

  body="$(curl -fsS "$url")" || {
    echo "FAIL endpoint: $url" >&2
    exit 1
  }

  if [[ "$body" != *"$needle"* ]]; then
    echo "FAIL endpoint content: $url (missing '$needle')" >&2
    exit 1
  fi

  echo "OK   $url"
}

check_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "FAIL file: $file" >&2
    exit 1
  fi
  echo "OK   $file"
}

echo "Verifying mock Plex endpoints at $BASE_URL"
check_endpoint "$BASE_URL/library/sections" "\"Directory\""
check_endpoint "$BASE_URL/library/sections/1/all" "Interstellar"
check_endpoint "$BASE_URL/library/sections/1/all" "imdb://tt0816692"
check_endpoint "$BASE_URL/library/sections/1/all" "Blade Runner"
check_endpoint "$BASE_URL/library/sections/1/all" "Kingdom of Heaven"
check_endpoint "$BASE_URL/library/sections/1/all" "The Lord of the Rings: The Two Towers"
check_endpoint "$BASE_URL/library/sections/2/all" "Northwind Homicide"
check_endpoint "$BASE_URL/library/sections/2/all" "Quiet Harbor"
check_endpoint "$BASE_URL/library/sections/2/all" "Two Broke Girls"
check_endpoint "$BASE_URL/library/metadata/101" "Interstellar"
check_endpoint "$BASE_URL/library/metadata/101" "tmdb://157336"
check_endpoint "$BASE_URL/library/metadata/104" "Blade Runner"
check_endpoint "$BASE_URL/library/metadata/106" "Director's Cut"
check_endpoint "$BASE_URL/library/metadata/108" "Extended Edition"
check_endpoint "$BASE_URL/library/metadata/200/children" "Season 01"
check_endpoint "$BASE_URL/library/metadata/200/children?season=0" "Genesis OVA"
check_endpoint "$BASE_URL/library/metadata/200/children?season=0" "No Regrets OVA Part 2"
check_endpoint "$BASE_URL/library/metadata/201/children" "Season 02"
check_endpoint "$BASE_URL/library/metadata/201/children?season=2" "Black Ice"
check_endpoint "$BASE_URL/library/metadata/202/allLeaves" "Beacon"
check_endpoint "$BASE_URL/library/metadata/203" "Two Broke Girls"
check_endpoint "$BASE_URL/library/metadata/203/allLeaves" "And the Grand Reopening"
check_endpoint "$BASE_URL/library/metadata/203/children?season=1" "And the Soft Opening"
check_endpoint "$BASE_URL/library/sections/1/collection" "Christopher Nolan Collection"
check_endpoint "$BASE_URL/hubs/search?sectionId=1&query=arrival" "Arrival"
check_endpoint "$BASE_URL/hubs/search?sectionId=1&query=blade" "Blade Runner"
check_endpoint "$BASE_URL/hubs/search?sectionId=1&query=kingdom" "Kingdom of Heaven"
check_endpoint "$BASE_URL/hubs/search?sectionId=1&query=two%20towers" "Extended Edition"
check_endpoint "$BASE_URL/hubs/search?sectionId=2&query=genesis" "Genesis OVA"
check_endpoint "$BASE_URL/hubs/search?sectionId=2&query=regrets" "No Regrets OVA Part 1"
check_endpoint "$BASE_URL/hubs/search?sectionId=2&query=girls" "Two Broke Girls"
check_endpoint "$BASE_URL/hubs/search?sectionId=2&query=northwind" "Northwind Homicide"
check_endpoint "$BASE_URL/hubs/search?sectionId=2&query=quiet" "Quiet Harbor"

echo
echo "Verifying local mock media at $MEDIA_ROOT"
check_file "$MEDIA_ROOT/Movies/Incoming/Interstellar.2014.1080p.BluRay.x264.mkv"
check_file "$MEDIA_ROOT/Movies/Staging/Arrival.2016.1080p.WEB-DL.mkv"
check_file "$MEDIA_ROOT/Movies/Staging/Arrival.2016.1080p.WEB-DL.eng.srt"
check_file "$MEDIA_ROOT/Movies/Editions/Blade.Runner.1982.Directors.Cut.mkv"
check_file "$MEDIA_ROOT/Movies/Editions/Blade.Runner.1982.Directors.Cut.eng.srt"
check_file "$MEDIA_ROOT/Movies/Editions/Kingdom.of.Heaven.2005.Theatrical.Release.mkv"
check_file "$MEDIA_ROOT/Movies/Editions/Kingdom.of.Heaven.2005.Directors.Cut.mkv"
check_file "$MEDIA_ROOT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.mkv"
check_file "$MEDIA_ROOT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Theatrical.Release.eng.srt"
check_file "$MEDIA_ROOT/Movies/Editions/The.Lord.of.the.Rings.The.Two.Towers.2002.Extended.Edition.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E01.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E03E04.Multi.eng.srt"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E05.Part1.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Season 01/Abyssal_Gate.S01E06.Part2.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E01.Genesis.OVA.eng.srt"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E02.No.Regrets.Part1.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E02.No.Regrets.Part1.eng.srt"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E03.No.Regrets.Part2.mkv"
check_file "$MEDIA_ROOT/TV/Abyssal_Gate/Specials/Abyssal_Gate.S00E03.No.Regrets.Part2.eng.forced.srt"
check_file "$MEDIA_ROOT/TV/Northwind_Homicide/Season 01/Northwind_Homicide.S01E01.mkv"
check_file "$MEDIA_ROOT/TV/Northwind_Homicide/Season 02/Northwind_Homicide.S02E02.mkv"
check_file "$MEDIA_ROOT/TV/Northwind_Homicide/Specials/Northwind_Homicide.S00E01.Holiday.Special.mkv"
check_file "$MEDIA_ROOT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E01.mkv"
check_file "$MEDIA_ROOT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.mkv"
check_file "$MEDIA_ROOT/TV/Quiet_Harbor/Season 01/Quiet_Harbor.S01E02E03.Finale.eng.srt"
check_file "$MEDIA_ROOT/TV/Two_Broke_Girls/Two_Broke_Girls.S01E01.mkv"
check_file "$MEDIA_ROOT/TV/Two_Broke_Girls/Two_Broke_Girls.S01E01.eng.srt"
check_file "$MEDIA_ROOT/TV/Two_Broke_Girls/Two_Broke_Girls.S01E03.eng.forced.srt"
check_file "$MEDIA_ROOT/TV/Two_Broke_Girls/Two_Broke_Girls.S01E04.spa.srt"

echo
echo "Mock Plex verification passed."
