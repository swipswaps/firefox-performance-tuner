# Firefox Performance Tuner Bridge Extension

This WebExtension enables the Firefox Performance Tuner web app (on GitHub Pages) to access real Firefox process data from `about:processes`.

## How It Works

1. **Background Script** (`background.js`): Opens `about:processes` in a hidden tab and scrapes process data (PID, CPU%, memory, threads)
2. **Content Script** (`content.js`): Injects into the Performance Tuner web page and exposes `window.firefoxProcessBridge` API
3. **React App** (`ProcessMonitor.jsx`): Calls `window.firefoxProcessBridge.getProcesses()` to fetch live data

## Installation

### From File (Development)

1. Download `extension.xpi` from the repo
2. Open Firefox: `about:addons`
3. Click gear icon → "Install Add-on From File"
4. Select `extension.xpi`
5. Refresh the Performance Tuner page

### From Source (Development)

1. Open Firefox: `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from the `extension/` directory
4. Extension loads temporarily (until Firefox restart)

## Permissions

- `tabs`: Access to tab management for opening `about:processes`
- `webNavigation`: Monitor page loads
- `<all_urls>`: Inject content script into Performance Tuner pages

## Security

- Only injects into `swipswaps.github.io/firefox-performance-tuner/*` and `localhost:3000/*`
- Does not access or transmit any data outside Firefox
- Process data stays local (never sent to external servers)

## Data Extracted

From `about:processes` table rows:
- PID (Process ID)
- Type (Browser, Content, GPU, RDD, Socket, etc.)
- CPU % (current CPU usage)
- Memory % (percentage of system memory)
- RSS (Resident Set Size in bytes)
- Threads (thread count)

## Compatibility

- Firefox 109.0+
- Manifest V2 (Firefox WebExtension format)

