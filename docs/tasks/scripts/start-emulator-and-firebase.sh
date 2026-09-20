#!/usr/bin/env bash
set -euo pipefail

# Function to check if emulator is running
emulator_running() {
  adb devices | grep -q device
}

# Function to check if firebase emulators are running
firebase_running() {
  curl -s -o /dev/null --max-time 1 http://127.0.0.1:8080/ && \
  curl -s -o /dev/null --max-time 1 http://127.0.0.1:9099/
}

# Start emulator if not running
if ! emulator_running; then
  echo "Starting emulator..."
  # Run the emulator script in the background and wait for it to complete the boot process
  # The emulator script will start the emulator and wait until it's ready, then exit.
  # The emulator process will continue running in the background.
  npm run emulator > /tmp/emulator.log 2>&1 &
  EMULATOR_PID=$!
  # Wait for the emulator script to finish (it exits when the device is ready)
  wait $EMULATOR_PID || { echo "Emulator script failed"; exit 1; }
  echo "Emulator is ready."
else
  echo "Emulator is already running."
fi

# Start firebase emulators if not running
if ! firebase_running; then
  echo "Starting firebase emulators..."
  # Run the firebase emulators script in the background
  npm run firebase:emulators > /tmp/firebase.log 2>&1 &
  FIREBASE_PID=$!
  # Wait for both emulators to be ready
  echo "Waiting for firebase emulators to be ready..."
  until curl -s -o /dev/null --max-time 1 http://127.0.0.1:8080/; do
    sleep 1
  done
  until curl -s -o /dev/null --max-time 1 http://127.0.0.1:9099/; do
    sleep 1
  done
  echo "Firebase emulators are ready."
else
  echo "Firebase emulators are already running."
fi
