#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Installing dependencies"
npm install

echo "[2/3] Generating android project"
npx expo prebuild --platform android --non-interactive

echo "[3/3] Building standalone release APK (no Metro required)"
(cd android && ./gradlew clean assembleRelease)

echo "APK: android/app/build/outputs/apk/release/app-release.apk"

echo "Verifying JS bundle is packaged in APK"
unzip -l android/app/build/outputs/apk/release/app-release.apk | rg "assets/index.android.bundle"
