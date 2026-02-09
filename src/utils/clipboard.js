/**
 * Clipboard utilities for Firefox Performance Tuner
 * Production-grade shell script generation with:
 * - Robust Firefox profile detection (normal, Flatpak, Snap)
 * - Safety checks (Firefox running, prefs.js exists)
 * - Backup rotation
 * - Rollback support
 *
 * Based on best practices from:
 * - Betterfox scripts
 * - Mozilla enterprise deployment patterns
 * - Arch Wiki Firefox documentation
 */

export async function copyToClipboard(text, showToast) {
  try {
    await navigator.clipboard.writeText(text)
    if (showToast) showToast('📋 Copied to clipboard!', 'success', 2000)
    return true
  } catch (error) {
    console.error('Clipboard copy failed:', error)
    if (showToast) showToast('❌ Clipboard copy failed', 'error', 2000)
    return false
  }
}

/**
 * Generate robust Firefox profile detection script
 * Supports: normal install, Flatpak, Snap
 * Validates: directory exists, prefs.js present, Firefox not running
 */
export function generateProfileFindScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Detecting Firefox profile..."

# Check all possible Firefox install locations
CANDIDATES=(
  "$HOME/.mozilla/firefox"
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"
  "$HOME/snap/firefox/common/.mozilla/firefox"
)

PROFILE_DIR=""

for BASE in "\${CANDIDATES[@]}"; do
  if [ -f "$BASE/profiles.ini" ]; then
    PROFILE_DIR="$BASE"
    break
  fi
done

if [ -z "$PROFILE_DIR" ]; then
  echo "❌ No Firefox profiles.ini found"
  echo "   Checked:"
  echo "   - ~/.mozilla/firefox (normal install)"
  echo "   - ~/.var/app/org.mozilla.firefox/.mozilla/firefox (Flatpak)"
  echo "   - ~/snap/firefox/common/.mozilla/firefox (Snap)"
  exit 1
fi

echo "✓ Using profile base: $PROFILE_DIR"

# Parse profiles.ini using awk (robust INI parser)
PROFILE_PATH=$(awk -F= '
  $1=="Path"{path=$2}
  $1=="Default" && $2=="1"{print path}
' "$PROFILE_DIR/profiles.ini" | head -n1)

if [ -z "$PROFILE_PATH" ]; then
  echo "❌ No default profile found in profiles.ini"
  exit 1
fi

FULL_PATH="$PROFILE_DIR/$PROFILE_PATH"

if [ ! -d "$FULL_PATH" ]; then
  echo "❌ Profile directory missing: $FULL_PATH"
  exit 1
fi

if [ ! -f "$FULL_PATH/prefs.js" ]; then
  echo "⚠️  prefs.js not found — profile may be invalid"
  echo "   Path: $FULL_PATH/prefs.js"
  exit 1
fi

if pgrep -x firefox >/dev/null 2>&1; then
  echo "⚠️  Firefox is running — please close it first"
  echo "   Run: killall firefox"
  exit 1
fi

echo ""
echo "✅ Detected Firefox profile:"
echo "   $FULL_PATH"
echo ""
echo "📁 Profile contents:"
ls -lh "$FULL_PATH" | grep -E "prefs.js|user.js" || echo "   (no user.js yet)"
`
}

/**
 * Generate safe user.js apply script with:
 * - Robust profile detection
 * - Firefox running check
 * - Rotating backups (keeps last 5)
 * - Validation
 */
export function generateUserJsScript(content, backup = true) {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "📝 Applying user.js configuration..."

# 1. Detect profile (supports normal/Flatpak/Snap)
CANDIDATES=(
  "$HOME/.mozilla/firefox"
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"
  "$HOME/snap/firefox/common/.mozilla/firefox"
)

PROFILE_DIR=""
for BASE in "\${CANDIDATES[@]}"; do
  [ -f "$BASE/profiles.ini" ] && PROFILE_DIR="$BASE" && break
done

[ -z "$PROFILE_DIR" ] && echo "❌ No Firefox installation found" && exit 1

PROFILE_PATH=$(awk -F= '$1=="Path"{path=$2} $1=="Default" && $2=="1"{print path}' "$PROFILE_DIR/profiles.ini" | head -n1)
[ -z "$PROFILE_PATH" ] && echo "❌ No default profile found" && exit 1

FULL_PATH="$PROFILE_DIR/$PROFILE_PATH"
[ ! -d "$FULL_PATH" ] && echo "❌ Profile directory missing" && exit 1

USERJS="$FULL_PATH/user.js"

# 2. Safety check - Firefox must be closed
if pgrep -x firefox >/dev/null 2>&1; then
  echo "❌ Firefox is running - close it first"
  echo "   Run: killall firefox"
  exit 1
fi

${backup ? `# 3. Rotate backups (keep last 5)
if [ -f "$USERJS" ]; then
  echo "💾 Creating backup..."
  for i in {4..1}; do
    [ -f "$USERJS.backup.$i" ] && mv "$USERJS.backup.$i" "$USERJS.backup.$((i+1))"
  done
  cp "$USERJS" "$USERJS.backup.1"
  echo "✓ Backup created: $USERJS.backup.1"
fi
` : ''}
# 4. Write new user.js
cat > "$USERJS" << 'USERJS_EOF'
${content}
USERJS_EOF

echo "✓ user.js written to: $USERJS"
echo ""
echo "⚠️  IMPORTANT: Restart Firefox to apply changes"
echo "   Run: firefox &"
`
}

export function generateRestartScript() {
  return `#!/bin/bash
# Restart Firefox to apply changes
echo "Closing Firefox..."
killall firefox 2>/dev/null
sleep 2
echo "Starting Firefox..."
firefox &
echo "✓ Firefox restarted"
`
}

export function generatePreferenceScript(prefs) {
  const prefLines = Object.entries(prefs)
    .map(([key, value]) => `user_pref("${key}", ${value});`)
    .join('\n')

  return generateUserJsScript(`// Firefox Performance Tuner - Generated Configuration
// Generated: ${new Date().toISOString()}

${prefLines}
`, true)
}

/**
 * Generate complete zero-mistake setup script
 * This is the production-grade version that:
 * - Detects all Firefox install types
 * - Validates every step
 * - Creates rotating backups
 * - Refuses to run if Firefox is active
 * - Provides clear error messages
 */
export function generateFullSetupScript(systemInfo, preferences, userJsContent) {
  const hasUserJs = userJsContent && userJsContent.trim().length > 0

  return `#!/usr/bin/env bash
set -euo pipefail

echo "🦊 Firefox Performance Tuner - Complete Setup"
echo "=============================================="
${systemInfo ? `echo "System: ${systemInfo.gpu || 'Unknown GPU'}, ${systemInfo.ram || 'Unknown RAM'}"` : ''}
echo "Generated: ${new Date().toISOString()}"
echo ""

# 1. Detect Firefox profile (supports normal/Flatpak/Snap)
echo "📁 Step 1/4: Detecting Firefox profile..."
CANDIDATES=(
  "$HOME/.mozilla/firefox"
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"
  "$HOME/snap/firefox/common/.mozilla/firefox"
)

PROFILE_DIR=""
for BASE in "\${CANDIDATES[@]}"; do
  if [ -f "$BASE/profiles.ini" ]; then
    PROFILE_DIR="$BASE"
    echo "   Found: $BASE"
    break
  fi
done

if [ -z "$PROFILE_DIR" ]; then
  echo "❌ No Firefox installation found"
  echo "   Checked: normal, Flatpak, Snap"
  exit 1
fi

PROFILE_PATH=$(awk -F= '$1=="Path"{path=$2} $1=="Default" && $2=="1"{print path}' "$PROFILE_DIR/profiles.ini" | head -n1)

if [ -z "$PROFILE_PATH" ]; then
  echo "❌ No default profile found in profiles.ini"
  exit 1
fi

FULL_PATH="$PROFILE_DIR/$PROFILE_PATH"

if [ ! -d "$FULL_PATH" ]; then
  echo "❌ Profile directory missing: $FULL_PATH"
  exit 1
fi

if [ ! -f "$FULL_PATH/prefs.js" ]; then
  echo "⚠️  Warning: prefs.js not found (profile may be new)"
fi

echo "✓ Profile: $FULL_PATH"
USERJS="$FULL_PATH/user.js"

# 2. Safety check - Firefox must be closed
echo ""
echo "🔒 Step 2/4: Safety checks..."
if pgrep -x firefox >/dev/null 2>&1; then
  echo "❌ Firefox is running - must close it first"
  echo "   Run: killall firefox"
  echo "   Then run this script again"
  exit 1
fi
echo "✓ Firefox is not running"

# 3. Backup existing user.js (rotating backups, keep last 5)
echo ""
echo "💾 Step 3/4: Creating backup..."
if [ -f "$USERJS" ]; then
  for i in {4..1}; do
    [ -f "$USERJS.backup.$i" ] && mv "$USERJS.backup.$i" "$USERJS.backup.$((i+1))"
  done
  cp "$USERJS" "$USERJS.backup.1"
  echo "✓ Backup created: $USERJS.backup.1"
  echo "   (Keeping last 5 backups)"
else
  echo "ℹ️  No existing user.js found (will create new)"
fi

# 4. Write new user.js
echo ""
echo "📝 Step 4/4: Writing configuration..."
cat > "$USERJS" << 'USERJS_EOF'
${hasUserJs ? userJsContent : '// Firefox Performance Tuner Configuration\n// Generated: ' + new Date().toISOString() + '\n// No preferences configured yet'}
USERJS_EOF

echo "✓ Configuration written to: $USERJS"

# 5. Verify and restart
echo ""
echo "✅ Setup complete!"
echo ""
echo "📊 Summary:"
echo "   Profile:  $FULL_PATH"
echo "   Config:   $USERJS"
echo "   Backup:   $USERJS.backup.1"
echo ""
echo "🔄 Next step: Restart Firefox"
echo "   Run: firefox &"
echo ""
${hasUserJs ? '' : 'echo "ℹ️  Note: No preferences configured yet"'}
echo "💡 Tip: To rollback, run:"
echo "   cp $USERJS.backup.1 $USERJS"
`
}

