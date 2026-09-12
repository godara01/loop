# 14 — Environment Setup (M0)

Getting from a fresh clone to a development build running on a physical device,
talking to Firebase project **`loop-app-0403`**.

This is the M0 milestone from [13-build-plan.md](13-build-plan.md). Its only
goal is to prove the toolchain works before there is feature code to debug
alongside it.

## Already done in the repo

Nothing below needs redoing — it is committed.

| | |
|---|---|
| `@react-native-firebase/app`, `auth`, `firestore` | installed, config plugins registered in `app.json` |
| `expo-dev-client`, `expo-build-properties` | installed; iOS set to `useFrameworks: static`, which RNFirebase requires |
| `apps/mobile/eas.json` | `development` / `preview` / `production` profiles |
| `.firebaserc` | points at `loop-app-0403` |
| `firebase.json` | Firestore rules + indexes paths, emulator ports |
| `firestore.rules` | the v1 trust boundary from [11-firebase.md](11-firebase.md) |
| `firestore.indexes.json` | the four composite indexes v1 queries need |
| `.gitignore` | excludes `google-services.json` and `GoogleService-Info.plist` |
| **You → Build** card | reports whether the native SDK is linked, and which project |

## Step 1 — Firebase console

Project **`loop-app-0403`**, at <https://console.firebase.google.com>.

### 1a. Check the Firestore region *before anything else*

**A Firestore database's location is permanent.** If this project already has a
database in a region far from your users, that is the one thing here worth
starting a fresh project over — everything else is reconfigurable.

- Firestore Database → if none exists, **Create database** → *Production mode* →
  location **`asia-south1` (Mumbai)**.
- If one exists in the wrong region, create a new Firebase project instead and
  change the id in `.firebaserc`. Tell me and I will update it.

Existing data from the previous project can be deleted from the console; nothing
in Loop reads it.

### 1b. Enable Authentication

Authentication → Sign-in method → enable **Anonymous**.

That is the only provider v1 needs — onboarding signs in anonymously and never
asks for an account ([11-firebase.md](11-firebase.md#auth-model)). Google and
Apple get enabled when account linking ships.

### 1c. Register the two apps

Both use the same id as `app.json`:

| Platform | Application id | Downloads |
|---|---|---|
| Android | `com.getter.loop` | `google-services.json` |
| iOS | `com.getter.loop` | `GoogleService-Info.plist` |

If apps with these ids already exist from the previous project, reuse them —
the ids are what matter, not the display name.

Put both files in **`apps/mobile/firebase/`**. They are gitignored; `app.json`
already points at those paths.

## Step 2 — Install the CLIs

Neither is on this machine yet.

```bash
npm install -g firebase-tools eas-cli
firebase login
eas login
```

## Step 3 — Deploy rules and indexes

```bash
cd /home/godara01/code/loop
firebase deploy --only firestore:rules,firestore:indexes
```

This **overwrites** whatever rules the previous project had — intended.

Verify in the console that Firestore → Rules shows the Loop header comment.

## Step 4 — EAS project and file secrets

The two Firebase config files are gitignored, and **EAS Build only uploads files
tracked by git**. They travel as EAS *file* environment variables instead: EAS
materialises each on the builder and sets the variable to its path.

That is why `apps/mobile/app.config.ts` exists — a static `app.json` cannot read
an env var. It overrides just the two `googleServicesFile` paths from
`process.env`, falling back to `./firebase/...` locally, and leaves the rest of
the config in `app.json` where it is easier to read.

Each build profile in `eas.json` names the `environment` its variables come from,
so the mapping is explicit rather than defaulted.

**Run this from `apps/mobile`, not the repo root.** `eas init` writes an
`app.json` and `eas.json` wherever it is run, and a stub `app.json` at the repo
root shadows the real app config — EAS then builds the wrong thing.

```bash
cd apps/mobile
eas init                      # links this app to an EAS project, writes the id to app.json

eas env:create --scope project --name GOOGLE_SERVICES_JSON \
  --type file --visibility secret --value ./firebase/google-services.json \
  --environment development --environment preview --environment production
eas env:create --scope project --name GOOGLE_SERVICES_PLIST \
  --type file --visibility secret --value ./firebase/GoogleService-Info.plist \
  --environment development --environment preview --environment production
```

Check them with `eas env:list --environment development --format long` — both
must show `type file`.

## Step 5 — Build the development client

### Android — do this one first

```bash
cd apps/mobile
eas build --profile development --platform android
```

~15 minutes on EAS's free tier. It produces an `.apk`; install it by scanning the
QR code EAS prints, or `adb install`.

**Local builds are not an option on this machine** — no Android SDK, and JDK 25
where React Native's Gradle wants JDK 17. EAS is the path.

### iOS — needs a paid Apple account

An iOS build that runs on a **physical device** requires an **Apple Developer
Program membership ($99/year)**, whatever the tooling. There is no free path to
a device build, and simulator builds need macOS, which this machine is not.

```bash
eas build --profile development --platform ios   # after enrolling
eas device:create                                # register the test device first
```

If you are not enrolling yet, **do Android only**. Nothing in M1–M6 is
iOS-specific, and the one genuinely platform-split feature (SMS capture) is
Android-only anyway. iOS can be caught up before any external testing.

## Step 6 — Run it

```bash
npm run mobile          # from the repo root
```

`expo-dev-client` is installed, so this now targets the development build rather
than Expo Go. Open the installed **Loop (dev)** app and it will connect.

## Step 7 — Verify M0

On the device, open the **You** tab:

- [ ] The **Build** card reads `LINKED` and shows `project loop-app-0403`.
      Reading `NOT LINKED` means the app is running in Expo Go, or the config
      file is missing from `apps/mobile/firebase/`.
- [ ] Fonts render — the numbers are monospaced, not a system fallback.
- [ ] Every row in the **Haptic bench** produces a distinct feel. Do this on the
      mid-range Android specifically; that is where the mapping is hardest
      ([07-haptics.md](07-haptics.md#testing)).
- [ ] The Orbit, Ledger and Squads tabs render the seeded mock data.

That is M0 complete.

## Troubleshooting

### White screen when you open the app

Almost always: **there is no development build installed yet.**

`expo-dev-client` is installed, so `npm run mobile` serves a bundle meant for a
*development build*. Expo Go cannot load it and shows a blank screen with no
error. The fix is Step 5 — `eas build --profile development --platform android`
— then open the installed **Loop (dev)** app rather than Expo Go.

To tell the two apart quickly: if the JS bundle itself were broken,
`npx expo export --platform android` from `apps/mobile` would fail. If that
succeeds and the device is still white, the problem is the client, not the code.

### The build does not match what is on disk

**EAS uploads git state, not your working directory.** An uncommitted change —
or a staged-but-stale index — produces a binary built from different source, with
no warning that survives the build log.

This is not theoretical: it is how a `development`-profile build shipped *without*
`expo-dev-client`. The dependency was on disk and autolinking resolved it, but
the git index still held the version from before it was installed, so the builder
ran `npm ci` without it. The result was a debug APK with no dev launcher, which
falls back to React Native's default `index.android.bundle` path — a path Expo's
Metro does not serve. LAN, tunnel and USB all failed identically, because none of
them was ever the problem.

`eas.json` now sets `cli.requireCommit: true`, so EAS refuses to build from a
dirty tree rather than building the wrong thing. **Commit before every build.**

To confirm what the builder will see:

```bash
git status --porcelain          # must be empty
git show :apps/mobile/package.json | grep expo-dev-client
```

And to verify a built APK really is a dev client, before spending time debugging
a connection:

```bash
APK=$(adb shell pm path com.getter.loop | sed 's/package://' | tr -d '\r')
adb shell "unzip -l '$APK' | grep -c EXDevMenuApp"    # 0 = NOT a dev client
```

### "Unable to load script… index.android.bundle"

The dev client cannot reach Metro. It is almost never a code or build problem —
check in this order, stopping at the first failure.

**1. Is Metro running and listening on every interface?**

```bash
ss -ltn | grep 8081        # want  *:8081  — not  127.0.0.1:8081
curl -s http://<your-lan-ip>:8081/status
```

`packager-status:running` means the server is fine.

**2. Can the PHONE reach it?** This is the decisive test: open
`http://<your-lan-ip>:8081/status` in the phone's browser.

- Loads → the network is fine and the dev client simply has the wrong URL. In
  the dev launcher choose **Enter URL manually** and give it
  `http://<your-lan-ip>:8081`.
- Times out → the phone cannot see the machine. Continue.

`localhost:8081` on the phone means *the phone itself*. It will never work.

**3. Same network?** The phone must be on the same subnet, and the router must
not have **AP isolation** / "client isolation" enabled — common on guest Wi-Fi,
and it blocks device-to-device traffic while the internet still works.

**4. Firewall on the dev machine?**

```bash
sudo ufw status
sudo ufw allow 8081/tcp    # only if ufw is active
```

**5. Fall back to a tunnel** — works across any network, at the cost of speed:

```bash
npx expo start --tunnel    # prompts to install @expo/ngrok the first time
```

**6. Or go over USB**, which sidesteps Wi-Fi entirely:

```bash
sudo apt install android-tools-adb
adb reverse tcp:8081 tcp:8081
```

Then `localhost:8081` *is* correct, because adb forwards the phone's port to the
machine.

### `eas init` created config at the repo root

Delete `app.json` and `eas.json` from the repo root, and move `owner` and
`extra.eas.projectId` into `apps/mobile/app.json`. The app config lives with the
app; a root `app.json` silently shadows it.

### Build fails with `"google-services.json" is missing`

The full message ends *"EAS Build only uploads the files tracked by git"*. Two
causes, in order of likelihood:

1. **The file env vars are missing.** Check with
   `eas env:list --environment development --format long`; both must exist and
   show `type file`.
2. **`app.config.ts` is missing or not overriding the paths.** Verify with:

   ```bash
   cd apps/mobile
   GOOGLE_SERVICES_JSON=/tmp/x.json npx expo config --type public | grep googleServicesFile
   ```

   It must print `/tmp/x.json`. If it prints `./firebase/google-services.json`,
   the dynamic config is not being applied and the builder will look for a file
   that was never uploaded.

### Local build fails because the config file is genuinely absent

Step 1c is not done. The file is only needed at build time, so `npm run mobile`
works without it and `eas build` does not.

## The emulator (from M2 onward)

Feature work runs against the local emulator, not the real project:

```bash
firebase emulators:start        # UI at http://127.0.0.1:4000
```

Then in `.env`:

```
EXPO_PUBLIC_USE_EMULATORS=true
EXPO_PUBLIC_EMULATOR_HOST=<your machine's LAN IP>
```

The host is resolved **from the phone**, so `127.0.0.1` means the phone itself
and will not work for a physical device. Use your machine's LAN IP (`hostname -I`),
or `10.0.2.2` for an Android emulator.

## Deferred deliberately

- **App Check** — enforce before the first external tester build, not now. It
  would only make M2 harder to debug ([11-firebase.md](11-firebase.md#services-and-what-each-is-for)).
- **Staging and prod projects** — one project is enough until there is something
  worth protecting. `.firebaserc` has the alias structure ready.
- **Cloud Functions** — M6. Nothing before coins needs a trusted server.
