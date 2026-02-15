# 🦊 Firefox Performance Tuner

Monitor and optimize Firefox on Linux. Track processes, edit preferences, block telemetry.

## 🚀 Quick Start (3 Commands)

```bash
git clone https://github.com/swipswaps/firefox-performance-tuner.git
cd firefox-performance-tuner
npm install && npm start
```

**Opens automatically at:** http://localhost:3000

**That's it.** All features work immediately.

---

## ✨ What You Get

### 📊 Process Monitor
Real-time Firefox process tracking with CPU%, memory, threads. Groups processes by type (Main, Active Tabs, Idle/Preloaded, System).

### ⚙️ Preference Editor
Edit 49 Firefox preferences organized by category. Automatic backups. One-click restore.

### 📝 user.js Editor
Direct text editor for `user.js` file. Syntax highlighting. Automatic backups (keeps 5 most recent).

### 🛡️ Telemetry Blocking
Block Mozilla telemetry via DNS (`/etc/hosts`) or Enterprise Policy. Requires sudo.

### 🔧 Auto-Fix
One-click: Close Firefox → Apply optimizations → Reopen Firefox. Automatic backups.

### 🎬 External Video Player
Launch videos in VLC/MPV when Firefox stutters.

### 📈 GPU Monitor
Parse `MOZ_LOG` for GPU threading issues.

---

## 📋 Requirements

- **OS**: Linux (any distro)
- **Node.js**: 18+
- **Firefox**: Any version
- **Optional**: `glxinfo`, `vainfo` for GPU detection

## 📖 Usage

After running `npm start`, open http://localhost:3000 and click through the tabs. Everything works immediately - no configuration needed.

**Common tasks:**
- **Monitor processes**: Process Monitor tab (auto-refreshes)
- **Edit preferences**: Preferences tab → toggle switches → Save
- **Block telemetry**: Overview tab → Telemetry Blocking → Block (requires sudo password)
- **Quick optimize**: Overview tab → Auto-Fix All Issues (closes/restarts Firefox)

---

## 🌐 GitHub Pages Demo

**Live demo:** https://swipswaps.github.io/firefox-performance-tuner/

**Limitations:** Read-only mode. Features requiring filesystem access (editing, backups, telemetry blocking) are disabled.

**To enable Process Monitor on GitHub Pages:**
1. Install browser extension: [extension.xpi](https://github.com/swipswaps/firefox-performance-tuner/raw/master/extension.xpi)
2. Firefox → `about:addons` → Gear icon → "Install Add-on From File"
3. Refresh GitHub Pages
4. Process Monitor shows live data from `about:processes`

## 🛠️ Troubleshooting

**App won't start:**
```bash
npm install  # Reinstall dependencies
npm start    # Try again
```

**Preferences not applying:**
```bash
killall firefox  # Close Firefox completely
# Then restart Firefox and check about:config
```

**Port already in use:**
```bash
# Kill existing processes on ports 3000/3001
pkill -f "node.*server.js"
pkill -f vite
npm start
```

---

## 📄 License

MIT

