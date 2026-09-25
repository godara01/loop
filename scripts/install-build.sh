#!/usr/bin/env bash
# Downloads an EAS build artifact, verifies it is actually a development client
# before trusting it, and installs it over adb.
#
#   bash scripts/install-build.sh <build-id>
#
# The verification step exists because a build made from a stale git index can
# silently produce a plain release-shaped binary with no dev launcher — see
# docs/14-environment-setup.md's "does not match what is on disk" entry. Do not
# skip it just because the build "said" development in its profile name.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_ID="${1:?usage: install-build.sh <build-id>}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL="${LOOP_SERIAL:-emulator-5554}"
SCRATCH="${TMPDIR:-/tmp}/loop-build-$BUILD_ID"
mkdir -p "$SCRATCH"

echo "install-build: fetching artifact URL for $BUILD_ID…"
URL=$(cd apps/mobile && eas build:view "$BUILD_ID" --json | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const b=JSON.parse(s);
    if (b.status !== "FINISHED") { console.error("build status is " + b.status + ", not finished"); process.exit(1); }
    console.log(b.artifacts.buildUrl);
  });
')

APK="$SCRATCH/loop-dev.apk"
echo "install-build: downloading…"
curl -sL --max-time 600 -o "$APK" "$URL"
SIZE=$(stat -c %s "$APK")
echo "install-build: downloaded $((SIZE / 1024 / 1024)) MB"

MARKERS=$(unzip -l "$APK" | grep -c "dev_menu_fab_icon" || true)
if [ "$MARKERS" -eq 0 ]; then
  echo "install-build: REFUSING TO INSTALL — no dev-menu marker in this APK." >&2
  echo "  This is not a development-client build. See docs/14 troubleshooting." >&2
  exit 1
fi
echo "install-build: verified — $MARKERS dev-menu marker(s) found"

"$ADB" -s "$SERIAL" install -r "$APK"
echo "install-build: installed on $SERIAL"
