#!/usr/bin/env bash
# Seeds 5,000 expenses into the local emulator, then scrolls the ledger
# end-to-end to prove it stays usable at that scale. See docs/03-expenses.md.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "perf: resetting and launching once to create the account…"
bash scripts/e2e.sh e2e/subflows/reset.yaml e2e/subflows/launch.yaml

echo "perf: seeding 5,000 expenses…"
npm run --silent seed -- --expenses 5000 --days 365

echo "perf: scrolling the ledger…"
bash scripts/e2e.sh e2e/flows/perf/expense-ledger-scroll-perf.yaml
