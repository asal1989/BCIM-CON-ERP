# BCIM ERP Android App

First mobile app shell for BCIM ERP, built with Expo React Native.

## Run on Android During Development

```powershell
cd "H:\OFFICE PROJECTS\consrpro\construct-erp-local\construct-erp\mobile-app"
npm install
npm run android
```

Connect an Android phone with USB debugging enabled, or use an Android Studio emulator.

## Build Original Android APK

The native Android project has been generated in:

```text
mobile-app\android
```

On the Android Studio laptop:

1. Open `mobile-app\android` in Android Studio.
2. Let Gradle sync finish.
3. Select `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
4. The debug APK will be created under:

```text
mobile-app\android\app\build\outputs\apk\debug\app-debug.apk
```

If app settings in `app.json` are changed later, run this again before building:

```powershell
npx expo prebuild --platform android
```

## API URL

Default API:

```text
http://bcim.ddns.net:3001/api/v1
```

To override it, create `.env`:

```text
EXPO_PUBLIC_API_BASE_URL=http://bcim.ddns.net:3001/api/v1
```

## Included In This First Version

- Login using existing ERP `/auth/login`
- Secure token storage
- Project selection after login
- Project-scoped dashboard
- Material requisition list
- Stores stock list
- Bill Tracker list
- Assets and IT assets views
- DMS document list
- Profile and logout
