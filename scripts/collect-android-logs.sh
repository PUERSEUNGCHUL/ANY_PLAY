#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${1:-com.genesis.prototype}"
OUT_DIR="${2:-./artifacts/android-logs}"
mkdir -p "$OUT_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
LOGCAT_OUT="$OUT_DIR/logcat_${TS}.txt"
CRASH_OUT="$OUT_DIR/crash_logs_${TS}.txt"
APP_FILES_OUT="$OUT_DIR/app_files_${TS}.txt"

echo "[1/3] Saving logcat -> $LOGCAT_OUT"
adb logcat -d > "$LOGCAT_OUT"

echo "[2/3] Saving internal crash logs -> $CRASH_OUT"
if adb shell run-as "$PACKAGE_NAME" ls files/logs >/dev/null 2>&1; then
  {
    echo "# package: $PACKAGE_NAME"
    echo "# generated: $(date)"
    echo
    for f in $(adb shell run-as "$PACKAGE_NAME" ls files/logs | tr -d '\r'); do
      echo "===== $f ====="
      adb shell run-as "$PACKAGE_NAME" cat "files/logs/$f"
      echo
    done
  } > "$CRASH_OUT"
else
  echo "run-as not available or no crash logs. package=$PACKAGE_NAME" > "$CRASH_OUT"
fi

echo "[3/3] Saving app private file list -> $APP_FILES_OUT"
if adb shell run-as "$PACKAGE_NAME" ls files >/dev/null 2>&1; then
  adb shell run-as "$PACKAGE_NAME" ls -la files > "$APP_FILES_OUT"
else
  echo "run-as not available. package=$PACKAGE_NAME" > "$APP_FILES_OUT"
fi

echo "Done. Outputs in $OUT_DIR"
