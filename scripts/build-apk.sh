#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Installing dependencies"
npm install

echo "[2/3] Generating android project"
npx expo prebuild --platform android --non-interactive

echo "[3/3] Building debug APK"
(cd android && ./gradlew assembleDebug)

echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
