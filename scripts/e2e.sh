#!/usr/bin/env bash
# Runs Maestro flows against the Loop_API35 emulator.
#   npm run e2e                      every flow in e2e/flows
#   npm run e2e -- e2e/flows/x.yaml  one flow
# Needs: npm run firebase:emulators, npm run mobile, npm run emulator.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# Maestro's launcher is a JVM app and does not infer JAVA_HOME on its own.
# A JAVA_HOME left over from an uninstalled JDK is worse than none: ignore it.
[ -x "${JAVA_HOME:-}/bin/java" ] || unset JAVA_HOME
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")}"
ADB="$ANDROID_HOME/platform-tools/adb"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
SERIAL="${LOOP_SERIAL:-emulator-5554}"

fail() { echo "e2e: $*" >&2; exit 1; }
up() { curl -s -o /dev/null --max-time 2 "$1"; }
# Waits up to 60s: a supervised emulator suite may be mid-restart.
waitup() { for _ in $(seq 1 30); do up "$1" && return 0; sleep 2; done; return 1; }

[ -x "$MAESTRO" ] || fail "Maestro not found at $MAESTRO"
"$ADB" devices | grep -q "^$SERIAL[[:space:]]*device" || fail "$SERIAL not attached — npm run emulator"
waitup http://127.0.0.1:8080/ || fail "Firestore emulator down — npm run firebase:emulators"
waitup http://127.0.0.1:9099/ || fail "Auth emulator down — npm run firebase:emulators"
curl -s --max-time 2 http://127.0.0.1:8081/status | grep -q running || fail "Metro down — npm run mobile"

# Lost on every emulator reboot and every `adb root`.
"$ADB" -s "$SERIAL" reverse tcp:8081 tcp:8081 >/dev/null
# Heads-up notifications (an injected SMS lands in Messages too) cover the top
# of the screen, where Orbit's inbox badge is.
"$ADB" -s "$SERIAL" shell settings put global heads_up_notifications_enabled 0

TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(e2e/flows)
exec "$MAESTRO" --device "$SERIAL" test "${TARGETS[@]}"
