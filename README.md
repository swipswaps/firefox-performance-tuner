# 🦊 Firefox Performance Tuner

A React-based web application for monitoring and tuning Firefox performance on Linux systems with X11 + Mesa graphics.

## Features

- **Real-time Monitoring**: Live display of Firefox processes, CPU usage, and system metrics
- **Preference Management**: Automatically detect and apply critical performance preferences
- **GPU Delay Detection**: Monitor MOZ_LOG for GPU threading contention issues
- **System Information**: Display OpenGL renderer, VA-API status, and session type
- **Auto-refresh**: Configurable refresh intervals (1s, 5s, 10s)

## Based on

This app is based on the `firefox_full_performance_hud_autotune.sh` bash script, which provides:
- Profile detection and resolution
- Critical preference validation
- GPU threading contention monitoring
- X11 + Mesa optimization recommendations

## Installation

```bash
cd firefox-performance-tuner
npm install
```

## Usage

### Start the application

```bash
npm start
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend React app on `http://localhost:3000`

### Development mode

Run frontend and backend separately:

```bash
# Terminal 1 - Backend API
npm run server

# Terminal 2 - Frontend
npm run dev
```

## Critical Preferences

The app monitors and applies these critical preferences for X11 + Mesa optimization:

- `gfx.webrender.enable-gpu-thread`: false (disable GPU thread to avoid contention)
- `gfx.gl.multithreaded`: false (disable GL multithreading)
- `dom.ipc.processCount`: 4 (reduce process count)
- `dom.ipc.processCount.web`: 4 (reduce web content processes)
- `gfx.webrender.wait-for-gpu`: false (don't wait for GPU)
- `media.ffvpx.enabled`: true (enable software fallback)
- `network.prefetch-next`: true (enable network prefetching)

## How It Works

### Frontend (React)
- Displays real-time Firefox performance metrics
- Shows preference status with visual indicators (✓/✗/⚠)
- Provides controls for monitoring and preference application

### Backend (Express API)
- Reads Firefox profile from `~/.mozilla/firefox/profiles.ini`
- Parses `prefs.js` to check current preference values
- Monitors Firefox processes via `ps aux`
- Reads MOZ_LOG files for GPU delay detection
- Applies preferences to `user.js` when requested

## API Endpoints

- `GET /api/system-info` - System graphics information
- `GET /api/preferences` - Current Firefox preferences
- `GET /api/processes` - Running Firefox processes
- `GET /api/logs` - MOZ_LOG GPU delay logs
- `POST /api/apply-preferences` - Apply critical preferences to user.js

## Requirements

- Node.js 18+
- Firefox installed
- Linux with X11 session
- Optional: `glxinfo` (mesa-demos package)
- Optional: `vainfo` (libva-utils package)

## Enabling MOZ_LOG

To enable GPU delay logging, start Firefox with:

```bash
MOZ_LOG="Graphics:5" MOZ_LOG_FILE="~/.cache/firefox-hud/mozlog_graphics.txt" firefox
```

## Troubleshooting

### Preferences not applying
1. Close all Firefox windows
2. Run: `killall firefox`
3. Start Firefox normally
4. Refresh the app to verify preferences

### API connection errors
- Ensure backend server is running on port 3001
- Check that Firefox profile can be resolved
- Verify `~/.mozilla/firefox/profiles.ini` exists

## License

ISC

