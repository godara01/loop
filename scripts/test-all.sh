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

# Delivers the SMS a flow declares in its `env:` block (SMS_SENDER, SMS_BODY,
# SMS_BODY_2) while the flow waits for it. Delays are tuned in D6.
send_flow_sms() {
  local flow="$1"
  node -e '
    const { parseAllDocuments } = require("yaml");
    const env = parseAllDocuments(require("fs").readFileSync(process.argv[1], "utf8"))[0].toJS().env || {};
    for (const key of ["SMS_BODY", "SMS_BODY_2"]) if (env[key]) console.log(env.SMS_SENDER + "\t" + env[key]);
  ' "$flow" | {
    local delay="${SMS_FIRST_DELAY:-45}"
    while IFS=$'\t' read -r sender body; do
      sleep "$delay"
      adb emu sms send "$sender" "$body" >/dev/null
      delay="${SMS_NEXT_DELAY:-60}"
    done
  }
}

run_device() {
  local failed=0 flow
  for flow in e2e/flows/*.yaml e2e/journeys/*.yaml; do
    send_flow_sms "$flow" &
    local sender=$!
    if ! run_step "$(basename "$flow" .yaml)" "maestro test '$flow'"; then failed=1; fi
    kill "$sender" 2>/dev/null
    wait "$sender" 2>/dev/null
    [ "$failed" = 1 ] && return 1
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
