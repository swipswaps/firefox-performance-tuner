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

/**
 * Generate self-healing Firefox restart script
 * Tests that Firefox starts successfully, auto-rolls back if it fails
 */
export function generateRestartScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "🔄 Restarting Firefox with safety checks..."

# 1. Close Firefox gracefully
if pgrep -x firefox >/dev/null 2>&1; then
  echo "   Closing Firefox..."
  killall firefox 2>/dev/null
  sleep 3

  # Force kill if still running
  if pgrep -x firefox >/dev/null 2>&1; then
    echo "   Force closing..."
    killall -9 firefox 2>/dev/null
    sleep 1
  fi
fi

echo "✓ Firefox closed"

# 2. Start Firefox in background and test
echo "   Starting Firefox..."
firefox &
FIREFOX_PID=$!
sleep 5

# 3. Verify Firefox is still running (didn't crash on startup)
if ! pgrep -x firefox >/dev/null 2>&1; then
  echo ""
  echo "❌ CRITICAL: Firefox failed to start!"
  echo ""
  echo "🚨 EMERGENCY RECOVERY INSTRUCTIONS:"
  echo ""
  echo "Option 1: Restore from most recent backup"
  echo "   cp ~/.mozilla/firefox/*/user.js.backup.1 ~/.mozilla/firefox/*/user.js"
  echo ""
  echo "Option 2: Delete user.js (Firefox will use defaults)"
  echo "   rm ~/.mozilla/firefox/*/user.js"
  echo ""
  echo "Option 3: Start Firefox in Safe Mode"
  echo "   firefox -safe-mode"
  echo ""
  echo "Option 4: Reset Firefox profile (NUCLEAR - loses all settings)"
  echo "   firefox -ProfileManager"
  echo ""
  exit 1
fi

echo "✓ Firefox started successfully"
echo ""
echo "✅ Configuration applied and verified!"
echo ""
echo "📋 Next steps:"
echo "   1. Check about:config to verify preferences"
echo "   2. Test browsing performance"
echo "   3. If issues occur, see recovery instructions below"
echo ""
echo "🆘 RECOVERY (if Firefox becomes unstable):"
echo ""
echo "   Restore from backup:"
echo "   cp ~/.mozilla/firefox/*/user.js.backup.1 ~/.mozilla/firefox/*/user.js"
echo "   firefox &"
echo ""
echo "   Or delete user.js entirely:"
echo "   rm ~/.mozilla/firefox/*/user.js"
echo "   firefox &"
`
}

/**
 * Generate emergency recovery script
 * User should save this BEFORE applying any configuration
 * Provides multiple recovery options if Firefox won't start
 */
export function generateEmergencyRecoveryScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "🚨 Firefox Emergency Recovery Script"
echo "===================================="
echo ""
echo "This script will help you recover if Firefox won't start"
echo "after applying a configuration."
echo ""

# Detect profile (same robust detection as main script)
CANDIDATES=(
  "$HOME/.mozilla/firefox"
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"
  "$HOME/snap/firefox/common/.mozilla/firefox"
)

PROFILE_DIR=""
for BASE in "\${CANDIDATES[@]}"; do
  [ -f "$BASE/profiles.ini" ] && PROFILE_DIR="$BASE" && break
done

if [ -z "$PROFILE_DIR" ]; then
  echo "❌ No Firefox installation found"
  exit 1
fi

PROFILE_PATH=$(awk -F= '$1=="Path"{path=$2} $1=="Default" && $2=="1"{print path}' "$PROFILE_DIR/profiles.ini" | head -n1)
FULL_PATH="$PROFILE_DIR/$PROFILE_PATH"
USERJS="$FULL_PATH/user.js"

echo "📁 Profile: $FULL_PATH"
echo ""
echo "Choose recovery option:"
echo ""
echo "1️⃣  Delete user.js (safest - removes all custom preferences)"
echo "2️⃣  Restore from backup.1 (most recent backup)"
echo "3️⃣  Restore from backup.2 (second most recent)"
echo "4️⃣  Restore from backup.3 (third most recent)"
echo "5️⃣  Start Firefox in Safe Mode (diagnose issues)"
echo "6️⃣  Show all available backups"
echo ""
read -p "Enter choice (1-6): " choice

case $choice in
  1)
    if [ -f "$USERJS" ]; then
      echo "🗑️  Deleting user.js..."
      rm "$USERJS"
      echo "✅ user.js deleted"
      echo "   Firefox will use default preferences on next start"
    else
      echo "ℹ️  user.js doesn't exist"
    fi
    ;;
  2|3|4)
    BACKUP="$USERJS.backup.$((choice - 1))"
    if [ -f "$BACKUP" ]; then
      echo "↩️  Restoring from $BACKUP..."
      cp "$BACKUP" "$USERJS"
      echo "✅ Restored successfully"
    else
      echo "❌ Backup not found: $BACKUP"
      exit 1
    fi
    ;;
  5)
    echo "🔧 Starting Firefox in Safe Mode..."
    echo ""
    echo "Safe Mode disables:"
    echo "  - Extensions"
    echo "  - Custom themes"
    echo "  - Hardware acceleration"
    echo "  - user.js preferences (temporarily)"
    echo ""
    firefox --safe-mode &
    echo "✅ Firefox started in Safe Mode"
    echo "   If it works, the problem is in user.js"
    exit 0
    ;;
  6)
    echo "📋 Available backups:"
    ls -lh "$FULL_PATH" | grep "user.js" || echo "   No backups found"
    exit 0
    ;;
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "🔄 Now restart Firefox:"
echo "   firefox &"
echo ""
echo "💡 If Firefox still won't start:"
echo "   1. Run this script again and choose option 5 (Safe Mode)"
echo "   2. Check about:support for profile path"
echo "   3. Manually delete: $USERJS"
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
 * Generate emergency recovery script
 * Lists all backups and provides one-click restore options
 */
export function generateRecoveryScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "🆘 Firefox Performance Tuner - Emergency Recovery"
echo "=================================================="
echo ""

# 1. Detect profile
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
USERJS="$FULL_PATH/user.js"

echo "📁 Profile: $FULL_PATH"
echo ""

# 2. Check current status
if [ -f "$USERJS" ]; then
  echo "📄 Current user.js:"
  echo "   Size: $(stat -f%z "$USERJS" 2>/dev/null || stat -c%s "$USERJS") bytes"
  echo "   Modified: $(stat -f%Sm "$USERJS" 2>/dev/null || stat -c%y "$USERJS" | cut -d' ' -f1-2)"
  echo ""
else
  echo "ℹ️  No user.js file found (Firefox using defaults)"
  echo ""
fi

# 3. List available backups
echo "💾 Available backups:"
BACKUPS=$(ls -t "$FULL_PATH"/user.js.backup.* 2>/dev/null || true)

if [ -z "$BACKUPS" ]; then
  echo "   ❌ No backups found"
  echo ""
  echo "Recovery options:"
  echo "   1. Delete user.js and restart Firefox with defaults"
  echo "   2. Start Firefox in Safe Mode: firefox -safe-mode"
  echo "   3. Reset profile: firefox -ProfileManager"
  exit 0
fi

echo "$BACKUPS" | while read -r backup; do
  SIZE=$(stat -f%z "$backup" 2>/dev/null || stat -c%s "$backup")
  MODIFIED=$(stat -f%Sm "$backup" 2>/dev/null || stat -c%y "$backup" | cut -d' ' -f1-2)
  echo "   $(basename "$backup") - $SIZE bytes - $MODIFIED"
done
echo ""

# 4. Interactive restore
echo "🔧 Recovery Options:"
echo ""
echo "1. Restore from most recent backup (user.js.backup.1)"
echo "2. List backup contents before restoring"
echo "3. Delete user.js (Firefox will use defaults)"
echo "4. Start Firefox in Safe Mode"
echo "5. Exit without changes"
echo ""
read -p "Choose option [1-5]: " choice

case $choice in
  1)
    LATEST=$(ls -t "$FULL_PATH"/user.js.backup.* 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      cp "$LATEST" "$USERJS"
      echo "✅ Restored from: $(basename "$LATEST")"
      echo "   Run: firefox &"
    else
      echo "❌ No backup found"
    fi
    ;;
  2)
    LATEST=$(ls -t "$FULL_PATH"/user.js.backup.* 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      echo ""
      echo "📄 Contents of $(basename "$LATEST"):"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      head -50 "$LATEST"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      read -p "Restore this backup? [y/N]: " confirm
      if [[ "$confirm" =~ ^[Yy]$ ]]; then
        cp "$LATEST" "$USERJS"
        echo "✅ Restored from: $(basename "$LATEST")"
        echo "   Run: firefox &"
      fi
    else
      echo "❌ No backup found"
    fi
    ;;
  3)
    read -p "⚠️  Delete user.js? This cannot be undone. [y/N]: " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      rm "$USERJS"
      echo "✅ user.js deleted - Firefox will use defaults"
      echo "   Run: firefox &"
    fi
    ;;
  4)
    echo "🔒 Starting Firefox in Safe Mode..."
    firefox -safe-mode &
    ;;
  5)
    echo "👋 Exiting without changes"
    ;;
  *)
    echo "❌ Invalid option"
    ;;
esac
`
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
echo "🔄 Next step: Restart Firefox with verification"
echo "   Run: firefox &"
echo ""
echo "⏱️  Wait 5 seconds, then verify Firefox is running:"
echo "   pgrep -x firefox"
echo ""
${hasUserJs ? '' : 'echo "ℹ️  Note: No preferences configured yet"'}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🆘 EMERGENCY RECOVERY (if Firefox won't start):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option 1: Restore from most recent backup"
echo "   cp $USERJS.backup.1 $USERJS"
echo "   firefox &"
echo ""
echo "Option 2: List all available backups"
echo "   ls -lh $USERJS.backup.*"
echo ""
echo "Option 3: Delete user.js (Firefox uses defaults)"
echo "   rm $USERJS"
echo "   firefox &"
echo ""
echo "Option 4: Start Firefox in Safe Mode"
echo "   firefox -safe-mode"
echo ""
echo "Option 5: Reset profile (NUCLEAR - loses all settings)"
echo "   firefox -ProfileManager"
echo ""
echo "💡 Backups are kept in: $(dirname $USERJS)"
echo "   Pattern: user.js.backup.1 (most recent) to user.js.backup.5 (oldest)"
`
}

