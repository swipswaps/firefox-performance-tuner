# Workarounds for Locked/Hardcoded Firefox Preferences

**Problem:** Some Firefox preferences are hardcoded or locked by Mozilla and cannot be changed via `user.js`.

**This document explains how to work around these limitations.**

---

## 🔒 **1. `toolkit.telemetry.enabled` - LOCKED BY DISTRIBUTION BUILD**

### **Why It's Locked:**
- **CRITICAL:** This is NOT about Beta/Nightly vs Release
- **ACTUAL REASON:** FreeBSD/Linux distributions **patch Firefox at compile time** to disable telemetry
- **Evidence from your system:**
  ```javascript
  // In prefs.js:
  user_pref("toolkit.telemetry.server", "https://%(server)s/telemetry-dummy/");
  user_pref("toolkit.telemetry.unified", false);
  user_pref("toolkit.telemetry.archive.enabled", false);

  // toolkit.telemetry.enabled is NOT in prefs.js - it's LOCKED at build time
  ```
- **Your `user.js` is completely ignored** because the preference is hardcoded in the binary

### **Workaround Options:**

#### **Option A: Accept That Telemetry Is Already Disabled (Recommended)**
```bash
# Check your Firefox version
firefox --version
# Firefox 147.0.2 (release) on Linux/FreeBSD = telemetry ALREADY DISABLED

# Verify telemetry server is neutered:
grep "toolkit.telemetry.server" ~/.mozilla/firefox/*.default-release/prefs.js
# Should show: "https://%(server)s/telemetry-dummy/" (fake URL)

# Conclusion: You don't NEED to set toolkit.telemetry.enabled to false
# It's already disabled at the distribution level
```

#### **Option B: Compile Firefox from Source with Custom Patch**
```bash
# Clone Firefox source
hg clone https://hg.mozilla.org/mozilla-central/

# Edit modules/libpref/Preferences.cpp
# Find line 3722-3780 and change the locking logic:
# BEFORE:
#   if (IsNightly() || IsBeta()) {
#     Preferences::Lock(kTelemetryPref, true);
#   }
# AFTER:
#   // Custom build - allow user.js override
#   // (comment out the locking code)

# Build Firefox
./mach build
./mach run
```

#### **Option C: Use `about:config` Runtime Override (Temporary)**
```
1. Open Firefox
2. Navigate to: about:config
3. Search: toolkit.telemetry.enabled
4. Toggle to: false
5. Restart Firefox

⚠️ WARNING: This resets on every Firefox update
```

#### **Option D: Use Firefox Policy (Enterprise)**
```json
// Create: /etc/firefox/policies/policies.json
{
  "policies": {
    "DisableTelemetry": true
  }
}
```
**Advantage:** Survives Firefox updates  
**Disadvantage:** Requires root access

#### **Option E: Block Telemetry at Network Level**
```bash
# Add to /etc/hosts
127.0.0.1 incoming.telemetry.mozilla.org
127.0.0.1 telemetry.mozilla.org
127.0.0.1 telemetry-incoming.r53-2.services.mozilla.com
```
**Advantage:** Works regardless of preference  
**Disadvantage:** Doesn't stop local telemetry collection, only upload

---

## 🔄 **2. `browser.cache.memory.enable` - DEFAULT IS TRUE**

### **Why It's Ignored:**
- **Source:** `modules/libpref/init/StaticPrefList.yaml:1079`
- **Default:** `value: true`
- **Behavior:** Setting it to `true` in `user.js` is redundant

### **Workaround:**
**None needed!** The default behavior is already optimal. If you want to **disable** memory cache:

```javascript
// In user.js:
user_pref("browser.cache.memory.enable", false);  // This WILL work
```

**Note:** Only setting it to `true` is redundant. Setting it to `false` works fine.

---

## 🎬 **3. `media.rdd-process.enabled` - REMOVED (Always Enabled)**

### **Why It's Removed:**
- **Source:** Not in `StaticPrefList.yaml` (removed in Firefox 100+)
- **Behavior:** RDD (Remote Data Decoder) process is mandatory for security

### **Workaround Options:**

#### **Option A: Disable via Hidden Pref (Unsupported)**
```javascript
// Try this in about:config (may not work in Firefox 147):
media.rdd-process.enabled = false
```

#### **Option B: Use Older Firefox Version**
```bash
# Download Firefox ESR 91 (last version with configurable RDD)
# https://ftp.mozilla.org/pub/firefox/releases/91.0esr/
```

#### **Option C: Modify Firefox Source Code**
```cpp
// Edit: dom/media/ipc/RemoteDecoderManagerParent.cpp
// Find the RDD process launch code and add a pref check:

if (!Preferences::GetBool("media.rdd-process.force-enabled", true)) {
  // Skip RDD process launch
  return nullptr;
}
```

---

## 🎥 **4. `media.av1.enabled` - REMOVED (Always Enabled)**

### **Why It's Removed:**
- **Source:** Not in `StaticPrefList.yaml`
- **Behavior:** AV1 codec is standard in modern Firefox

### **Workaround:**
**To disable AV1 decoding** (if causing issues):

```javascript
// In about:config, try these alternatives:
media.av1.use-dav1d = false           // Disable dav1d decoder
media.av1.enabled = false             // May still work in some builds
```

**Or block AV1 at codec level:**
```javascript
// Force VP9 instead of AV1:
media.mediasource.vp9.enabled = true
media.mediasource.av1.enabled = false  // Disable AV1 in MSE
```

---

## ⏱️ **5. `dom.timeout.throttling_delay` - REMOVED/RENAMED**

### **Why It's Removed:**
- **Source:** Not in `StaticPrefList.yaml` (removed in Firefox 140+)
- **Behavior:** Replaced by different throttling mechanism

### **Workaround:**
**Use the modern equivalent:**

```javascript
// In user.js:
user_pref("dom.min_background_timeout_value", 10000);  // 10 seconds
user_pref("dom.timeout.background_throttling_max_budget", -1);  // Unlimited throttling
user_pref("dom.timeout.enable_budget_timer_throttling", true);
```

---

## 🎛️ **6. `media.autoplay.blocking_policy` - UI-CONTROLLED**

### **Why It's Locked:**
- **Source:** Security policy override
- **Behavior:** Controlled by Firefox UI (Settings → Privacy → Autoplay)

### **Workaround:**

#### **Option A: Use Firefox UI**
```
1. Open Firefox Settings
2. Privacy & Security → Permissions → Autoplay
3. Select: "Allow Audio and Video"
```

#### **Option B: Use Enterprise Policy**
```json
// /etc/firefox/policies/policies.json
{
  "policies": {
    "Permissions": {
      "Autoplay": {
        "Default": "allow-audio-video"
      }
    }
  }
}
```

---

## 📋 **Summary Table**

| Preference | Workaround | Difficulty | Recommended? |
|------------|-----------|------------|--------------|
| `toolkit.telemetry.enabled` | Use Release build | Easy | ✅ YES |
| `toolkit.telemetry.enabled` | Enterprise policy | Medium | ✅ YES |
| `toolkit.telemetry.enabled` | Compile from source | Hard | ❌ NO |
| `browser.cache.memory.enable` | None needed (default OK) | N/A | ✅ YES |
| `media.rdd-process.enabled` | Use older Firefox | Medium | ❌ NO (security risk) |
| `media.av1.enabled` | Disable via MSE prefs | Easy | ⚠️ MAYBE |
| `dom.timeout.throttling_delay` | Use modern equivalent | Easy | ✅ YES |
| `media.autoplay.blocking_policy` | Use Firefox UI | Easy | ✅ YES |

---

**Created:** 2026-02-15  
**Session:** Firefox Performance Tuner - Locked Preferences Investigation  
**Evidence:** Firefox source code at searchfox.org

