#!/usr/bin/env bash
# Local Firebase — Auth, Firestore, Functions and Storage emulators — with data
# kept between runs.
# The app uses them when apps/mobile/.env sets EXPO_PUBLIC_USE_EMULATORS=true.
set -euo pipefail
cd "$(dirname "$0")/.."

DATA=.firebase/emulator-data
mkdir -p "$DATA"
# Functions run from the esbuild bundle (it inlines @loop/shared, whose entry
# point is TypeScript source Node cannot load on its own).
npm run build -w @loop/functions >/dev/null

ARGS=(--only auth,firestore,functions,storage --export-on-exit="$DATA")
# --import refuses an empty directory, so only pass it once there is an export.
[ -f "$DATA/firebase-export-metadata.json" ] && ARGS+=(--import="$DATA")

exec firebase emulators:start "${ARGS[@]}"
