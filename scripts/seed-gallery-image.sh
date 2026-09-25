#!/usr/bin/env bash
# Puts a real photo in the emulator's gallery so a Maestro flow can pick one —
# used by category-custom-logo.yaml, which exercises the actual upload pipeline
# (pick → crop → resize → Storage) rather than just its pieces in isolation.
#
# A screenshot of the device's own current screen is used as the "photo": it's
# a real JPEG/PNG with real dimensions, needs no image library on this machine,
# and needs no network fetch.
set -euo pipefail
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL="${LOOP_SERIAL:-emulator-5554}"
DEST=/sdcard/Pictures/loop-e2e-logo.png

"$ADB" -s "$SERIAL" shell screencap -p "$DEST"
"$ADB" -s "$SERIAL" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$DEST" >/dev/null
echo "seeded $DEST"
