#!/usr/bin/env bash
# Boots the Loop dev emulator and connects it to Metro.
# One-time setup and the reasoning behind every flag: docs/14-environment-setup.md.
set -euo pipefail

AVD="${LOOP_AVD:-Loop_API35}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# The emulator validates the SDK root by looking for platform-tools/, and refuses
# to start ("Cannot find AVD system path") if it cannot find one.
export ANDROID_SDK_ROOT="$ANDROID_HOME"
ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"
LOG="${TMPDIR:-/tmp}/loop-emulator.log"

if [ ! -x "$EMULATOR" ] || [ ! -x "$ADB" ]; then
  echo "Android SDK not found at $ANDROID_HOME — see docs/14-environment-setup.md" >&2
  exit 1
fi

serial() { "$ADB" devices | awk '/^emulator-[0-9]+\tdevice$/ {print $1; exit}'; }

if [ -z "$(serial)" ]; then
  echo "Booting $AVD…"
  # Qt misbehaves on native Wayland; route the emulator window through XWayland.
  # -no-snapshot: quickboot writes the whole guest RAM (~3 GB) to disk on exit.
  QT_QPA_PLATFORM=xcb nohup "$EMULATOR" -avd "$AVD" -gpu host -no-snapshot \
    -no-boot-anim -no-audio >"$LOG" 2>&1 &
  for _ in $(seq 1 180); do
    s="$(serial)"
    if [ -n "$s" ] && [ "$("$ADB" -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      break
    fi
    sleep 1
  done
fi

SERIAL="$(serial)"
if [ -z "$SERIAL" ]; then
  echo "Emulator did not boot within 3 minutes. Log: $LOG" >&2
  exit 1
fi
echo "Emulator ready: $SERIAL"

# The device's localhost:8081 is forwarded to this machine. Lost on every reboot,
# so it is re-applied every run.
"$ADB" -s "$SERIAL" reverse tcp:8081 tcp:8081 >/dev/null

if ! "$ADB" -s "$SERIAL" shell pm path com.getter.loop >/dev/null 2>&1; then
  echo "Loop dev build is not installed. Install the latest development APK:"
  echo "  $ADB -s $SERIAL install -r <path-to-apk>"
  exit 0
fi

if curl -s --max-time 2 http://127.0.0.1:8081/status | grep -q running; then
  "$ADB" -s "$SERIAL" shell am start -a android.intent.action.VIEW \
    -d "exp+loop://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" >/dev/null
  echo "Opened Loop against Metro on localhost:8081"
else
  echo "Metro is not running — start it with: npm run mobile"
fi
