#!/usr/bin/env bash
#
# r1-capture-session.sh — guided R1 ring BLE capture session.
#
# Runs on your computer (Linux/macOS, or Windows via WSL/Git Bash) while the
# phone captures a Bluetooth HCI snoop log. It walks you through each action and
# stamps the exact start/end wall-clock time to a timeline file, so the captured
# packets can be lined up against what you did. See docs/r1-ring-capture-guide.md.
#
# It does NOT touch the phone — you drive the ring/app by hand; this just records
# timing. Keep the phone and this computer on automatic network time so their
# clocks agree (we only need ~1-2s accuracy because actions are spaced out).
#
# Usage:  bash tools/r1-capture-session.sh
#
set -euo pipefail

TIMELINE="${1:-r1-timeline.txt}"

# Edit this list to match the gestures YOUR ring actually has.
# R1 inputs (per owner): slide up, slide down, tap, double tap, long press.
GESTURES=(
  "tap"
  "double tap"
  "long press"
  "slide up"
  "slide down"
)

stamp() { date '+%Y-%m-%d %H:%M:%S'; }
log()   { printf '%s  %s\n' "$(stamp)" "$1" | tee -a "$TIMELINE"; }
pause() { read -r -p "$1" _; }

echo "=== R1 capture session — writing timeline to: $TIMELINE ==="
echo
echo "Before you start, confirm ALL of these:"
echo "  [ ] Ring is ON YOUR FINGER (health sensors need skin contact)"
echo "  [ ] Official Even app is open and connected to ring + G2"
echo "  [ ] Phone: Developer options > 'Enable Bluetooth HCI snoop log' = Full"
echo "  [ ] Phone: you toggled Bluetooth OFF then ON after enabling the log"
echo "  [ ] Phone is plugged into this computer and 'adb devices' shows it"
echo
pause "Press Enter when all boxes are checked... "
: > "$TIMELINE"
log "SESSION START"

echo
echo "--- 1. Idle baseline (sit still, do nothing) ---"
pause "Press Enter to START the 30s idle baseline... "
log "idle baseline START"
echo "Sitting idle... (waiting 30s)"
sleep 30
log "idle baseline END"

echo
echo "--- 2. Gestures (the priority) ---"
echo "For each gesture: do it 5 times, ~3s apart, slowly and deliberately."
echo "Make the G2 visibly react if you can, so we know the gesture registered."
for g in "${GESTURES[@]}"; do
  echo
  pause "Press Enter, THEN perform '$g' 5 times... "
  log "gesture '$g' START (x5)"
  pause "  ...press Enter when you've finished the 5 reps of '$g'... "
  log "gesture '$g' END"
  echo "  (pause ~10s before the next gesture)"
  sleep 10
done

echo
echo "--- 3. Health sync ---"
pause "Press Enter, THEN trigger a manual health sync / open the health screen... "
log "health sync START"
pause "  ...wait ~30s for it to pull data, then press Enter... "
read -r -p "  If a live HR is shown on screen, type it (e.g. 72), else just Enter: " HR || true
log "health sync END (on-screen HR=${HR:-none})"

echo
echo "--- 4. Wear off/on (optional, surfaces wear-detection) ---"
read -r -p "Do the wear off/on test? [y/N] " DOWEAR || true
if [[ "${DOWEAR:-n}" =~ ^[Yy]$ ]]; then
  pause "Press Enter, THEN take the ring OFF for ~10s, then put it back ON... "
  log "wear off/on START"
  pause "  ...press Enter when the ring is back on... "
  log "wear off/on END"
fi

log "SESSION END"
echo
echo "=== Done. Timeline saved to: $TIMELINE ==="
echo "Next: on the phone, run  adb bugreport r1-capture.zip"
echo "Then send me BOTH r1-capture.zip and $TIMELINE."
