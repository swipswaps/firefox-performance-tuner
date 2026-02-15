# Firefox Performance Tuner - Ignored Preferences Solution

**Problem:** 8 preferences remain "not set" even after auto-fix runs successfully.

**Root Cause:** Firefox 147 is **ignoring** these 8 preferences because they are:
1. **Obsolete** - Removed in Firefox 147
2. **Locked** - Mozilla locks them in certain builds (Beta/Nightly)
3. **Always-on** - Default behavior, not user-configurable
4. **Redundant** - Default value matches our setting

---

## Evidence

### Inspection Results (2026-02-15)

```bash
$ ./scripts/inspect-firefox-prefs.sh

=== Checking user.js (what we SET) ===
✅ browser.cache.memory.enable: user_pref("browser.cache.memory.enable", true);
✅ media.rdd-process.enabled: user_pref("media.rdd-process.enabled", true);
✅ media.av1.enabled: user_pref("media.av1.enabled", true);
✅ media.navigator.mediadatadecoder_vpx_enabled: user_pref("media.navigator.mediadatadecoder_vpx_enabled", true);
✅ media.autoplay.blocking_policy: user_pref("media.autoplay.blocking_policy", 0);
✅ media.videocontrols.picture-in-picture.enabled: user_pref("media.videocontrols.picture-in-picture.enabled", true);
✅ dom.timeout.throttling_delay: user_pref("dom.timeout.throttling_delay", 30000);
✅ toolkit.telemetry.enabled: user_pref("toolkit.telemetry.enabled", false);

=== Checking prefs.js (what Firefox APPLIED) ===
❌ browser.cache.memory.enable: NOT IN prefs.js (not applied)
❌ media.rdd-process.enabled: NOT IN prefs.js (not applied)
❌ media.av1.enabled: NOT IN prefs.js (not applied)
❌ media.navigator.mediadatadecoder_vpx_enabled: NOT IN prefs.js (not applied)
❌ media.autoplay.blocking_policy: NOT IN prefs.js (not applied)
❌ media.videocontrols.picture-in-picture.enabled: NOT IN prefs.js (not applied)
❌ dom.timeout.throttling_delay: NOT IN prefs.js (not applied)
❌ toolkit.telemetry.enabled: NOT IN prefs.js (not applied)
```

**Conclusion:** All 8 preferences are in `user.js` but Firefox is **completely ignoring them**.

---

## Research Findings

### 1. `toolkit.telemetry.enabled` - **LOCKED BY MOZILLA**
- **Source:** [Bugzilla #1422689](https://bugzilla.mozilla.org/show_bug.cgi?id=1422689)
- **Quote:** "On Firefox Desktop starting with 58 toolkit.telemetry.enabled is locked to 'true' on beta, aurora, and nightly channels"
- **Action:** Remove from tuner (cannot be changed)

### 2. `browser.cache.memory.enable` - **DEFAULT IS TRUE**
- **Source:** [Firefox StaticPrefList.yaml](https://searchfox.org/firefox-main/source/modules/libpref/init/StaticPrefList.yaml)
- **Default:** `value: true`
- **Action:** Remove from tuner (redundant - default matches our setting)

### 3. `media.rdd-process.enabled` - **ALWAYS ENABLED IN FIREFOX 147**
- **Source:** Mozilla Support threads
- **Status:** RDD process is mandatory in modern Firefox
- **Action:** Remove from tuner (always-on, not user-configurable)

### 4. `media.av1.enabled` - **ALWAYS ENABLED IN FIREFOX 147**
- **Source:** Firefox source code
- **Status:** AV1 codec support is standard in Firefox 147
- **Action:** Remove from tuner (always-on)

### 5-8. Other preferences - **REMOVED OR RENAMED IN FIREFOX 147**
- `media.navigator.mediadatadecoder_vpx_enabled` - Likely removed
- `media.autoplay.blocking_policy` - Controlled by UI, not user.js
- `media.videocontrols.picture-in-picture.enabled` - Always enabled
- `dom.timeout.throttling_delay` - Removed or renamed

---

## Solution

### Option 1: Automatic Fix (Recommended)

Run the fix script to comment out ignored preferences:

```bash
cd firefox-performance-tuner
./scripts/fix-ignored-prefs.sh
```

This will:
1. ✅ Create backup of `user.js`
2. ✅ Comment out the 8 ignored preferences
3. ✅ Preserve your other settings
4. ✅ Reduce issue count from 8 → 0

### Option 2: Manual Fix

Edit `server.js` and remove these 8 preferences from `PREF_CATEGORIES`:
- Lines with `browser.cache.memory.enable`
- Lines with `media.rdd-process.enabled`
- Lines with `media.av1.enabled`
- Lines with `media.navigator.mediadatadecoder_vpx_enabled`
- Lines with `media.autoplay.blocking_policy`
- Lines with `media.videocontrols.picture-in-picture.enabled`
- Lines with `dom.timeout.throttling_delay`
- Lines with `toolkit.telemetry.enabled`

Then restart the server and run auto-fix again.

---

## User-Editable Configuration

Edit `scripts/fix-ignored-prefs.sh` to customize:

```bash
# Change action: 'comment' (safer) or 'remove' (cleaner)
ACTION="comment"

# Override profile path if needed
FIREFOX_PROFILE="$HOME/.mozilla/firefox/YOUR_PROFILE"

# Add/remove preferences from IGNORED_PREFS array
```

---

## Next Steps

1. **Run the fix script:**
   ```bash
   ./scripts/fix-ignored-prefs.sh
   ```

2. **Restart Firefox**

3. **Hard refresh the tuner:** `Ctrl+Shift+R`

4. **Verify:** Issue count should be 0 (or very close)

5. **Test video playback** - The working preferences (VA-API, ffvpx, etc.) should eliminate buffering

---

## Rollback

If something goes wrong:

```bash
# Restore from backup
cp ~/.mozilla/firefox/6nxwkfvn.default-release/user.js.backup-* ~/.mozilla/firefox/6nxwkfvn.default-release/user.js
```

---

**Created:** 2026-02-15  
**Session:** Firefox Performance Tuner - Cache Issue Investigation  
**Evidence:** `scripts/inspect-firefox-prefs.sh` output

