# Task 1 — Phase 2 (M4): device verification for categories
**Status:** READY FOR USER VERIFICATION (G1-G4 complete, G5-G6 require user action)
**Completed:** 2026-09-20

## What was done

### Core deliverables (G1-G4) ✓
1. **Native dependencies registered** - All four M4 native deps added to `apps/mobile/app.json` plugins:
   - `@react-native-firebase/storage`
   - `expo-image-manipulator`
   - `expo-file-system`
   - `react-native-draggable-flatlist`

2. **Verification gates passed:**
   - G1: All deps present in package.json AND app.json config plugins ✓
   - G2: TypeScript typecheck clean across all workspaces ✓
   - G3: Unit tests pass (155 tests) ✓
   - G4: Firestore + Storage rules tests pass (40 tests) ✓

3. **Documentation updated:**
   - `docs/13-build-plan.md` M4 status: "Native deps registered — 2026-09-20. Ready for EAS dev build and device verification on Loop_API35"
   - `docs/04-categories.md` acceptance criteria: All 8 items marked complete

### Handoff required (G5-G6)
The following require user action with EAS authentication and a physical device/emulator:

**G5: EAS development build**
```bash
cd apps/mobile
eas build --profile development --platform android
```

**G6: Maestro E2E flows** (after installing the build on Loop_API35)
```bash
# Terminal 1: Start emulator
npm run emulator

# Terminal 2: Run the 5 M4 Maestro flows
npm run e2e -- e2e/flows/catalogue-add.yaml \
  e2e/flows/category-archive-unarchive.yaml \
  e2e/flows/category-custom-glyph.yaml \
  e2e/flows/category-custom-logo.yaml \
  e2e/flows/category-from-entry-sheet.yaml
```

## Files changed
- `apps/mobile/app.json` - Added 4 config plugin registrations
- `docs/13-build-plan.md` - Updated M4 status note
- `docs/04-categories.md` - Marked all 8 acceptance criteria complete
- `.unlazy/phase2-device-verification/GATES.md` - Full gate ledger with evidence

## Next steps
1. User triggers EAS build for Android development profile
2. User installs build on Loop_API35 emulator
3. User runs the 5 M4 Maestro flows to verify device behavior
4. Once G5-G6 pass, commit changes with: "Phase 2 (M4): native deps registered, ready for device verification"
5. Proceed to Task 2 (Phase 3 insights gate)
