#!/usr/bin/env bash
# #BUG-0004: turn build/screenshots/NN-*.png into build/screenshots/demo.gif (one frame per scene).
set -euo pipefail

dir="$(cd "$(dirname "$0")/../.." && pwd)/build/screenshots"
seconds_per_frame="${SECONDS_PER_FRAME:-2.5}"
width="${GIF_WIDTH:-960}"

cd "$dir"
palette="$(mktemp --suffix=.png)"
trap 'rm -f "$palette"' EXIT

framerate="$(awk "BEGIN { print 1 / $seconds_per_frame }")"
input=(-framerate "$framerate" -pattern_type glob -i '[0-9][0-9]-*.png')
scale="scale=${width}:-1:flags=lanczos"

ffmpeg -v error -y "${input[@]}" -vf "$scale,palettegen=stats_mode=diff" "$palette"
ffmpeg -v error -y "${input[@]}" -i "$palette" \
  -lavfi "$scale [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" -loop 0 demo.gif
echo "wrote $dir/demo.gif"
