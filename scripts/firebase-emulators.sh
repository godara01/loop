#!/usr/bin/env bash
# Local Firebase — Auth and Firestore emulators — with data kept between runs.
# The app uses them when apps/mobile/.env sets EXPO_PUBLIC_USE_EMULATORS=true.
set -euo pipefail
cd "$(dirname "$0")/.."

DATA=.firebase/emulator-data
mkdir -p "$DATA"
ARGS=(--only auth,firestore --export-on-exit="$DATA")
# --import refuses an empty directory, so only pass it once there is an export.
[ -f "$DATA/firebase-export-metadata.json" ] && ARGS+=(--import="$DATA")

exec firebase emulators:start "${ARGS[@]}"
