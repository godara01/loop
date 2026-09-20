#!/usr/bin/env bash
set -euo pipefail

FLOW_FILE="$1"

# Kill any existing emulator and firebase processes
pkill -f emulator || true
pkill -f firebase || true

# Start emulator and wait for it to be ready
echo "Starting emulator..."
./scripts/emulator.sh > /tmp/emulator.log 2>&1 &
EMULATOR_PID=$!
wait $EMULATOR_PID || { echo "Emulator script failed"; exit 1; }
echo "Emulator is ready."

# Start firebase emulators in the background
echo "Starting firebase emulators..."
npm run firebase:emulators > /tmp/firebase.log 2>&1 &
FIREBASE_PID=$!

# Wait for firebase emulators to be ready
echo "Waiting for firebase emulators..."
until curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080/; do
  sleep 1
done
until curl -s -o /dev/null --max-time 2 http://127.0.0.1:9099/; do
  sleep 1
done
echo "Firebase emulators are ready."

# Run the maestro test
echo "Running maestro test for $FLOW_FILE"
npx maestro test "$FLOW_FILE"
RESULT=$?

# Teardown
echo "Stopping firebase emulators..."
kill $FIREBASE_PID 2>/dev/null || true
echo "Stopping emulator..."
# Note: the emulator script does not leave a running emulator process? Actually, the emulator script starts the emulator in the background and then waits for it to be ready and then exits.
# But the emulator process is still running. We need to stop it.
# We'll use the adb command to kill the emulator by its serial.
SERIAL=$(adb devices | grep -m1 device | awk '{print $1}')
if [ -n "$SERIAL" ]; then
  adb -s $SERIAL emu kill
fi
pkill -f emulator || true

exit $RESULT
