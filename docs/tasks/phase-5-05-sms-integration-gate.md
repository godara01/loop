# Task 9 — Phase 5 (M7): SMS integration gate & doc sign-off

**Depends on:** Task 8 (parser + native module + repository + UI all built)
**Blocks:** all of Phase 6 (Tasks 10–15)

## Objective

Close out Phase 5 the way `docs/15` closes every phase: full regression run,
acceptance criteria ticked, decisions recorded, one commit. This task doesn't
write new features — it's the branch-integration check across everything
Tasks 5–8 built, plus the privacy audit `docs/12` requires by name.

## Context

Read [`docs/12-sms-ingest.md#acceptance-criteria`](../12-sms-ingest.md) — this
task's job is to make every one of those checkboxes true with real evidence,
not to re-explain the feature (that's what Tasks 5–8 already did).

## Flow

1. Run the full phase gate from `docs/15`:
   - `npm run typecheck`, `npm test`, `npm run test:rules`, `npm run test:functions` — all green
   - Every Phase 5 Maestro flow from Task 8, twice in a row, from clean state
2. **Privacy audit** (this is the one check that needs its own careful pass,
   not just re-running Task 8's `sms-privacy` flow): after a real device
   session with SMS capture live, inspect every Firestore document, every
   Storage object, Crashlytics reports, and Analytics events for the user
   involved. Confirm none contains the raw SMS body anywhere, in any field,
   under any key. This is stated in `docs/12` as verified "by inspection of a
   real device session" — do the inspection, don't infer it from the rules
   tests alone (rules tests prove the schema rejects a `body` field; they
   don't prove nothing was logged elsewhere, e.g. in a debug log line or a
   Crashlytics breadcrumb).
3. Confirm the Play Store risk mitigations from `docs/12` are actually true in
   the code, not just planned: `remoteConfig.smsIngestEnabled = false` fully
   disables capture (re-verify end to end, not just Task 6's unit-level
   check), and an iOS build genuinely contains no SMS permission and no SMS
   code (build the iOS bundle if possible, or at minimum grep/inspect the
   platform-gated imports from Task 8).
4. Tick every acceptance criterion in `docs/12-sms-ingest.md`.
5. Add the Phase 5 / M7 status note to `docs/13-build-plan.md`, in the same
   style as the M2–M4 notes (date, what was verified, any decisions made along
   the way — e.g. if the `adb emu sms send` alphanumeric-sender fallback from
   Task 6 was needed, record that decision here).
6. Note in `docs/09-roadmap.md` (if not already there) that auto-categorisation
   (merchant memory, server classifier) remains explicitly post-MVP — confirm
   nothing built in Tasks 5–8 accidentally started on it (the schema fields
   `suggestedCategoryId` etc. should all still be null-always in this build).

## Edge cases to handle

- If any Phase 5 acceptance criterion can't be made true with the current
  approach (e.g. the Play declaration genuinely can't be tested pre-approval,
  since that's a real-world submission with its own timeline per `docs/13`'s
  "Two blockers to clear immediately"), don't force a checkbox — record it as
  an explicit open item in `docs/13-build-plan.md` instead of leaving it
  silently unticked with no explanation.
- If the privacy audit finds a leak (e.g. a stray `console.log(body)` left
  over from Task 5/6 debugging), fix it in this task, re-run the full gate,
  and note the fix in `docs/12`'s decisions.

## Files owned

`docs/12-sms-ingest.md` (tick criteria, record decisions),
`docs/13-build-plan.md` (M7 status note), `docs/09-roadmap.md` (confirm/note
auto-categorisation still deferred). Any bug fixes found during the privacy
audit go wherever the bug actually lives (parser, native module, repository,
or UI) — cross reference back to the owning task's file when you touch code
outside this task's normal ownership.

## Testing

Full phase gate: `npm run typecheck`, `npm test`, `npm run test:rules`,
`npm run test:functions`, all Phase 5 Maestro flows twice consecutively,
manual privacy audit against a real device/emulator session.

## Definition of done

- [ ] Full automated gate green (typecheck, unit, rules, functions)
- [ ] All Phase 5 Maestro flows green twice in a row
- [ ] Manual privacy audit complete with no raw SMS body found anywhere
- [ ] Kill switch and iOS-has-no-SMS-code both re-verified end to end
- [ ] Every acceptance criterion in `docs/12-sms-ingest.md` ticked or explicitly recorded as an open item with a reason
- [ ] `docs/13-build-plan.md` M7 status note added
- [ ] One commit, tagged as the close of Phase 5 in the commit message

## Working method

Use the `unlazy` skill. This is branch-integration work in `unlazy`'s
vocabulary — its gates should specifically test cross-leaf behavior (does the
UI's approve action actually trigger the Functions from M6 correctly end to
end, does the kill switch reach all the way from Remote Config to the native
listener) and regressions, not just re-assert each leaf's own gates.
