# Gates: Phase 4 Gamification & Cloud Functions gate
OWNS: docs/06-gamification.md, e2e/flows/check-in-*.yaml, e2e/flows/keep-it-plain.yaml
Scope: Verify gamification feature meets Phase 4 acceptance criteria through test infrastructure, documentation, and evidence collection using emulators.
- [x] G1: Cloud Functions unit tests pass
  CHECK: npm run test:functions 2>&1 | grep -E "pass 7"
  EXPECT: pass 7
  EVIDENCE: automatic-evidence=v1; definition-sha256=441b7747050e225d005110b4b7ddfc30832aa613a15b437d9bdb327e0ed89b99; exit=0; EXPECT=matched; output-sha256=36ee1a9c7aab981fa5b2d13ca8f4ce2c0ae40405236e91cffe8884ec0de4a1e4; output-bytes=11; shell=/bin/sh; cwd=/home/godara01/code/loop; path=04b53e782993/24 entries
- [x] G2: Firestore and Storage rules unit tests pass
  CHECK: npm run test:rules 2>&1 | grep -E "pass 40"
  EXPECT: pass 40
  EVIDENCE: automatic-evidence=v1; definition-sha256=122a9dcdc055c5596b8f6d10f8707d394228d23d74c7a6d2182f5c6260dd7fcc; exit=0; EXPECT=matched; output-sha256=0c049459790761507ec450957c5a72eb46dd875aa54f2dbd5f03c52cbde28f83; output-bytes=12; shell=/bin/sh; cwd=/home/godara01/code/loop; path=04b53e782993/24 entries
- [ ] G3: Check-in zero-spend Maestro flow passes on emulator/device
  EVIDENCE: handoff required: cannot run Maestro flows due to emulator setup issues (Metro/Auth emulator down). Please run on a device or fix emulator setup.
- [ ] G4: Check-in offline reconcile Maestro flow passes on emulator/device
  EVIDENCE: handoff required: cannot run Maestro flows due to emulator setup issues (Metro/Auth emulator down). Please run on a device or fix emulator setup.
- [ ] G5: Keep it plain Maestro flow passes on emulator/device
  EVIDENCE: handoff required: cannot run Maestro flows due to emulator setup issues (Metro/Auth emulator down). Please run on a device or fix emulator setup.
- [ ] G6: Manual verification that UI respects restraint rules (no shame, coins never bought/revoked, no leaderboard, dismissible, one celebration per session, no push notifications)
  EVIDENCE: handoff required: manual verification requires a device/emulator to check UI restraint rules.
