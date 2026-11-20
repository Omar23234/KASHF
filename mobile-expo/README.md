# KASHF | كَشْف — React Native + Expo Android APK Project

This directory contains the standalone React Native + Expo + TypeScript Android application configured to build a directly installable **Android `.apk`** using **EAS Build** (no Expo Go required).

---

## 1. Firebase Configuration & Environment Variables

Online Multiplayer uses **Firebase Firestore** + **background Firebase Anonymous Authentication** (no player login, Gmail, or registration UI).
**Single Phone Mode works 100% offline even if Firebase is not configured.**

The project already includes `firebase-applet-config.json` with the provisioned Firebase project (`brilliant-anagram-5flln`). If you want to connect your own Firebase project instead, copy `.env.example` to `.env` and fill in:

| Variable | Where to find it |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → General → Your apps (Web App) → `apiKey` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same Web App config → `authDomain` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Same Web App config → `projectId` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same Web App config → `storageBucket` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same Web App config → `messagingSenderId` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Same Web App config → `appId` |
| `EXPO_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID` | Firestore Database ID (leave empty if using `(default)`) |

### Enable Anonymous Authentication (One-time setup)
1. Open [Firebase Console → Authentication → Sign-in method](https://console.firebase.google.com/project/brilliant-anagram-5flln/authentication/providers).
2. Click **Add new provider** → **Anonymous**.
3. Toggle **Enable** ON and click **Save**.

---

## 2. Generate the Standalone Android APK

An Expo account is required **only for EAS cloud build** (so Expo's servers compile the Android APK for you without installing Android Studio). Players of the game never log in.

Run these commands inside `mobile-expo`:

```bash
cd mobile-expo
npm install
npm install -g eas-cli
eas login
eas init
eas build -p android --profile preview
```

When asked during `eas build` whether to generate a new Android Keystore, choose **Yes**.

### What you get when the build finishes (~5–10 minutes):
- A **direct `.apk` download URL** in your terminal (and in your [expo.dev](https://expo.dev) dashboard) plus a QR code.
- Download the `.apk` to your computer or directly on your Android phone, tap it, allow **"Install unknown apps"** if Android asks, and launch **KASHF | كَشْف**.

### Updating future versions
1. Update `expo.version` and increment `expo.android.versionCode` in `app.json`.
2. Run `eas build -p android --profile preview` (or `--profile production` — both output `.apk`, not `.aab`).
