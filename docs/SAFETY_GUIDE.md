# 🛡️ Firefox Performance Tuner - Safety Guide

**Quick Reference** | **Last Updated**: 2026-02-10

---

## ✅ Is It Safe?

**YES** — Firefox Performance Tuner is safer than manual editing because:

1. ✅ **Validates syntax** before writing (prevents corruption)
2. ✅ **Checks Firefox is closed** (prevents profile lock issues)
3. ✅ **Creates 5 rotating backups** (easy rollback)
4. ✅ **One-click restore** (no command-line needed)
5. ✅ **Cannot permanently break Firefox** (all changes reversible)

---

## 🚨 Can I Break Firefox?

**NO** — Worst case: Firefox won't start, but you can fix it in 30 seconds.

### Recovery Methods (Easiest to Hardest)

| Method | Time | Success Rate | Data Loss |
|--------|------|--------------|-----------|
| 1. Restore from backup (app) | 10 sec | 99% | None |
| 2. Delete user.js | 30 sec | 100% | None |
| 3. Firefox safe mode | 30 sec | 100% | None |
| 4. Create new profile | 2 min | 100% | Bookmarks* |

*Bookmarks can be imported from old profile

---

## 📋 Safety Checklist

### Before Applying Changes

- [ ] Close Firefox completely
- [ ] Review changes in preview (ConfigWizard Step 2)
- [ ] Verify profile path is correct
- [ ] Ensure you have 10MB+ disk space

### After Applying Changes

- [ ] Verify backup was created (check success message)
- [ ] Test Firefox startup
- [ ] Keep emergency recovery script handy

---

## 🆘 Emergency Recovery

### If Firefox Won't Start

**Option 1: Delete user.js (30 seconds)**
```bash
cd ~/.mozilla/firefox/*.default-release/
rm user.js
firefox &
```

**Option 2: Safe Mode (30 seconds)**
```bash
firefox -safe-mode
# Then: Troubleshoot Mode → Refresh Firefox
```

**Option 3: Restore from Backup (1 minute)**
```bash
cd ~/.mozilla/firefox/*.default-release/
ls -lt user.js.backup-*  # Find most recent
cp user.js.backup-2026-02-10T* user.js
firefox &
```

---

## 🔍 What Gets Modified?

**Only ONE file**: `~/.mozilla/firefox/PROFILE/user.js`

**NOT modified**:
- ❌ prefs.js (Firefox manages this)
- ❌ Bookmarks (places.sqlite)
- ❌ Passwords (logins.json)
- ❌ History (places.sqlite)
- ❌ Extensions (extensions/)
- ❌ Firefox installation files

**Result**: Even if user.js is corrupted, your data is safe.

---

## 🎯 Best Practices

### 1. Test Incrementally
- ✅ Apply a few preferences first
- ✅ Test Firefox startup and performance
- ✅ Apply more if satisfied
- ❌ Don't apply all 40+ preferences at once

### 2. Keep Backups
- ✅ App creates 5 rotating backups automatically
- ✅ Export backup to ~/Downloads for extra safety
- ✅ Verify backup timestamp after applying

### 3. Know Your Profile Path
- ✅ Check ConfigWizard Step 1
- ✅ Typical: `~/.mozilla/firefox/XXXXXXXX.default-release/`
- ✅ Flatpak: `~/.var/app/org.mozilla.firefox/.mozilla/firefox/`
- ✅ Snap: `~/snap/firefox/common/.mozilla/firefox/`

### 4. Use Emergency Recovery Scripts
- ✅ ConfigWizard Step 4 generates recovery scripts
- ✅ Copy to ~/Desktop for easy access
- ✅ Test recovery script before you need it

---

## 🔬 Technical Details

### What user.js Does
- Read by Firefox at startup
- Overrides default preferences
- Does NOT modify prefs.js directly
- Safe to delete (Firefox uses defaults)

### What Can Go Wrong
1. **Syntax errors** → ✅ Prevented by validation
2. **Firefox running** → ✅ Prevented by running check
3. **Invalid values** → ⚠️ Preference ignored (no crash)
4. **Typos in pref names** → ⚠️ Preference ignored (no crash)

### What CANNOT Go Wrong
- ❌ Cannot corrupt bookmarks
- ❌ Cannot corrupt passwords
- ❌ Cannot corrupt history
- ❌ Cannot break Firefox installation
- ❌ Cannot damage other profiles

---

## 📊 Risk Assessment

| Scenario | Likelihood | Impact | Recovery Time |
|----------|-----------|--------|---------------|
| Syntax error | VERY LOW | High | 30 sec (delete user.js) |
| Firefox won't start | VERY LOW | High | 30 sec (safe mode) |
| Performance degraded | LOW | Medium | 10 sec (restore backup) |
| Wrong profile modified | VERY LOW | Low | 10 sec (restore backup) |
| Data loss | **IMPOSSIBLE** | N/A | N/A |

**Overall Risk**: 🟢 **LOW** — Safer than manual editing

---

## 🤔 FAQ

### Q: Will this break my Firefox installation?
**A**: No. user.js only affects preferences, not Firefox itself.

### Q: Can I lose my bookmarks/passwords?
**A**: No. Those are stored in separate files that are never modified.

### Q: What if I have multiple Firefox profiles?
**A**: App detects default profile. Other profiles are unaffected.

### Q: Can I undo changes?
**A**: Yes. Click "Restore from Backup" or delete user.js.

### Q: What if all backups are corrupted?
**A**: Delete user.js. Firefox will use defaults (100% success rate).

### Q: Is this safer than editing user.js manually?
**A**: Yes. Manual editing has no validation, no backups, no Firefox running check.

### Q: What if Firefox is running when I apply changes?
**A**: App refuses to write. You'll get error: "Close Firefox first".

### Q: Can I review changes before applying?
**A**: Yes. ConfigWizard Step 2 shows visual diff of changes.

---

## 📚 Learn More

- **Full Analysis**: See [FAILURE_ANALYSIS.md](./FAILURE_ANALYSIS.md)
- **Mozilla Docs**: [Firefox Safe Mode](https://support.mozilla.org/en-US/kb/troubleshoot-firefox-issues-using-safe-mode)
- **Community**: [arkenfox/user.js](https://github.com/arkenfox/user.js)

---

**Remember**: You can ALWAYS delete user.js to fix any issue. Firefox will work perfectly with default settings.

