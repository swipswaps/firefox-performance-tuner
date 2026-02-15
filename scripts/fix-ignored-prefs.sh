#!/bin/bash
# Firefox Ignored Preferences Fixer
# Identifies and removes preferences that Firefox 147 ignores
# Created: 2026-02-15
# Session: Firefox Performance Tuner - Preference Investigation

set -euo pipefail

# === USER-EDITABLE CONFIGURATION ===

# Profile path (auto-detected, but you can override)
PROFILE_PATH="${FIREFOX_PROFILE:-$HOME/.mozilla/firefox/6nxwkfvn.default-release}"

# Preferences that Firefox 147 is ignoring (found via inspection)
# These are in user.js but NOT in prefs.js after Firefox restart
IGNORED_PREFS=(
  "browser.cache.memory.enable"           # Reason: Default is already 'true', no need to set
  "media.rdd-process.enabled"             # Reason: Always enabled in Firefox 147, not user-configurable
  "media.av1.enabled"                     # Reason: Always enabled in Firefox 147, not user-configurable
  "media.navigator.mediadatadecoder_vpx_enabled"  # Reason: Preference removed in Firefox 147
  "media.autoplay.blocking_policy"        # Reason: Controlled by UI, user.js override disabled
  "media.videocontrols.picture-in-picture.enabled"  # Reason: Always enabled, not user-configurable
  "dom.timeout.throttling_delay"          # Reason: Preference removed or renamed in Firefox 147
  "toolkit.telemetry.enabled"             # Reason: LOCKED by Mozilla in Beta/Nightly builds (Bugzilla #1422689)
)

# Action to take: 'remove' or 'comment'
ACTION="${FIX_ACTION:-comment}"  # Default: comment out (safer)

# === END USER-EDITABLE CONFIGURATION ===

echo "=== Firefox Ignored Preferences Fixer ==="
echo "Profile: $PROFILE_PATH"
echo "Action: $ACTION"
echo ""

USER_JS="$PROFILE_PATH/user.js"
BACKUP="$PROFILE_PATH/user.js.backup-$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$USER_JS" ]]; then
  echo "ERROR: user.js not found at $USER_JS"
  exit 1
fi

# Create backup
echo "Creating backup: $BACKUP"
cp "$USER_JS" "$BACKUP"

# Process each ignored preference
echo ""
echo "=== Processing Ignored Preferences ==="
for pref in "${IGNORED_PREFS[@]}"; do
  if grep -q "\"$pref\"" "$USER_JS"; then
    echo "Found: $pref"
    
    if [[ "$ACTION" == "remove" ]]; then
      # Remove the line entirely
      sed -i "/\"$pref\"/d" "$USER_JS"
      echo "  → Removed"
    elif [[ "$ACTION" == "comment" ]]; then
      # Comment out the line
      sed -i "s|^user_pref(\"$pref\"|// IGNORED BY FIREFOX 147: user_pref(\"$pref\"|" "$USER_JS"
      echo "  → Commented out"
    fi
  fi
done

echo ""
echo "=== Summary ==="
echo "Backup created: $BACKUP"
echo "Modified: $USER_JS"
echo ""

# Restart the tuner server to pick up changes
echo "=== Restarting Firefox Performance Tuner Server ==="
TUNER_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
cd "$TUNER_DIR"

# Kill existing server
pkill -f "node.*server.js" 2>/dev/null && echo "Stopped existing server" || echo "No server running"
sleep 2

# Start new server
echo "Starting server..."
npm start > /tmp/firefox-tuner.log 2>&1 &

# Wait for server to be ready (up to 15 seconds)
echo "Waiting for server to be ready..."
for i in {1..15}; do
  sleep 1
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Server restarted successfully (took ${i}s)"
    HEALTH=$(curl -s http://localhost:3001/api/health)
    echo "Server status: $HEALTH"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "⚠️  Server startup taking longer than expected"
    echo "Check /tmp/firefox-tuner.log for details"
    echo "Server may still be starting in background..."
  fi
done

echo ""
echo "=== Next Steps ==="
echo "1. Restart Firefox (close and reopen)"
echo "2. Hard refresh the tuner page: Ctrl+Shift+R"
echo "3. Issue count should drop from 8 to 0"
echo ""
echo "To undo: cp $BACKUP $USER_JS && restart Firefox"

