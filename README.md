# 🦊 Firefox Performance Tuner

Real-time monitoring and optimization for Firefox on Linux (X11 + Mesa). Monitor processes, edit preferences, detect GPU issues, and block telemetry.

## ✨ Features

### 📊 Process Monitor
- **Real-time Firefox process tracking** with intelligent classification
- **Grouped display**: Main Process, Active Content, Idle Content (preloaded/suspended), System Processes
- **Detailed metrics**: CPU %, Memory %, RSS, Thread count, Uptime
- **Smart labeling**: Distinguishes active tabs from idle/preloaded processes
- **Educational tooltips**: Explains Firefox's E10S/Fission multi-process architecture

### ⚙️ Preference Management
- **49 categorized preferences** organized by function:
  - GPU & Rendering (WebRender, hardware acceleration)
  - Process Management (E10S, Fission, content processes)
  - Media & Codecs (VA-API, AV1, VP9, hardware decoding)
  - Network & Prefetch (DNS, speculative connections)
  - Cache & Memory (disk cache, memory limits)
  - Tab Suspension (aggressive background throttling)
- **Live user.js editor** with syntax highlighting
- **Automatic backups** before every save (keeps 5 most recent)
- **One-click restore** from backup
- **Template generation** for new profiles
- **Validation** prevents dangerous values

### 🛡️ Telemetry Blocking
- **DNS-level blocking**: Blocks 16 Mozilla telemetry domains via `/etc/hosts`
- **Enterprise Policy**: System-wide telemetry disable via `/etc/firefox/policies/policies.json`
- **Fedora-aware**: Explains Fedora's compile-time telemetry redirection
- **Status monitoring**: Shows current blocking state
- **Automatic backups**: Creates backups before modifying system files

### 🎬 External Video Player Fallback
- **Auto-detection**: Finds VLC, MPV, Cinelerra on your system
- **One-click launch**: Open videos in external players when Firefox stutters
- **Clipboard integration**: Paste video URL and launch

### 🔧 Auto-Fix
- **One-click optimization**: Applies all recommended preferences
- **Automatic Firefox restart**: Closes Firefox, applies fixes, reopens automatically
- **Safety-first**: 5-layer protection (validation, backups, atomic writes)
- **Verified backups**: Ensures backups are readable before writing

### 📈 GPU Monitoring
- **MOZ_LOG parsing**: Detects GPU threading contention
- **Real-time alerts**: Shows when GPU delays occur
- **Performance insights**: Identifies rendering bottlenecks

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/swipswaps/firefox-performance-tuner.git
cd firefox-performance-tuner
npm install
```

### Run Locally

```bash
npm start
```

Opens:
- **Backend API**: `http://localhost:3001`
- **Frontend UI**: `http://localhost:3000` (opens automatically in browser)

### Development Mode

```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run dev
```

## 📖 How to Use Each Feature

### 1️⃣ Process Monitor
1. Navigate to **Process Monitor** tab
2. View grouped Firefox processes:
   - **🦊 Main Process**: Browser UI
   - **📄 Active Content**: Visible tabs or high CPU activity
   - **💤 Idle Content**: Preloaded/suspended processes
   - **🔧 System Processes**: GPU, RDD, Socket, Utility
3. Hover over process types for explanations
4. Use Firefox's built-in Task Manager (`Shift+Esc`) for tab URLs

### 2️⃣ Preference Editor
1. Navigate to **Preferences** tab
2. Browse preferences by category
3. Toggle switches to enable/disable preferences
4. Click **Save to user.js** to apply changes
5. Restart Firefox to activate new preferences

### 3️⃣ user.js Editor
1. Navigate to **user.js Editor** tab
2. Edit preferences directly in the text editor
3. Click **Save** (creates automatic backup)
4. Click **Restore from Backup** if needed
5. Restart Firefox to apply changes

### 4️⃣ Auto-Fix
1. Navigate to **Overview** tab
2. Review detected issues
3. Click **Auto-Fix All Issues**
4. Firefox closes automatically
5. Fixes applied with verified backup
6. Firefox reopens with optimizations active

### 5️⃣ Telemetry Blocking
1. Navigate to **Overview** tab → **Telemetry Blocking** section
2. Choose blocking method:
   - **DNS Blocking**: Modifies `/etc/hosts` (requires sudo)
   - **Enterprise Policy**: Creates `/etc/firefox/policies/policies.json` (requires sudo)
3. Click **Block Telemetry** button
4. Enter sudo password when prompted
5. Verify status shows "ACTIVE"

### 6️⃣ External Video Player
1. Navigate to **Overview** tab → **External Video Player Fallback**
2. Copy video URL to clipboard
3. Click detected player button (VLC/MPV/Cinelerra)
4. Video opens in external player

### 7️⃣ GPU Monitoring
1. Start Firefox with logging:
   ```bash
   MOZ_LOG="Graphics:5" MOZ_LOG_FILE="~/.cache/firefox-hud/mozlog_graphics.txt" firefox
   ```
2. Navigate to **GPU Log** tab
3. View real-time GPU delay events
4. Identify rendering bottlenecks

## 🔧 API Endpoints

### System
- `GET /api/system-info` - OpenGL, VA-API, session type
- `GET /api/health` - Server health check

### Processes
- `GET /api/processes` - Firefox processes with classification

### Preferences
- `GET /api/pref-categories` - 49 categorized preferences
- `GET /api/preferences` - Current values from `prefs.js`

### user.js
- `GET /api/user-js` - Read `user.js`
- `POST /api/user-js` - Write `user.js` (creates backup)
- `GET /api/user-js/backups` - List backups
- `POST /api/user-js/restore` - Restore from backup
- `POST /api/user-js/validate` - Dry-run validation

### Auto-Fix
- `POST /api/auto-fix` - Apply all optimizations (closes/restarts Firefox)

### Telemetry
- `GET /api/telemetry/status` - Check blocking status
- `POST /api/telemetry/block-dns` - DNS-level blocking (requires sudo)
- `POST /api/telemetry/install-policy` - Enterprise policy (requires sudo)

### External Players
- `GET /api/external-players` - Detect VLC/MPV/Cinelerra

### GPU
- `GET /api/gpu-log` - MOZ_LOG GPU delays

## 📁 Project Structure

```
firefox-performance-tuner/
├── server.js                          # Express API (port 3001)
├── src/
│   ├── App.jsx                        # Main React app
│   ├── components/
│   │   ├── ProcessMonitor.jsx         # Process grouping & classification
│   │   ├── PreferenceEditor.jsx       # Categorized preferences
│   │   ├── UserJsEditor.jsx           # Live editor with backups
│   │   ├── AutoFix.jsx                # One-click optimization
│   │   ├── TelemetryBlocker.jsx       # DNS/Policy blocking
│   │   ├── ExternalVideoPlayer.jsx    # VLC/MPV detection
│   │   └── GpuLog.jsx                 # MOZ_LOG parser
│   └── main.jsx
├── scripts/
│   ├── block-telemetry-dns.sh         # DNS blocking script
│   ├── fix-ignored-prefs.sh           # Preference cleanup
│   └── inspect-firefox-prefs.sh       # Preference inspector
├── docs/
│   ├── TELEMETRY-FEDORA-ANALYSIS.md   # Fedora telemetry explanation
│   ├── FIREFOX-ALTERNATIVES.md        # Alternative browsers
│   └── SUMMARY-TELEMETRY-SOLUTIONS.md # Telemetry blocking guide
└── package.json
```

## 🖥️ Requirements

- **OS**: Linux (Fedora, Ubuntu, Arch, etc.)
- **Node.js**: 18+
- **Firefox**: Any version
- **Session**: X11 (Wayland supported but X11 recommended)
- **Graphics**: Mesa drivers (Intel/AMD) or NVIDIA proprietary

## 🌐 GitHub Pages Deployment

Live demo: [https://swipswaps.github.io/firefox-performance-tuner/](https://swipswaps.github.io/firefox-performance-tuner/)

**Note**: GitHub Pages deployment is **read-only**. Features requiring filesystem access (user.js editing, backups, telemetry blocking) are disabled. Run locally for full functionality.

## 🛠️ Troubleshooting

### Preferences not applying
1. Close all Firefox windows: `killall firefox`
2. Verify `user.js` exists: `cat ~/.mozilla/firefox/*.default-release/user.js`
3. Restart Firefox
4. Check `about:config` to verify preferences loaded

### API connection errors
- Backend not running: `npm start`
- Port conflict: Check if port 3001/3000 already in use
- Profile not found: Verify `~/.mozilla/firefox/profiles.ini` exists

### Telemetry blocking fails
- Missing sudo: Script requires root access
- Backup failed: Check `/etc/hosts.backup` permissions
- Policy directory: Ensure `/etc/firefox/` exists

## 📄 License

MIT

