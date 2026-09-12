# Firebase config files

`google-services.json` and `GoogleService-Info.plist` belong here. They are
**not committed** — see the repo `.gitignore`.

Download them from the Firebase console for project **loop-app-0403**, with these
application ids:

| Platform | Id |
|---|---|
| Android | `com.getter.loop` |
| iOS | `com.getter.loop` |

For EAS builds, upload the same two files as EAS **file secrets** so CI can build
without them being in git:

```bash
eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
  --type file --value ./firebase/google-services.json
eas secret:create --scope project --name GOOGLE_SERVICES_PLIST \
  --type file --value ./firebase/GoogleService-Info.plist
```

`app.json` points at these paths via `android.googleServicesFile` and
`ios.googleServicesFile`.
