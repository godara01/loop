#!/usr/bin/env bash
# The whole code-level gate, in order, stopping at the first failure.
#   npm run test:all             typecheck → test → invariants → testids → a11y → rules → functions
#   npm run test:all -- --device also every Maestro flow + the MVP journey (the owner runs this:
#                                needs the Loop_API35 emulator, Metro, and `npm run firebase:emulators`)
# See TASKS.md H6 and docs/15-mvp-completion-plan.md#final-gate--full-mvp-integration-test.
set -uo pipefail

cd "$(dirname "$0")/.."

DEVICE=false
for arg in "$@"; do
  case "$arg" in
    --device) DEVICE=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

STEPS=(
  "typecheck|npm run typecheck"
  "unit tests|npm test"
  "invariants|npm run check:invariants"
  "testids|npm run check:testids"
  "a11y|npm run check:a11y -- --max 0"
  "security rules|npm run test:rules"
  "functions|npm run test:functions"
)

declare -a SUMMARY=()
START_ALL=$SECONDS

run_step() {
  local name="$1" cmd="$2" log start
  log="$(mktemp)"
  start=$SECONDS
  printf '▶ %-16s %s\n' "$name" "$cmd"
  if bash -c "$cmd" >"$log" 2>&1; then
    SUMMARY+=("✔ $name ($((SECONDS - start))s)")
    rm -f "$log"
    return 0
  fi
  SUMMARY+=("✖ $name ($((SECONDS - start))s)")
  echo "── $name failed; last 40 lines ──"
  tail -n 40 "$log"
  rm -f "$log"
  return 1
}

# Every flow runs through scripts/e2e-flow.mjs, which also delivers the SMS a
# flow declares (SMS_AFTER / SMS_SEND in its env:) and flips the Remote Config
# kill switch for the one flow that needs it off.
run_device() {
  local flow
  for flow in e2e/flows/*.yaml e2e/journeys/*.yaml; do
    run_step "$(basename "$flow" .yaml)" "node scripts/e2e-flow.mjs '$flow'" || return 1
  done
  return 0
}

status=0
for step in "${STEPS[@]}"; do
  if ! run_step "${step%%|*}" "${step#*|}"; then status=1; break; fi
done
if [ "$status" = 0 ] && [ "$DEVICE" = true ]; then
  run_device || status=1
fi

echo
echo "── test:all summary ($((SECONDS - START_ALL))s) ──"
printf '%s\n' "${SUMMARY[@]}"
[ "$status" = 0 ] && echo "ALL GREEN" || echo "FAILED"
exit "$status"
