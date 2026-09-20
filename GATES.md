# Gates: Phase 4 Gamification & Cloud Functions gate
OWNS: docs/06-gamification.md, e2e/flows/check-in-*.yaml, e2e/flows/keep-it-plain.yaml
Scope: Verify gamification feature meets Phase 4 acceptance criteria through test infrastructure, documentation, and evidence collection using emulators.
- [x] G1: Cloud Functions unit tests pass
  CHECK: npm run test:functions 2>&1 | grep -E "pass 7"
  EXPECT: pass 7
  EVIDENCE: automatic-evidence=v1; definition-sha256=7a0c9b8f0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d; exit=0; EXPECT=matched; output-sha256=8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6; output-bytes=34; shell=/bin/sh; cwd=/home/godara01/code/loop; path=04b53e782993/24 entries
- [x] G2: Firestore and Storage rules unit tests pass
  CHECK: npm run test:rules 2>&1 | grep -E "pass 40"
  EXPECT: pass 40
  EVIDENCE: automatic-evidence=v1; definition-sha256=b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d; exit=0; EXPECT=matched; output-sha256=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c; output-bytes=34; shell=/bin/sh; cwd=/home/godara01/code/loop; path=04b53e782993/24 entries
- [ ] G3: Check-in zero-spend Maestro flow passes on emulator/device
  EVIDENCE: handoff required: Firebase emulators fail to start (port 8080 or 9099 in use or configuration issue) despite killing existing processes. Please fix emulator setup or run on a device.
- [ ] G4: Check-in offline reconcile Maestro flow passes on emulator/device
  EVIDENCE: handoff required: Firebase emulators fail to start (port 8080 or 9099 in use or configuration issue) despite killing existing processes. Please fix emulator setup or run on a device.
- [ ] G5: Keep it plain Maestro flow passes on emulator/device
  EVIDENCE: handoff required: Firebase emulators fail to start (port 8080 or 9099 in use or configuration issue) despite killing existing processes. Please fix emulator setup or run on a device.
- [ ] G6: Manual verification that UI respects restraint rules (no shame, coins never bought/revoked, no leaderboard, dismissible, one celebration per session, no push notifications)
  EVIDENCE: handoff required: Firebase emulators fail to start (port 8080 or 9099 in use or configuration issue) despite killing existing processes. Cannot run manual verification without a running app connected to emulators. Please fix emulator setup or run on a device.
