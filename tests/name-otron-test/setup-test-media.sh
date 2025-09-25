#!/bin/bash
# setup-test-media.sh
# Creates a torture test media library for Name-o-Tron 9000
# WARNING: This script will delete ./test_media if it exists.

BASE_DIR="./test_media"

# Clean start
rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR"

########################
# Movies
########################
mkdir -p "$BASE_DIR/Movies"

# Normal messy names
touch "$BASE_DIR/Movies/Inception.1080p.BluRay.x264.mkv"
touch "$BASE_DIR/Movies/The.Matrix.1999.extended.avi"
touch "$BASE_DIR/Movies/Avatar(2009)[IMAX][4K].mp4"
touch "$BASE_DIR/Movies/Spirited Away - 千と千尋の神隠し (2001).mkv"

# Reserved name (Windows)
touch "$BASE_DIR/Movies/CON.mp4"

# Invalid characters
touch "$BASE_DIR/Movies/Bad:Movie*Name?.mkv"

# Super long path (filename length > 260)
LONGNAME="$(printf 'A%.0s' {1..260}).mkv"
touch "$BASE_DIR/Movies/$LONGNAME"

# Duplicate conflict (two files that would map to same target)
echo "first" > "$BASE_DIR/Movies/Conflict.Movie.2020.mkv"
echo "second" > "$BASE_DIR/Movies/Conflict Movie (2020).mkv"

########################
# TV Shows
########################
mkdir -p "$BASE_DIR/TV/Breaking.Bad/Season 1"

touch "$BASE_DIR/TV/Breaking.Bad/Season 1/Breaking.Bad.S01E01.Pilot.avi"
touch "$BASE_DIR/TV/Breaking.Bad/Season 1/Breaking.Bad.S01E02-03.avi" # multi-episode
touch "$BASE_DIR/TV/Breaking.Bad/Season 1/Breaking.Bad.S01.Special.OVA.mkv"

# Extended / Directors Cut episode
touch "$BASE_DIR/TV/Breaking.Bad/Season 1/Breaking.Bad.S01E04.Directors.Cut.mkv"

# Unmatched random file
touch "$BASE_DIR/TV/Breaking.Bad/Season 1/RandomStuff123.xyz"

mkdir -p "$BASE_DIR/TV/Attack.on.Titan/Season 00"
touch "$BASE_DIR/TV/Attack.on.Titan/Season 00/AOT.Special.DirectorsCut.mkv"

########################
# Music
########################
mkdir -p "$BASE_DIR/Music/Daft Punk - Random Access Memories"

# Weird numbering
touch "$BASE_DIR/Music/Daft Punk - Random Access Memories/01-TrackOne.mp3"
touch "$BASE_DIR/Music/Daft Punk - Random Access Memories/1-02AnotherTrack.mp3"
touch "$BASE_DIR/Music/Daft Punk - Random Access Memories/CD2-03Finale.flac"

# Unicode in filename
touch "$BASE_DIR/Music/Daft Punk - Random Access Memories/04 - Café.mp3"

########################
# Misc / Non-Media
########################
mkdir -p "$BASE_DIR/Misc"
touch "$BASE_DIR/Misc/readme.txt"
touch "$BASE_DIR/Misc/cover.jpg"
touch "$BASE_DIR/Misc/subtitles.srt"
touch "$BASE_DIR/Misc/info.nfo"

########################
# Permissions test
########################
touch "$BASE_DIR/Movies/ReadOnly.Movie.2021.mkv"
chmod -w "$BASE_DIR/Movies/ReadOnly.Movie.2021.mkv"

echo "Test media library created under $BASE_DIR"
