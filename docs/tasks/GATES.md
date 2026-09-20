# Gates: phase-3-01-insights-gate
OWNS: e2e/flows/insights-day-detail.yaml, e2e/flows/insights-timezone.yaml, e2e/flows/insights-period-persist.yaml, packages/shared/src/insights.ts, docs/05-insights.md, docs/13-build-plan.md
Scope: Verify and gap-fill the Insights feature (category-wise and day-wise) to meet Phase 3 gate requirements, including implementing intensityStep if missing, adding Maestro flows, performance testing, and ticking acceptance criteria.
- [ ] G1: intensityStep function is exported and returns 5 discrete steps relative to the period's max
  CHECK: npx tsx docs/tasks/scripts/verify-intensity-step.ts
  EXPECT: intensityStep verification passed
  EVIDENCE: pending
- [ ] G2: insights-fixture Maestro flow passes
  CHECK: npx maestro test e2e/flows/insights-fixture.yaml
  EXPECT: maestro test passed
  EVIDENCE: pending
- [ ] G3: insights-category-breakdown Maestro flow passes
  CHECK: npx maestro test e2e/flows/insights-category-breakdown.yaml
  EXPECT: maestro test passed
  EVIDENCE: pending
- [ ] G4: insights-day-wise-breakdown Maestro flow passes
  CHECK: npx maestro test e2e/flows/insights-day-wise-breakdown.yaml
  EXPECT: maestro test passed
  EVIDENCE: pending
- [ ] G5: performance test passes (render Insights with 3000 expenses under 300ms)
  CHECK: node scripts/verify-insights-performance.mjs
  EXPECT: performance verification passed
  EVIDENCE: pending
- [ ] G6: insights unit test suite passes
  CHECK: npm test -- --testPathPattern=packages/shared/src/__tests__/insights.test.ts
  EXPECT: test suite passed
  EVIDENCE: pending
- [ ] G7: typecheck passes
  CHECK: npm run typecheck
  EXPECT: typecheck passed
  EVIDENCE: pending
- [ ] G8: acceptance criteria in docs/05-insights.md are ticked
  EVIDENCE: pending
- [ ] G9: all required files have been created or updated as per the task
  CHECK: node scripts/verify-files.mjs
  EXPECT: files verification passed
  EVIDENCE: pending
