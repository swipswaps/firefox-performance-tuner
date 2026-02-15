#!/bin/bash
# Firefox Preference Inspector
# Uses Firefox's prefs.js to check actual runtime values
# Created: 2026-02-15
# Session: Firefox Performance Tuner - Cache Issue Investigation

set -euo pipefail

PROFILE_PATH="$HOME/.mozilla/firefox/6nxwkfvn.default-release"
PREFS_JS="$PROFILE_PATH/prefs.js"
USER_JS="$PROFILE_PATH/user.js"

echo "=== Firefox Preference Inspector ==="
echo "Profile: $PROFILE_PATH"
echo ""

# The 8 problematic preferences
PREFS=(
  "browser.cache.memory.enable"
  "media.rdd-process.enabled"
  "media.av1.enabled"
  "media.navigator.mediadatadecoder_vpx_enabled"
  "media.autoplay.blocking_policy"
  "media.videocontrols.picture-in-picture.enabled"
  "dom.timeout.throttling_delay"
  "toolkit.telemetry.enabled"
)

echo "=== Checking user.js (what we SET) ==="
for pref in "${PREFS[@]}"; do
  echo -n "$pref: "
  grep "\"$pref\"" "$USER_JS" 2>/dev/null || echo "NOT IN user.js"
done

echo ""
echo "=== Checking prefs.js (what Firefox APPLIED) ==="
for pref in "${PREFS[@]}"; do
  echo -n "$pref: "
  grep "\"$pref\"" "$PREFS_JS" 2>/dev/null || echo "NOT IN prefs.js (not applied)"
done

echo ""
echo "=== Analysis ==="
echo "If a preference is in user.js but NOT in prefs.js, it means:"
echo "  1. Firefox doesn't recognize the preference (typo or removed in Firefox 147)"
echo "  2. The preference is locked by Mozilla (e.g., toolkit.telemetry.enabled)"
echo "  3. The default value matches user.js value (so Firefox doesn't write it)"
echo ""
echo "=== Recommendation ==="
echo "Run this script, then check Firefox source code at searchfox.org to verify"
echo "which preferences still exist in Firefox 147."

