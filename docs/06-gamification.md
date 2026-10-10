# 06 — Gamification (Streak, Check-in, Coins)

## Position

Gamification exists to defend one habit: **open the app and log**. It is not a
feature users came for, and it must never become the reason they leave.

The design target is *a Duolingo streak's stickiness without a Duolingo owl's
neediness*. Concretely: a streak, a daily check-in, and coins. Nothing that
guilts, nothing that compares you to strangers.

## Restraint rules

Hard constraints. A mechanic that violates one does not ship, however well it
tests.

1. **No shame.** No red X on a missed day, no "you let your streak die" copy, no
   loss-aversion notifications. A broken streak is stated once, plainly.
2. **Coins are earned, never bought.** No IAP, no purchase path, ever.
3. **Coins are never revoked.** Deleting an expense, editing one, or archiving a
   category never reduces a balance. Otherwise the ledger becomes something to
   game rather than something to trust.
4. **Nothing is a leaderboard.** No ranking against other users, including inside
   groups when groups ship.
5. **All of it is dismissible.** A single **Keep it plain** switch in **You**
   hides the coin balance, the streak capsule, and every celebration. The ledger
   keeps accruing, so toggling back loses nothing.
6. **At most one celebration per app session**, and never mid-entry.
7. **No push notifications in v1, and never about the streak.** From v1.4 the
   only notifications are **opt-in**: one daily reminder at a user-chosen hour
   with neutral copy that never mentions the streak, coins or amounts, a
   recurring-due reminder, and squad activity ([25](25-notifications.md)).
   Streak-loss warnings, reward pings and re-engagement nags are banned
   permanently.

## Daily check-in

The only ritual in the app.

- Orbit shows a **check-in plate** for the current local day if it has not been
  banked yet.
- Pressing it banks the day: `streakAdvance` haptic, the streak capsule springs,
  coins are awarded.
- **Logging an expense auto-checks-in that day.** There is exactly one streak and
  it means "you engaged with your money today". A user who logs never has to
  press the plate.
- **Approving an SMS-derived expense also banks the day** — the user opened the
  app and made a decision. The *arrival* of the message does not
  ([12-sms-ingest.md](12-sms-ingest.md#approval-streaks-and-coins)).
- Checking in on a **zero-spend day** is explicitly valuable, labelled *"Zero-spend
  day banked"*, and earns a bonus. A tracker that only rewards spending is
  backwards.
- Idempotent by construction: the check-in document id **is** the local date
  ([11-firebase.md](11-firebase.md#idempotency)).

The streak maths already exists as pure functions in
[`streak.ts`](../packages/shared/src/streak.ts) — `recordActivity()`,
`isStreakBroken()`, `todayISO()`. The client predicts with them and the Cloud
Function commits with them. Same code, so the numbers cannot diverge.

## Streaks

| Rule | Behaviour |
|---|---|
| Advance | First check-in, expense, or SMS approval of a local day → `current + 1` |
| Continue | Only if the previous banked day was **exactly** yesterday (`daysBetween === 1`) |
| Break | A gap of 2+ days resets `current` to 1 on the next activity. `longest` is never reduced. |
| Display | `StreakCapsule` on Orbit and You. A broken streak shows `1` and one muted line: *"Streak restarted."* |

**No streak freezes, repairs, or purchasable saves.** They reward anxiety and
turn a habit signal into a currency. If retention data demands a safety net, the
mechanic to add is one **free, automatic, silent** grace day per month.

Streak state lives at `users/{uid}/streak` and is **written by the Function**, not
the client. The client shows its own optimistic prediction immediately and
reconciles when the write lands — they agree, because both ran the same code.

### Backdating

Logging an expense with a past `occurredAt` **does not** retroactively fill a
streak day and does not award that day's coins. Streak days are awarded for
engagement on the day, not for data describing it. Stated in the UI the first
time a user backdates: *"Streaks count the day you log, not the day you spent."*

Editing an expense's date never changes streak or coins
([03-expenses.md](03-expenses.md#edit-expense)).

**"The day you log" is the device's local date at creation.** From v1.1 the
client writes `createdLocalDate` on every new transaction, and `onExpenseWrite`
compares `localDate < createdLocalDate`. v1 compared against
`localDateOf(createdAt)` computed **on the Function server, which runs in UTC**.
A user west of UTC logging in the evening, or east of UTC logging just after
midnight, was wrongly treated as backdated (no check-in, no coins), or wrongly
not backdated. Documents without `createdLocalDate` (v1) keep the old comparison.

## What counts

**From v1.2.** With transaction kinds, sources and squad mirrors, *"logging an
expense banks the day"* needs a precise table. `onExpenseWrite` implements it
exactly, with a Functions test per cell. The rule of thumb: **the user's own
deliberate money decision today banks the day. Only a personal expense earns
logging coins.**

| What was written | Banks the day (check-in) | `expense_logged` + `categorised` coins | `first_expense` |
|---|---|---|---|
| Manual `expense`, today | **Yes** | **Yes** (caps apply) | Yes, if first |
| Manual `income`, today | **Yes** | No | No |
| Manual `refund`, today | **Yes** | No | No |
| Manual `transfer` | No, bookkeeping | No | No |
| SMS approval: expense | **Yes** | **Yes** | Yes, if first |
| SMS approval: income / refund / transfer | Yes / Yes / No | No | No |
| Recurring approval (`recurringId` set), any kind | **Yes** | **No**, a daily rule would farm coins ([20](20-recurring.md#coins-and-streak)) | No |
| Squad entry **I created**, today | **Yes**, written by **my client** as `checkIns/{today}` in the same batch, because the Function can't tell who in the squad acted | No | No |
| Squad **mirror** (`source: 'group'`) | **No** | **No** | No |
| Import (`source: 'import'`) | **No** | **No** | No |
| Any backdated write (`localDate < createdLocalDate`) | No | No | No |
| Any update or soft delete | No | No | No |

**Zero-spend day** ([below](#rules)) means *no `kind: 'expense'` documents with
amount > 0 that count toward spend*, own or mirrored, on that local date.
Income, refunds, transfers, loans, settlements, excluded mirrors and zero-share
mirrors **don't** break it. A day where a squad-mate logged a dinner you shared is
**not** zero-spend, which is honest.

**`categorised`** is decided by looking up the category: its slug is not `OTHER`
or `OTHER_IN`. v1 used a string match on the id containing "other", which a
custom category like "Mother's Day" would trip.

## Coins

A small, legible economy. Every award is a row in an **append-only coin ledger**
at `users/{uid}/coinLedger`, carrying its rule id, so **You → Coins** can always
answer "where did that come from". The running balance lives at
`users/{uid}/wallet`.

### The ledger

```ts
interface CoinLedgerEntry {
  readonly id: string;          // deterministic — see idempotency below
  readonly ruleId: CoinRuleId;
  readonly coins: number;       // always positive; nothing debits in v1
  readonly localDate: string;   // YYYY-MM-DD
  readonly refId: string | null;// expense id, category id, etc.
  readonly createdAt: string;
}
```

- **Append-only.** No entry is ever updated or deleted. The balance is by
  definition the sum of the ledger, and a Function can rebuild `wallet` from it
  at any time. If they ever disagree, the ledger wins.
- **Written only by Cloud Functions.** Security rules deny all client writes to
  `coinLedger` and `wallet` ([11-firebase.md](11-firebase.md#trust-boundary)).
  Coins are a score today and could be spendable tomorrow; making them
  server-authoritative now closes the "edit local data, mint coins" class of
  attack before it opens.
- **Idempotent ids**: `${ruleId}__${localDate}` for daily-capped rules,
  `${ruleId}__${refId}` for per-object rules. A Function retry overwrites rather
  than duplicates.

### Rules

| Rule id | Trigger | Coins | Cap |
|---|---|---|---|
| `check_in` | First check-in, expense, or approval of a local day | **5** | 1×/day |
| `zero_spend` | Check-in on a day that ends with no expenses | **3** | 1×/day |
| `expense_logged` | Each personal expense saved or approved (not recurring, import or mirror, see [What counts](#what-counts)) | **2** | 3×/day (max 6) |
| `categorised` | Expense saved with a non-`OTHER` category | **1** | 3×/day (max 3) |
| `week_complete` | 7 consecutive banked days | **25** | 1× per completed run |
| `first_expense` | The very first expense ever | **10** | Once |
| `first_custom_category` | First user-created category | **5** | Once |

Realistic ceiling: ~15 coins on an ordinary day, ~40 on a week-closing day. The
numbers are deliberately small and round — they exist to be *noticed*, not
optimised.

Rule definitions and cap evaluation live in `packages/shared/src/coins.ts` as
pure functions, so the Function that awards and the UI that previews are the same
logic.

### What coins are for

In v1: **nothing.** They are a visible record of consistency, and that is the
entire mechanic. This is deliberate — a spendable currency in v1 would need a
shop, a balance economy, and a fraud story, all before the core ledger has proven
itself.

The ledger is built server-authoritative and append-only precisely so that coins
*can* become spendable later (a cosmetic unlock, a group perk) without a
migration or a trust problem. Any such feature is a separate product decision,
recorded in [09-roadmap.md](09-roadmap.md), not a v1 assumption.

### Presentation

- A `+7` chip animates up from the save plate, ~600ms, then fades. It shows the
  client's optimistic prediction and settles silently when the Function's write
  arrives. If the server disagrees, the server wins with no error UI — the number
  simply corrects.
- Orbit shows the balance in mono next to the streak capsule.
- **You → Coins** lists every entry with date, rule label, amount, newest first.
- **No levels, badges, tiers or titles in v1.** Coins are a running total. Levels,
  if they ever ship, are a *label* over the same total, never a second currency.

## Celebrations

Reanimated + Skia, all on the UI thread, all skippable.

| Moment | Visual | Haptic |
|---|---|---|
| Day banked | Streak capsule spring + segments light | `streakAdvance` |
| 7-day milestone | Brief lime particle burst behind the capsule, ≤ 900ms | `streakAdvance` |
| 30 / 100 days | Same burst, denser | `streakAdvance` |
| Coins awarded | `+N` chip rise | none — the save already fired `expenseSaved` |

A celebration MUST NOT delay navigation or block a tap. If a burst is animating
when the user taps, the tap wins.

## Haptics

| Action | Event |
|---|---|
| Press the check-in plate | `press`, then `streakAdvance` on success |
| Day banked via expense save | `expenseSaved`, then `streakAdvance` after the sheet dismisses |
| Milestone reached | `streakAdvance` |
| Toggling **Keep it plain** | `toggleOn` / `toggleOff` |

Never fire two haptics within 150ms — see [07-haptics.md](07-haptics.md#sequencing).

## Acceptance criteria

- [x] Checking in twice in one local day produces one check-in doc and one
      `check_in` ledger entry, enforced by document id.
      (proof: tests/functions/functions.test.ts › "double check-in creates one check_in ledger entry and awards zero-spend bonus if no expenses")
- [x] Logging 10 expenses in a day awards at most 6 `expense_logged` coins.
      (proof: tests/functions/functions.test.ts › "10 expenses in a day awards at most 6 expense_logged coins (capped at 3) and 3 categorised coins")
- [x] A client cannot write `coinLedger` or `wallet` — proven by a rules test.
      (proof: tests/firestore-rules/rules.test.ts › "lets the owner read their wallet but never write it" and "lets the owner read their coin ledger entry but never write it")
- [ ] `wallet.coinBalance` always equals the sum of the ledger; a rebuild is a
      no-op.
- [ ] Deleting every expense on a banked day leaves the streak and coins intact.
- [x] A backdated expense does not fill a past streak day.
      (proof: tests/functions/functions.test.ts › "backdated expense does not create a check-in or award past coins")
- [x] Offline: the streak and `+N` chip update instantly and reconcile on
      reconnect with no visible correction in the normal case.
      (proof: e2e/flows/check-in-offline-reconcile.yaml on Loop_API35, 2026-09-27 —
      plate and "1 day streak" instant in airplane mode, survive a relaunch,
      and read the same after sync with exactly one check-in doc. The `+N`
      chip is set in the same handler; it lives 600ms, too short to assert.)
- [x] **Keep it plain** hides the capsule, balance, chips and bursts, and no
      gamification haptic fires while it is on.
      (proof: e2e/flows/keep-it-plain.yaml on Loop_API35, 2026-09-27 — capsule and
      balance hidden, still hidden after a new expense, back on toggle-off;
      haptics.ts drops `streakAdvance` while it is on, per docs/07. Felt on a
      device in M8.)
- [x] The app has zero push notifications registered.
      (proof: scripts/check-invariants.mjs rule 5 "mobile-no-push-registration")
