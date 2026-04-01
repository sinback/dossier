#!/usr/bin/env bash
# snap.sh — draw something on the canvas, screenshot it, save as for_claude.png
#
# Usage:
#   ./snap.sh                          # just screenshot the canvas (no draw)
#   ./snap.sh clear                    # clear canvas, then screenshot
#   ./snap.sh text "Hello world"       # draw text, wait, screenshot
#   ./snap.sh text "Hello" --size 48   # draw text with extra curl JSON fields
#   ./snap.sh file payload.json        # send a raw JSON file as draw command
#
# Focuses the Firefox window via hyprctl, then screenshots it with hyprshot.

set -euo pipefail

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$PROJ_DIR/for_claude.png"
API="http://localhost:3000/api/draw"
WAIT_MS=3000  # default ms to wait for animation before screenshot

# --- Parse arguments ---
ACTION="${1:-snap}"
shift || true

case "$ACTION" in
  refresh)
    echo "Hard-refreshing Firefox..."
    hyprctl dispatch focuswindow class:firefox > /dev/null 2>&1
    sleep 0.3
    wtype -M ctrl -M shift -k r -m shift -m ctrl
    sleep 1.5
    hyprctl dispatch focuswindow class:kitty > /dev/null 2>&1
    echo "Done."
    exit 0
    ;;
  clear)
    echo "Clearing canvas..."
    curl -s -X DELETE "$API" > /dev/null
    sleep 0.5
    ;;

  text)
    CONTENT="${1:?Usage: snap.sh text \"your text\" [--size N] [--font F]}"
    shift

    # Build JSON, starting with defaults
    SIZE=32
    FONT="Caveat"
    REGION='{"x":20,"y":20,"width":700,"height":400}'
    COLOR='{"r":30,"g":38,"b":58}'
    WAIT_MS=3000
    GLYPHS=true
    VELOCITY="power-law"

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --size)       SIZE="$2"; shift 2 ;;
        --font)       FONT="$2"; shift 2 ;;
        --region)     REGION="$2"; shift 2 ;;
        --color)      COLOR="$2"; shift 2 ;;
        --wait)       WAIT_MS="$2"; shift 2 ;;
        --no-glyphs)  GLYPHS=false; shift ;;
        --velocity)   VELOCITY="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
      esac
    done

    JSON=$(cat <<EOF
{"type":"text","content":"$CONTENT","size":$SIZE,"font":"$FONT","glyphs":$GLYPHS,"velocity":"$VELOCITY","region":$REGION,"color":$COLOR}
EOF
    )

    echo "Drawing: $CONTENT"
    curl -s -X POST "$API" -H "Content-Type: application/json" -d "$JSON" > /dev/null
    echo "Waiting ${WAIT_MS}ms for animation..."
    sleep "$(( WAIT_MS / 1000 )).$(( WAIT_MS % 1000 ))"
    ;;

  file)
    FILE="${1:?Usage: snap.sh file payload.json}"
    echo "Sending: $FILE"
    curl -s -X POST "$API" -H "Content-Type: application/json" -d @"$FILE" > /dev/null
    echo "Waiting ${WAIT_MS}ms for animation..."
    sleep "$(( WAIT_MS / 1000 )).$(( WAIT_MS % 1000 ))"
    ;;

  snap)
    # Just screenshot, no draw command
    ;;

  *)
    echo "Unknown action: $ACTION" >&2
    echo "Usage: snap.sh [snap|clear|text|file] [args...]" >&2
    exit 1
    ;;
esac

# --- Screenshot the Firefox window ---
# Focus Firefox, brief pause for compositor, then capture active window
echo "Taking screenshot..."
hyprctl dispatch focuswindow class:firefox > /dev/null 2>&1
sleep 0.3
# hyprshot exits non-zero with -s (silent) even on success, so check the file instead
hyprshot -m window -m active -o "$PROJ_DIR" -f for_claude.png -s 2>/dev/null || true

if ! [[ -f "$OUT" ]] || ! [[ "$(find "$OUT" -mmin -0.1 2>/dev/null)" ]]; then
  echo "Could not screenshot Firefox. Is it open?" >&2
  exit 1
fi

# --- Crop to just the canvas (the large bright rectangle) ---
FULL="$PROJ_DIR/_snap_full.png"
mv "$OUT" "$FULL"

# Find the largest bright blob via connected-components analysis
BBOX=$(magick "$FULL" \
  -colorspace Gray -threshold 55% \
  -morphology Close Disk:5 \
  -define connected-components:verbose=true \
  -define connected-components:area-threshold=10000 \
  -connected-components 8 \
  -format "%c" info: 2>&1 \
  | grep "gray(255)" \
  | sort -t' ' -k4 -rn \
  | head -1 \
  | grep -oP '\d+x\d+\+\d+\+\d+')

if [[ -n "$BBOX" ]]; then
  # Parse WxH+X+Y and inset by 5px to skip rounded corners
  IFS='x+' read -r W H X Y <<< "$BBOX"
  X=$(( X + 5 ))
  Y=$(( Y + 5 ))
  W=$(( W - 10 ))
  H=$(( H - 10 ))
  magick "$FULL" -crop "${W}x${H}+${X}+${Y}" +repage "$OUT"
  echo "Saved: $OUT (${W}x${H}, cropped from canvas)"
else
  # Fallback: keep the full screenshot
  mv "$FULL" "$OUT"
  echo "Saved: $OUT (full window — could not detect canvas)"
fi

rm -f "$FULL"

# Return focus to kitty so the user can keep typing
hyprctl dispatch focuswindow class:kitty > /dev/null 2>&1
