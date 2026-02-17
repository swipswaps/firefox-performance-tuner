import express from "express";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, copyFile, readdir, unlink } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { diffLines } from "diff";

const execFileAsync = promisify(execFile);

const app = express();

// ============================================================================
// ACTIVE DOWNLOAD REGISTRY
// ============================================================================

/**
 * ACTIVE DOWNLOAD REGISTRY
 *
 * Purpose: Track all in-progress YouTube downloads for:
 *  - Resume support (continue partial downloads after interruption)
 *  - Cancellation (kill yt-dlp process on user request)
 *  - Progress tracking (real-time download percentage)
 *  - Stall detection (identify stuck downloads)
 *
 * Data structure:
 *  Map<downloadId, {
 *    process: ChildProcess,      // yt-dlp process handle
 *    progress: number,            // Download percentage (0-100)
 *    filePath: string,            // Absolute path to MP4 file
 *    lastUpdate: number,          // Timestamp of last progress update
 *    url: string,                 // Original YouTube URL
 *    playerPid: number|null       // MPV/VLC process ID (if launched)
 *  }>
 *
 * Why Map instead of Object:
 *  - Faster iteration for stall detection
 *  - Cleaner API (has/get/set/delete)
 *  - No prototype pollution risk
 *
 * Lifecycle:
 *  1. Entry created when download starts
 *  2. Updated every time yt-dlp emits progress
 *  3. Deleted when download completes or is cancelled
 */
const activeDownloads = new Map();

// === SECURITY BASELINE (OWASP + Express best practices) ===
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — Vite injects inline scripts in dev
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
});
app.use("/api/", limiter);

const MOZILLA_DIR = `${process.env.HOME}/.mozilla/firefox`;
const STATE_DIR = `${process.env.HOME}/.cache/firefox-hud`;

// Categorized preferences with descriptions
// Sources: Betterfox v146, ArchWiki Firefox/Tweaks (Jan 2026), Mozilla docs
// Optimized for: VM with llvmpipe (software rendering), 8GB RAM, 2 cores
const PREF_CATEGORIES = {
  "GPU & Rendering": {
    "gfx.webrender.all": {
      expected: "true",
      description:
        "Force WebRender for all content — GPU-accelerated 2D rendering (Betterfox)",
    },
    "gfx.webrender.software": {
      expected: "true",
      description:
        "Enable Software WebRender — required when hardware GPU is unavailable (llvmpipe/VM)",
    },
    "gfx.canvas.accelerated.cache-items": {
      expected: "32768",
      description:
        "Increase accelerated canvas cache items for smoother rendering (Betterfox)",
    },
    "gfx.canvas.accelerated.cache-size": {
      expected: "4096",
      description: "Increase accelerated canvas cache size in MB (Betterfox)",
    },
    "gfx.content.skia-font-cache-size": {
      expected: "32",
      description:
        "Increase Skia font cache — reduces font re-rasterization (Betterfox)",
    },
    "image.cache.size": {
      expected: "10485760",
      description:
        "Increase decoded image cache to 10MB — fewer re-decodes (Betterfox)",
    },
    "image.mem.decode_bytes_at_a_time": {
      expected: "65536",
      description:
        "Decode images in 64KB chunks instead of 16KB — faster loading (Betterfox)",
    },
  },
  "Cache & Memory": {
    "browser.cache.disk.enable": {
      expected: "false",
      description:
        "Disable disk cache — eliminates frequent disk writes, use memory only (Betterfox/ArchWiki)",
    },
    // REMOVED: browser.cache.memory.enable - Firefox 147 ignores this (default is already true)
    "browser.cache.memory.capacity": {
      expected: "131072",
      description:
        "Set memory cache to 128MB — default auto-select uses decade-old table (Betterfox)",
    },
    "browser.cache.memory.max_entry_size": {
      expected: "20480",
      description:
        "Allow up to 20MB per cache entry — prevents large resources from bypassing cache (Betterfox)",
    },
    "browser.sessionhistory.max_total_viewers": {
      expected: "4",
      description:
        "Keep 4 pages in back/forward cache — balance between memory and speed (Betterfox)",
    },
    "browser.privatebrowsing.forceMediaMemoryCache": {
      expected: "true",
      description:
        "Force media to use memory cache — avoids disk writes for media (Betterfox)",
    },
  },
  Media: {
    "media.memory_cache_max_size": {
      expected: "262144",
      description:
        "Increase media memory cache to 256MB — smoother video playback (Betterfox)",
    },
    "media.memory_caches_combined_limit_kb": {
      expected: "1048576",
      description:
        "Combined media cache limit 1GB — prevents cache eviction during streaming (Betterfox)",
    },
    "media.cache_readahead_limit": {
      expected: "600",
      description:
        "Read ahead 600 seconds of media — fewer buffering stalls (Betterfox)",
    },
    "media.cache_resume_threshold": {
      expected: "300",
      description:
        "Resume caching when buffer drops below 300s — prevents buffer underruns (Betterfox)",
    },
    "media.ffvpx.enabled": {
      expected: "true",
      description:
        "Enable software video decoding (ffvpx) — required when no hardware VA-API",
    },
    "media.ffmpeg.vaapi.enabled": {
      expected: "true",
      description:
        "Enable VA-API hardware video decoding — eliminates spinning wheel during video playback",
    },
    // REMOVED: media.rdd-process.enabled - Always enabled in Firefox 147, not user-configurable
    // REMOVED: media.av1.enabled - Always enabled in Firefox 147, not user-configurable
    // REMOVED: media.navigator.mediadatadecoder_vpx_enabled - Removed in Firefox 147
    // REMOVED: media.autoplay.blocking_policy - Controlled by UI, user.js override disabled
    "media.block-autoplay-until-in-foreground": {
      expected: "false",
      description:
        "Don't wait for foreground to play video — reduces buffering delays",
    },
    "media.suspend-bkgnd-video.enabled": {
      expected: "true",
      description:
        "Suspend background video playback — saves CPU/battery when tab not visible",
    },
    "media.suspend-bkgnd-video.delay-ms": {
      expected: "5000",
      description:
        "Delay before suspending background video (5 seconds) — prevents premature suspension",
    },
    // REMOVED: media.videocontrols.picture-in-picture.enabled - Always enabled in Firefox 147
  },
  "Tab Suspension & Background Management": {
    "browser.tabs.unloadOnLowMemory": {
      expected: "true",
      description:
        "Automatically unload tabs when memory is low — prevents system slowdown",
    },
    "browser.sessionstore.interval": {
      expected: "60000",
      description:
        "Save session every 60 seconds (instead of 15s) — reduces disk writes",
    },
    "browser.sessionstore.max_tabs_undo": {
      expected: "10",
      description:
        "Keep 10 closed tabs in undo history — balance between memory and convenience",
    },
    "dom.min_background_timeout_value": {
      expected: "10000",
      description:
        "Throttle background tab timers to 10 seconds — drastically reduces CPU usage",
    },
    // REMOVED: dom.timeout.throttling_delay - Removed or renamed in Firefox 147
    "dom.ipc.keepProcessesAlive.web": {
      expected: "1",
      description:
        "Keep only 1 web content process alive when idle — reduces memory footprint",
    },
    "browser.tabs.remote.warmup.enabled": {
      expected: "false",
      description:
        "Disable tab warmup — don't preload tabs, saves memory",
    },
    "browser.tabs.remote.warmup.maxTabs": {
      expected: "0",
      description:
        "Don't warm up any tabs — prevents unnecessary resource usage",
    },
  },
  Network: {
    "network.http.max-connections": {
      expected: "1800",
      description:
        "Increase max connections from 900 to 1800 — faster parallel downloads (Betterfox)",
    },
    "network.http.max-persistent-connections-per-server": {
      expected: "10",
      description:
        "Allow 10 persistent connections per server (default 6) — faster page loads (Betterfox)",
    },
    "network.http.max-urgent-start-excessive-connections-per-host": {
      expected: "5",
      description:
        "Allow 5 urgent connections per host — faster critical resource loading (Betterfox)",
    },
    "network.http.pacing.requests.enabled": {
      expected: "false",
      description:
        "Disable request pacing — send requests immediately without throttling (Betterfox)",
    },
    "network.dnsCacheEntries": {
      expected: "10000",
      description:
        "Cache 10K DNS entries (default 400) — fewer DNS lookups (Betterfox)",
    },
    "network.dnsCacheExpiration": {
      expected: "3600",
      description:
        "Keep DNS cache entries for 1 hour (default 60s) — fewer re-lookups (Betterfox)",
    },
    "network.ssl_tokens_cache_capacity": {
      expected: "10240",
      description:
        "Increase SSL session token cache — faster HTTPS reconnections (Betterfox)",
    },
  },
  "Speculative Loading": {
    "network.http.speculative-parallel-limit": {
      expected: "0",
      description:
        "Disable speculative connections — saves CPU/bandwidth on low-end systems (Betterfox)",
    },
    "network.dns.disablePrefetch": {
      expected: "true",
      description:
        "Disable DNS prefetching — saves resources, improves privacy (Betterfox)",
    },
    "network.dns.disablePrefetchFromHTTPS": {
      expected: "true",
      description:
        "Disable DNS prefetch from HTTPS pages — saves resources (Betterfox)",
    },
    "network.prefetch-next": {
      expected: "false",
      description:
        "Disable link prefetching — prevents unwanted background downloads (Betterfox)",
    },
    "browser.urlbar.speculativeConnect.enabled": {
      expected: "false",
      description:
        "Disable speculative URL bar connections — saves resources (Betterfox)",
    },
    "browser.places.speculativeConnect.enabled": {
      expected: "false",
      description: "Disable bookmarks speculative connections (Betterfox)",
    },
  },
  "Process Management": {
    "dom.ipc.processCount": {
      expected: "4",
      description:
        "Limit content processes to 4 — optimal for 2-core CPU, reduces memory/CPU contention (ArchWiki)",
    },
    // browser.sessionstore.interval removed - duplicate of Tab Suspension category (line 182)
    "browser.sessionstore.max_tabs_undo": {
      expected: "10",
      description:
        "Keep undo data for 10 tabs — balance between memory and convenience (Betterfox)",
    },
  },
  "Telemetry & Experiments": {
    "datareporting.policy.dataSubmissionEnabled": {
      expected: "false",
      description:
        "Disable data reporting — saves bandwidth and CPU (Betterfox)",
    },
    // REMOVED: toolkit.telemetry.enabled - LOCKED by Mozilla in Beta/Nightly (Bugzilla #1422689)
    "toolkit.telemetry.unified": {
      expected: "false",
      description:
        "Disable unified telemetry — prevents data gathering overhead (Betterfox)",
    },
    "toolkit.telemetry.archive.enabled": {
      expected: "false",
      description: "Disable telemetry archive — saves disk writes (Betterfox)",
    },
    "app.normandy.enabled": {
      expected: "false",
      description:
        "Disable remote experiment/study system — prevents unexpected behavior changes (Betterfox)",
    },
    "app.shield.optoutstudies.enabled": {
      expected: "false",
      description:
        "Opt out of Shield studies — prevents A/B test overhead (Betterfox)",
    },
    "browser.newtabpage.activity-stream.feeds.telemetry": {
      expected: "false",
      description:
        "Disable new tab telemetry feed — saves CPU on every new tab (Betterfox)",
    },
  },
};

// Flatten categories into a simple key->expected map
function getFlatPrefs() {
  const flat = {};
  for (const cat of Object.values(PREF_CATEGORIES)) {
    for (const [key, val] of Object.entries(cat)) {
      flat[key] = val.expected;
    }
  }
  return flat;
}

// === SECURITY HELPERS ===

// Strip filesystem paths and stack traces from error messages (OWASP: information disclosure)
function safeError(error) {
  const msg = (error.message || "Internal server error")
    .replace(/\/home\/[^\s]+/g, "[path]")
    .replace(/\n.*at .*/g, "");
  return { error: msg.length > 200 ? "Operation failed" : msg };
}

// Dangerous preference values that will break Firefox
const DANGEROUS_VALUES = {
  "network.http.max-connections": { min: 1, max: 65535, reason: "0 disables all network access" },
  "network.http.max-persistent-connections-per-server": { min: 1, max: 100, reason: "0 disables persistent connections" },
  "dom.ipc.processCount": { min: 1, max: 64, reason: "0 prevents Firefox from starting" },
  "dom.ipc.processCount.web": { min: 1, max: 64, reason: "0 prevents web content from loading" },
  "browser.cache.memory.capacity": { min: 1024, max: 2097152, reason: "Too low causes crashes, too high exhausts memory" },
  "media.memory_cache_max_size": { min: 1024, max: 2097152, reason: "Invalid values break media playback" },
};

/**
 * Validate user.js content with corruption prevention
 * Checks for:
 * - Syntax errors that could break Firefox startup
 * - Balanced quotes and parentheses
 * - Valid user_pref() calls only
 * - No shell injection attempts
 * - No dangerous characters
 * - Dangerous preference values (NEW)
 */
function validateUserJS(content) {
  if (typeof content !== "string")
    return { valid: false, reason: "Content must be a string" };
  if (content.length > 512 * 1024)
    return { valid: false, reason: "Content too large (max 512KB)" };

  // Check for null bytes or control characters (except newline, tab, carriage return)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
    return {
      valid: false,
      reason: "Content contains invalid control characters",
    };
  }

  // Check for balanced quotes and parentheses
  let quoteCount = 0;
  let parenDepth = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    if (char === '"' && prevChar !== "\\") quoteCount++;
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;

    if (parenDepth < 0) {
      return {
        valid: false,
        reason: "Unbalanced parentheses (too many closing)",
      };
    }
  }

  if (quoteCount % 2 !== 0) {
    return {
      valid: false,
      reason: "Unbalanced quotes - this will corrupt Firefox profile",
    };
  }

  if (parenDepth !== 0) {
    return {
      valid: false,
      reason: "Unbalanced parentheses - this will corrupt Firefox profile",
    };
  }

  const warnings = [];

  // Validate each line
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Allow empty lines and comments
    if (
      line === "" ||
      line.startsWith("//") ||
      line.startsWith("/*") ||
      line.startsWith("*") ||
      line === "*/"
    ) {
      continue;
    }

    // Must be valid user_pref() call
    // Format: user_pref("pref.name", value);
    // Value can be: true, false, number, or "string"
    if (
      !/^user_pref\("[-a-zA-Z0-9._]+",\s*(true|false|-?\d+(\.\d+)?|"[^"]*")\);$/.test(
        line,
      )
    ) {
      return {
        valid: false,
        reason: `Invalid syntax on line ${i + 1}: ${line.substring(0, 80)}...\nMust be: user_pref("pref.name", value);`,
      };
    }

    // Check for shell injection attempts in pref names
    const prefNameMatch = line.match(/user_pref\("([^"]+)"/);
    if (prefNameMatch) {
      const prefName = prefNameMatch[1];
      if (/[;&|`$(){}[\]<>]/.test(prefName)) {
        return {
          valid: false,
          reason: `Dangerous characters in pref name on line ${i + 1}`,
        };
      }
    }

    // NEW: Check for dangerous preference values
    const prefMatch = line.match(/user_pref\("([^"]+)",\s*(-?\d+(?:\.\d+)?|true|false|"[^"]*")\);/);
    if (prefMatch) {
      const [, prefName, prefValue] = prefMatch;

      if (DANGEROUS_VALUES[prefName]) {
        const rule = DANGEROUS_VALUES[prefName];
        const numValue = parseInt(prefValue, 10);

        if (!isNaN(numValue)) {
          if (numValue < rule.min || numValue > rule.max) {
            return {
              valid: false,
              reason: `DANGEROUS: ${prefName} = ${numValue} will break Firefox!\n` +
                      `Reason: ${rule.reason}\n` +
                      `Allowed range: ${rule.min} to ${rule.max}`,
            };
          }
        }
      }

      // Warn about unknown preferences (not in PREF_CATEGORIES)
      const allKnownPrefs = Object.values(PREF_CATEGORIES).flatMap(cat => Object.keys(cat));
      if (!allKnownPrefs.includes(prefName)) {
        warnings.push(`Line ${i + 1}: Unknown preference "${prefName}" (typo or custom pref?)`);
      }
    }
  }

  return { valid: true, warnings };
}

// Rotate backups — keep timestamped copies, prune to maxBackups (arkenfox pattern)
// NEW: Verify backup is readable after creation
async function rotateBackups(filePath, maxBackups = 5) {
  if (!existsSync(filePath)) return null;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(dir, `${base}.backup-${timestamp}`);

  // Create backup
  await copyFile(filePath, backupPath);

  // NEW: Verify backup is readable and matches original
  try {
    const originalContent = await readFile(filePath, "utf-8");
    const backupContent = await readFile(backupPath, "utf-8");

    if (originalContent !== backupContent) {
      throw new Error("Backup verification failed: content mismatch");
    }
  } catch (error) {
    // If verification fails, delete bad backup and throw error
    await unlink(backupPath).catch(() => {});
    throw new Error(`Backup creation failed: ${error.message}`);
  }

  // Prune old backups beyond maxBackups
  const files = await readdir(dir);
  const backups = files
    .filter((f) => f.startsWith(`${base}.backup-`))
    .sort()
    .reverse();

  for (const old of backups.slice(maxBackups)) {
    await unlink(path.join(dir, old)).catch(() => {});
  }

  return backupPath;
}

// Check if Firefox is running — refuse writes while profile is active
async function isFirefoxRunning() {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", "firefox"], {
      timeout: 3000,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// === HEALTH ENDPOINT ===
const SERVER_VERSION = Date.now(); // Timestamp for cache detection
const PREF_COUNT = Object.values(PREF_CATEGORIES).reduce((sum, cat) => sum + Object.keys(cat).length, 0);

app.get("/api/health", (_req, res) => {
  // No-cache headers to prevent stale data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json({
    status: "ok",
    mode: "full",
    version: SERVER_VERSION,
    prefCount: PREF_COUNT,
    timestamp: Date.now()
  });
});

// Resolve active Firefox profile
async function resolveProfile() {
  const profilesIni = `${MOZILLA_DIR}/profiles.ini`;
  try {
    const content = await readFile(profilesIni, "utf-8");
    const lines = content.split("\n");

    // Look for Install-locked default
    let inInstall = false;
    for (const line of lines) {
      if (line.startsWith("[Install")) inInstall = true;
      if (inInstall && line.startsWith("Default=")) {
        return line.split("=")[1].trim();
      }
    }

    // Fallback: find Profile section with Default=1, then get its Path
    let currentPath = "";
    let foundDefault = false;
    for (const line of lines) {
      if (line.startsWith("[Profile")) {
        currentPath = "";
        foundDefault = false;
      }
      if (line.startsWith("Path=")) {
        currentPath = line.split("=")[1].trim();
      }
      if (line === "Default=1") {
        foundDefault = true;
      }
      if (foundDefault && currentPath) {
        return currentPath;
      }
    }
    throw new Error("No default profile found in profiles.ini");
  } catch (error) {
    throw new Error(`Cannot resolve Firefox profile: ${error.message}`);
  }
}

// Get system information (execFile — no shell spawning)
app.get("/api/system-info", async (req, res) => {
  try {
    const display = process.env.DISPLAY || "<not set>";
    const session = process.env.XDG_SESSION_TYPE || "<not set>";

    let renderer = "<not available>";
    let version = "<not available>";
    let vaapi = "<not available>";

    try {
      const { stdout } = await execFileAsync("glxinfo", [], { timeout: 5000 });
      const rendererLine = stdout
        .split("\n")
        .find((l) => l.includes("OpenGL renderer"));
      renderer = rendererLine?.split(":")[1]?.trim() || "<not available>";
      const versionLine = stdout
        .split("\n")
        .find((l) => l.includes("OpenGL version"));
      version = versionLine?.split(":")[1]?.trim() || "<not available>";
    } catch (_e) { /* glxinfo not available */ }

    try {
      const { stdout, stderr } = await execFileAsync("vainfo", [], {
        timeout: 5000,
      });
      const combined = stdout + stderr;
      const driverLine = combined
        .split("\n")
        .find((l) => l.includes("Driver version"));
      vaapi = driverLine?.split(":")[1]?.trim() || "<not available>";
    } catch (_e) { /* vainfo not available */ }

    res.json({ display, session, renderer, version, vaapi });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Get Firefox preferences (reads from prefs.js — the runtime state)
app.get("/api/preferences", async (req, res) => {
  // No-cache headers - critical for real-time preference monitoring
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const profilePath = await resolveProfile();
    const prefsFile = `${MOZILLA_DIR}/${profilePath}/prefs.js`;

    if (!existsSync(prefsFile)) {
      return res.json({});
    }

    const content = await readFile(prefsFile, "utf-8");
    const prefs = {};
    const flatPrefs = getFlatPrefs();

    for (const pref of Object.keys(flatPrefs)) {
      // Match both user_pref("key", value) and pref("key", value) formats
      const escaped = pref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:user_)?pref\\("${escaped}",\\s*([^)]+)\\)`);
      const match = content.match(regex);
      if (match) {
        prefs[pref] = match[1].trim();
      }
    }

    res.json(prefs);
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Get preference categories with descriptions
app.get("/api/pref-categories", (req, res) => {
  // No-cache headers - critical for detecting server updates
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Server-Version', SERVER_VERSION);
  res.setHeader('X-Pref-Count', PREF_COUNT);

  res.json(PREF_CATEGORIES);
});

// System benchmark — detect capabilities and generate recommendations
app.get("/api/benchmark", async (req, res) => {
  try {
    const results = { gpu: {}, system: {}, recommendations: [], score: 0 };

    // GPU detection (execFile — no shell)
    try {
      const { stdout } = await execFileAsync("glxinfo", [], { timeout: 5000 });
      const rendererLine = stdout
        .split("\n")
        .find((l) => l.includes("OpenGL renderer"));
      results.gpu.renderer = rendererLine?.split(":")[1]?.trim() || "unknown";
      const versionLine = stdout
        .split("\n")
        .find((l) => l.includes("OpenGL version"));
      results.gpu.glVersion = versionLine?.split(":")[1]?.trim() || "unknown";
    } catch {
      results.gpu.renderer = "unavailable";
      results.gpu.glVersion = "unavailable";
    }

    try {
      const { stdout } = await execFileAsync("lspci", [], { timeout: 5000 });
      const gpuLine = stdout.split("\n").find((l) => /vga|3d|display/i.test(l));
      results.gpu.device =
        gpuLine?.replace(/^[^:]+:\s*/, "").trim() || "unknown";
    } catch {
      results.gpu.device = "unavailable";
    }

    results.gpu.isSoftwareRenderer = /llvmpipe|softpipe|swrast/i.test(
      results.gpu.renderer,
    );
    results.gpu.isVirtual = /virtio|vmware|virtualbox|qxl/i.test(
      results.gpu.device || "",
    );

    // System info (read /proc directly — no shell needed)
    try {
      const meminfo = await readFile("/proc/meminfo", "utf-8");
      const memLine = meminfo.split("\n").find((l) => l.startsWith("MemTotal"));
      results.system.ramKb = parseInt(memLine?.split(/\s+/)[1]) || 0;
      results.system.ramMb = Math.round(results.system.ramKb / 1024);
      results.system.ramGb = (results.system.ramKb / 1048576).toFixed(1);
    } catch {
      results.system.ramKb = 0;
    }

    try {
      const { stdout } = await execFileAsync("nproc", [], { timeout: 3000 });
      results.system.cpuCores = parseInt(stdout.trim()) || 1;
    } catch {
      results.system.cpuCores = 1;
    }

    try {
      const cpuinfo = await readFile("/proc/cpuinfo", "utf-8");
      const modelLine = cpuinfo
        .split("\n")
        .find((l) => l.includes("model name"));
      results.system.cpuModel = modelLine?.split(":")[1]?.trim() || "unknown";
    } catch {
      results.system.cpuModel = "unknown";
    }

    // VA-API (hardware video decode)
    try {
      const { stdout, stderr } = await execFileAsync("vainfo", [], {
        timeout: 5000,
      });
      const combined = stdout + stderr;
      const driverLine = combined
        .split("\n")
        .find((l) => l.includes("Driver version"));
      results.gpu.vaapi = driverLine?.split(":")[1]?.trim() || "unavailable";
      results.gpu.hasVaapi = true;
    } catch {
      results.gpu.vaapi = "not available";
      results.gpu.hasVaapi = false;
    }

    // Generate recommendations
    let score = 100;
    const recs = [];

    if (results.gpu.isSoftwareRenderer) {
      score -= 40;
      recs.push({
        severity: "critical",
        title: "Software Rendering (llvmpipe)",
        detail:
          "Your system uses CPU-based software rendering instead of a real GPU. This is the #1 cause of Firefox slowness. Enable Software WebRender and disable GPU-dependent features.",
        prefs: ["gfx.webrender.software=true", "gfx.webrender.all=true"],
      });
    }

    if (results.gpu.isVirtual) {
      score -= 10;
      recs.push({
        severity: "warning",
        title: "Virtual GPU Detected",
        detail:
          "Running in a VM with a virtual GPU. Hardware acceleration is limited. Software rendering optimizations are recommended.",
        prefs: [],
      });
    }

    if (!results.gpu.hasVaapi) {
      score -= 10;
      recs.push({
        severity: "warning",
        title: "No Hardware Video Decoding (VA-API)",
        detail:
          "VA-API is not available — video decoding uses CPU. Increase media memory cache to reduce re-decoding overhead.",
        prefs: [
          "media.memory_cache_max_size=262144",
          "media.ffvpx.enabled=true",
        ],
      });
    }

    if (results.system.ramKb < 4194304) {
      score -= 15;
      recs.push({
        severity: "warning",
        title: "Low RAM (<4GB)",
        detail:
          "Limited RAM detected. Reduce cache sizes and limit content processes.",
        prefs: [
          "dom.ipc.processCount=2",
          "browser.cache.memory.capacity=65536",
        ],
      });
    } else if (results.system.ramKb >= 8388608) {
      recs.push({
        severity: "ok",
        title: "Sufficient RAM (8GB+)",
        detail:
          "RAM is adequate for 128MB memory cache and 4 content processes.",
        prefs: [],
      });
    }

    if (results.system.cpuCores <= 2) {
      score -= 10;
      recs.push({
        severity: "warning",
        title: `Low CPU cores (${results.system.cpuCores})`,
        detail:
          "Few CPU cores detected. Limit content processes to 4 to reduce CPU contention and context switching.",
        prefs: ["dom.ipc.processCount=4"],
      });
    }

    recs.push({
      severity: "info",
      title: "Disable Telemetry",
      detail:
        "Mozilla telemetry collects usage data in the background. Disabling it saves CPU and bandwidth.",
      prefs: [
        "toolkit.telemetry.enabled=false",
        "datareporting.policy.dataSubmissionEnabled=false",
      ],
    });

    recs.push({
      severity: "info",
      title: "Disable Disk Cache",
      detail:
        "Disk cache causes frequent I/O writes. Using memory-only cache is faster, especially on VM disk or SSDs with limited write endurance.",
      prefs: [
        "browser.cache.disk.enable=false",
        "browser.cache.memory.capacity=131072",
      ],
    });

    results.recommendations = recs;
    results.score = Math.max(0, score);
    res.json(results);
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Read per-process detail from /proc (no shell — direct file reads)
async function readProcDetail(pid) {
  const detail = {};
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf-8");
    const get = (key) => {
      const m = status.match(new RegExp(`^${key}:\\s*(.+)`, "m"));
      return m ? m[1].trim() : null;
    };
    detail.threads = parseInt(get("Threads")) || 1;
    detail.state = get("State") || "unknown";
    detail.vmPeakKb = parseInt(get("VmPeak")) || 0;
    detail.vmSizeKb = parseInt(get("VmSize")) || 0;
    detail.voluntaryCtxSwitches = parseInt(get("voluntary_ctxt_switches")) || 0;
    detail.nonvoluntaryCtxSwitches =
      parseInt(get("nonvoluntary_ctxt_switches")) || 0;
  } catch {
    /* process may have exited */
  }

  try {
    const io = await readFile(`/proc/${pid}/io`, "utf-8");
    const ioGet = (key) => {
      const m = io.match(new RegExp(`^${key}:\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1]) : 0;
    };
    detail.ioReadBytes = ioGet("read_bytes");
    detail.ioWriteBytes = ioGet("write_bytes");
    detail.ioSyscallsR = ioGet("syscr");
    detail.ioSyscallsW = ioGet("syscw");
  } catch {
    detail.ioReadBytes = 0;
    detail.ioWriteBytes = 0;
  }

  try {
    const fds = await readdir(`/proc/${pid}/fd`);
    detail.fdCount = fds.length;
  } catch {
    detail.fdCount = 0;
  }

  try {
    detail.oomScore =
      parseInt(await readFile(`/proc/${pid}/oom_score`, "utf-8")) || 0;
  } catch {
    detail.oomScore = 0;
  }

  try {
    const smaps = await readFile(`/proc/${pid}/smaps_rollup`, "utf-8");
    const smGet = (key) => {
      const m = smaps.match(new RegExp(`^${key}:\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1]) : 0;
    };
    detail.pssKb = smGet("Pss");
    detail.sharedCleanKb = smGet("Shared_Clean");
    detail.privateCleanKb = smGet("Private_Clean");
    detail.privateDirtyKb = smGet("Private_Dirty");
  } catch {
    detail.pssKb = 0;
  }

  try {
    const env = await readFile(`/proc/${pid}/environ`, "utf-8");
    const vars = env
      .split("\0")
      .filter((v) =>
        /^(MOZ_|DISPLAY|WAYLAND|XDG_SESSION_TYPE|MESA|LIBVA|GDK_BACKEND)/.test(
          v,
        ),
      );
    detail.envVars = vars.slice(0, 15);
  } catch {
    detail.envVars = [];
  }

  try {
    const cgroup = await readFile(`/proc/${pid}/cgroup`, "utf-8");
    detail.cgroup = cgroup.trim().split("\n")[0] || "";
  } catch {
    detail.cgroup = "";
  }

  return detail;
}

// Get Firefox processes (structured output with rich detail)
app.get("/api/processes", async (req, res) => {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid,pcpu,pmem,rss,nlwp,stat,etimes,args", "--no-headers"],
      { timeout: 3000 },
    );
    const lines = stdout
      .trim()
      .split("\n")
      .filter(
        (line) =>
          line.includes("/usr/lib64/firefox/") ||
          line.includes("/usr/lib/firefox/"),
      )
      .slice(0, 30);
    const processes = await Promise.all(
      lines.map(async (line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 8) return null;
        const pid = parseInt(parts[0]);
        const cpu = parseFloat(parts[1]) || 0;
        const mem = parseFloat(parts[2]) || 0;
        const rss = parseInt(parts[3]) || 0;
        const threads = parseInt(parts[4]) || 1;
        const stat = parts[5] || "";
        const uptimeSec = parseInt(parts[6]) || 0;
        const args = parts.slice(7).join(" ");
        const lastArg = parts[parts.length - 1];
        const knownTypes = ["tab", "socket", "rdd", "utility", "forkserver"];
        const baseType = knownTypes.includes(lastArg)
          ? lastArg
          : args.includes("crashhelper")
            ? "crashhelper"
            : !args.includes("-contentproc")
              ? "main"
              : "content";

        // Read /proc detail in parallel (non-blocking, best-effort)
        const detail = await readProcDetail(pid);

        // Enhanced classification: determine if content process is active or idle
        let type = baseType;
        let classification = "system"; // main, system, active-content, idle-content

        if (baseType === "main") {
          classification = "main";
        } else if (["socket", "rdd", "utility", "forkserver", "crashhelper"].includes(baseType)) {
          classification = "system";
        } else if (baseType === "tab" || baseType === "content") {
          // Classify content processes as active or idle based on CPU usage
          // Active: CPU > 0.5% OR high thread count (actively rendering)
          // Idle: CPU <= 0.5% AND low thread count (preloaded/suspended)
          const isActive = cpu > 0.5 || threads > 18;
          classification = isActive ? "active-content" : "idle-content";
          type = isActive ? "active-tab" : "idle-tab";
        }

        return {
          pid,
          cpu,
          mem,
          rss,
          threads,
          stat,
          uptimeSec,
          type,
          baseType,
          classification,
          args,
          detail,
        };
      }),
    );
    res.json(processes.filter(Boolean));
  } catch (_error) {
    res.json([]);
  }
});

// Get MOZ_LOG logs (read file directly — no shell)
app.get("/api/logs", async (req, res) => {
  try {
    const logFile = `${STATE_DIR}/mozlog_graphics.txt`;
    if (!existsSync(logFile)) {
      return res.json([]);
    }

    const content = await readFile(logFile, "utf-8");
    const logs = content
      .split("\n")
      .filter((line) => /wait|delay|flush/i.test(line))
      .slice(-10);
    res.json(logs);
  } catch (_error) {
    res.json([]);
  }
});

// Generate default user.js template from PREF_CATEGORIES
function generateTemplate() {
  const lines = [
    "// Firefox Performance Tuner — user.js",
    `// Generated: ${new Date().toISOString()}`,
    "// Sources: Betterfox v146, ArchWiki Firefox/Tweaks, Mozilla docs",
    "// Restart Firefox after saving to apply changes.",
    "",
  ];
  for (const [category, prefs] of Object.entries(PREF_CATEGORIES)) {
    lines.push(`// === ${category} ===`);
    for (const [key, val] of Object.entries(prefs)) {
      lines.push(`// ${val.description}`);
      lines.push(`user_pref("${key}", ${val.expected});`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Apply preferences to user.js (with Firefox running check + backup rotation)
app.post("/api/apply-preferences", async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res
        .status(409)
        .json({
          error:
            "Close Firefox before modifying user.js — profile is locked while running",
        });
    }

    const { preferences } = req.body;
    if (!preferences || typeof preferences !== "object") {
      return res.status(400).json({ error: "Preferences object required" });
    }

    const profilePath = await resolveProfile();
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`;

    const backupPath = await rotateBackups(userJsFile);

    let content = "";
    if (existsSync(userJsFile)) {
      content = await readFile(userJsFile, "utf-8");
    }

    let updated = false;
    for (const [key, value] of Object.entries(preferences)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`user_pref\\("${escaped}",\\s*[^)]+\\)`);
      if (regex.test(content)) {
        content = content.replace(regex, `user_pref("${key}", ${value})`);
        updated = true;
      } else if (!content.includes(`user_pref("${key}"`)) {
        content += `\nuser_pref("${key}", ${value});`;
        updated = true;
      }
    }

    if (updated) {
      await writeFile(userJsFile, content);
      const msg = backupPath
        ? "Preferences applied! Backup created. Restart Firefox to apply."
        : "Preferences applied! Restart Firefox to apply changes.";
      res.json({ message: msg });
    } else {
      res.json({ message: "All preferences already present in user.js" });
    }
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// NEW: Detect external video players (VLC, MPV, Cinelerra)
app.get("/api/external-players", async (req, res) => {
  try {
    const players = [];
    const candidates = [
      { name: "VLC", command: "vlc" },
      { name: "MPV", command: "mpv" },
      { name: "Cinelerra", command: "cinelerra" },
      { name: "SMPlayer", command: "smplayer" },
      { name: "Celluloid", command: "celluloid" },
    ];

    for (const player of candidates) {
      try {
        // Use 'which' command for fast, reliable detection
        await execFileAsync("which", [player.command], { timeout: 1000 });
        players.push({
          name: player.name,
          command: player.command,
          installed: true,
        });
      } catch (_error) {
        // Player not found, skip
      }
    }

    res.json({
      players,
      count: players.length,
      recommendation: players.length > 0
        ? `Use ${players[0].name} for videos that stutter in Firefox`
        : "Install VLC or MPV for better video playback fallback",
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// ============================================================================
// YOUTUBE DOWNLOAD PIPELINE - RESUMABLE + PROGRESS-AWARE IMPLEMENTATION
// ============================================================================

/**
 * VERIFY BINARY EXISTS
 *
 * Purpose: Check if a command-line tool is installed and accessible
 * Why: We need yt-dlp and ffmpeg to download and merge YouTube videos
 * Returns: true if binary exists, false otherwise
 */
async function verifyBinaryExists(binary) {
  try {
    await execFileAsync("which", [binary]);
    return true;
  } catch {
    return false;
  }
}

/**
 * START RESUMABLE DOWNLOAD WITH PROGRESSIVE PLAYBACK
 *
 * Purpose: Download YouTube video with support for:
 *  - Resume (continue partial downloads after interruption)
 *  - Real-time progress tracking
 *  - Early playback (launch player before download completes)
 *  - Cancellation (kill download on user request)
 *
 * How it works:
 *  1. Start yt-dlp with --continue flag (resumes partial files)
 *  2. Use --newline flag to get structured progress output
 *  3. Parse progress percentage from stdout
 *  4. Store process handle in activeDownloads registry
 *  5. Monitor file size and launch player when threshold reached
 *  6. Continue download in background while player runs
 *
 * Why this approach:
 *  - UX: User waits 3-6 seconds instead of 30-60 seconds
 *  - Reliability: Partial downloads can be resumed after network issues
 *  - Observability: Real-time progress tracking for front-end
 *  - Control: Downloads can be cancelled via API
 *
 * Inspired by:
 *  - Torrent streaming clients (Peerflix, WebTorrent)
 *  - Modern download managers (aria2, wget --continue)
 *  - mpv growing-file playback support
 *
 * @param {string} id - Unique download identifier (timestamp or UUID)
 * @param {string} url - YouTube video URL
 * @param {string} playerCommand - Player executable ("mpv" or "vlc")
 * @returns {string} - Absolute path to output MP4 file
 */
function startResumableDownload(id, url, playerCommand) {

  // STEP 1: Determine output file path
  /**
   * Use deterministic filename based on download ID
   * This allows resume to work - same ID = same file
   *
   * Example: /tmp/youtube-1708167890123.mp4
   */
  const outputFile = path.join(tmpdir(), `youtube-${id}.mp4`);

  console.log(`[download-${id}] Starting resumable download`);
  console.log(`[download-${id}] Output: ${outputFile}`);

  // STEP 2: Build yt-dlp command arguments
  const args = [
    /**
     * Format selector (same as before):
     * - Prefer format 18 (progressive MP4, no HLS)
     * - Fallback to DASH with protocol!=m3u8
     * - Avoids HTTP 403 Forbidden errors
     */
    "-f", "18/bv*[ext=mp4][protocol!=m3u8]+ba[ext=m4a][protocol!=m3u8]/b[ext=mp4][protocol!=m3u8]",

    /**
     * Merge output to single MP4 file
     */
    "--merge-output-format", "mp4",

    /**
     * CRITICAL: Resume support
     *
     * --continue flag tells yt-dlp to:
     *  - Check if output file already exists
     *  - If exists and incomplete, resume from last byte
     *  - If exists and complete, skip download
     *
     * This enables:
     *  - Network interruption recovery
     *  - Server restart recovery
     *  - Manual pause/resume workflow
     */
    "--continue",

    /**
     * CRITICAL: Structured progress output
     *
     * --newline flag tells yt-dlp to:
     *  - Print each progress update on a new line
     *  - Makes parsing easier (no carriage returns)
     *
     * Without this flag:
     *  - Progress updates overwrite same line with \r
     *  - Harder to parse in Node.js streams
     */
    "--newline",

    /**
     * CRITICAL: Faststart MP4 metadata
     *
     * --postprocessor-args "ffmpeg:-movflags faststart"
     *
     * Why this is essential:
     *  - MP4 files have a "moov atom" (metadata container)
     *  - By default, moov atom is at the END of the file
     *  - Players need moov atom to start playback
     *  - For progressive playback, moov MUST be at the BEGINNING
     *
     * Without faststart:
     *  - Player shows "Network error when attempting to fetch resource"
     *  - Player cannot determine duration/seekability
     *  - Playback fails even for local files
     *
     * With faststart:
     *  - moov atom is relocated to file beginning
     *  - Player can start immediately
     *  - Seeking works correctly
     *  - No "network error" messages
     *
     * This is standard in production video delivery:
     *  - YouTube uses faststart
     *  - Netflix uses faststart
     *  - All streaming platforms use faststart
     *
     * Technical details:
     *  - ffmpeg reads entire file
     *  - Rewrites with moov at beginning
     *  - Adds ~1-2 seconds to post-processing
     *  - Worth it for reliable playback
     */
    "--postprocessor-args", "ffmpeg:-movflags faststart",

    /**
     * Suppress update warning
     * (We know yt-dlp is old, system package manager controls it)
     */
    "--no-update",

    /**
     * Output file path
     */
    "-o", outputFile,

    /**
     * YouTube URL
     */
    url
  ];

  console.log(`[download-${id}] Executing: yt-dlp ${args.join(" ")}`);

  // STEP 3: Spawn yt-dlp process
  /**
   * Use spawn() instead of execFile() because:
   *  - We need to stream stdout/stderr in real-time
   *  - Download may take minutes (exceeds execFile timeout)
   *  - We need process handle for cancellation
   *
   * spawn() returns ChildProcess object with:
   *  - stdout/stderr streams
   *  - kill() method for cancellation
   *  - exit event for completion detection
   */
  const proc = spawn("yt-dlp", args);

  // STEP 4: Register download in active registry
  /**
   * Store download metadata for:
   *  - Progress tracking (updated from stdout parser)
   *  - Cancellation (need process handle)
   *  - Stall detection (need lastUpdate timestamp)
   *  - API queries (need filePath and URL)
   */
  activeDownloads.set(id, {
    process: proc,
    progress: 0,
    filePath: outputFile,
    lastUpdate: Date.now(),
    url: url,
    playerPid: null
  });

  // STEP 5: Parse progress AND bitrate from stdout
  /**
   * yt-dlp progress lines look like:
   * [download]  23.4% of 12.34MiB at 1.23MiB/s ETA 00:10
   * [download]  45.6% of 12.34MiB at 2.34MiB/s ETA 00:05
   * [download] 100.0% of 12.34MiB at 3.45MiB/s
   *
   * We extract:
   *  - Percentage (23.4%)
   *  - Download speed (1.23MiB/s) → used for adaptive threshold
   *  - Update timestamp (for stall detection)
   */

  /**
   * ADAPTIVE LAUNCH THRESHOLD
   *
   * Instead of arbitrary 5MB static threshold,
   * we compute threshold based on download speed.
   *
   * Why?
   *  - Fast connection (10 MiB/s) → can use smaller threshold (safe to launch early)
   *  - Slow connection (0.5 MiB/s) → need larger threshold (avoid buffer underrun)
   *
   * Strategy:
   *  - Parse download speed from yt-dlp output
   *  - Compute threshold = speed * 10 seconds of buffered video
   *  - Fallback to 8MB if speed not yet parsed
   *
   * This mimics Netflix-style adaptive buffering.
   */
  let estimatedBitrate = null;

  proc.stdout.on("data", data => {
    const text = data.toString();

    // Log raw output for debugging
    console.log(`[download-${id}] ${text.trim()}`);

    /**
     * Match percentage pattern
     * Example: "23.4%" → captures "23.4"
     */
    const percentMatch = text.match(/(\d+\.\d+)%/);

    /**
     * Match download speed pattern
     * Example: "at 1.23MiB/s" → captures "1.23" and "MiB"
     * Example: "at 512.5KiB/s" → captures "512.5" and "KiB"
     */
    const speedMatch = text.match(/at\s+([\d.]+)(MiB|KiB)/);

    if (speedMatch) {
      const value = parseFloat(speedMatch[1]);
      const unit = speedMatch[2];

      /**
       * Convert to bytes per second
       * MiB = 1024 * 1024 bytes
       * KiB = 1024 bytes
       */
      estimatedBitrate = unit === "MiB"
        ? value * 1024 * 1024
        : value * 1024;

      console.log(`[download-${id}] Speed: ${value} ${unit}/s (${(estimatedBitrate / 1024 / 1024).toFixed(2)} MiB/s)`);
    }

    if (percentMatch) {
      const percent = parseFloat(percentMatch[1]);

      // Update registry with new progress
      const entry = activeDownloads.get(id);
      if (entry) {
        entry.progress = percent;
        entry.lastUpdate = Date.now(); // Reset stall timer

        console.log(`[download-${id}] Progress: ${percent.toFixed(1)}%`);
      }
    }
  });

  // STEP 6: Log errors from stderr
  /**
   * yt-dlp writes warnings and errors to stderr
   * We log them but don't treat warnings as fatal
   */
  proc.stderr.on("data", data => {
    console.log(`[download-${id}] stderr: ${data.toString().trim()}`);
  });

  // STEP 7: Handle process completion
  /**
   * When yt-dlp exits:
   *  - Remove from active registry
   *  - Log exit code (0 = success, non-zero = error)
   */
  proc.on("close", code => {
    console.log(`[download-${id}] Process exited with code ${code}`);
    activeDownloads.delete(id);
  });

  // STEP 8: Progressive playback - launch player when file reaches threshold
  /**
   * ADAPTIVE THRESHOLD COMPUTATION
   *
   * Instead of static 5MB, compute threshold based on download speed:
   *  - Require at least 10 seconds of buffered video
   *  - Fallback to 8MB if speed not yet parsed
   *
   * Why adaptive?
   *  - Fast connection (10 MiB/s) → threshold = 100 MB (10 seconds)
   *  - Slow connection (0.5 MiB/s) → threshold = 5 MB (10 seconds)
   *  - Prevents buffer underrun on slow connections
   *  - Allows faster launch on fast connections
   */
  function computeLaunchThreshold() {
    if (!estimatedBitrate) {
      /**
       * Fallback to 8MB if speed not yet parsed
       * 8MB is safe for most 360p/480p videos
       */
      return 8 * 1024 * 1024;
    }

    /**
     * Require 10 seconds of buffered video
     * Example: 1 MiB/s download speed → 10 MB threshold
     *
     * CRITICAL FIX: Cap at 15MB maximum
     * Why?
     *  - Fast downloads (3+ MiB/s) would compute 30+ MB threshold
     *  - Many YouTube videos are only 15-20 MB total
     *  - Player would never launch if threshold > file size
     *  - 15MB is enough buffer for any reasonable bitrate
     *
     * Example scenarios:
     *  - 0.5 MiB/s → 5 MB threshold (10 seconds)
     *  - 1.0 MiB/s → 10 MB threshold (10 seconds)
     *  - 3.0 MiB/s → 15 MB threshold (capped, ~5 seconds)
     *  - 10 MiB/s → 15 MB threshold (capped, ~1.5 seconds)
     */
    const computed = estimatedBitrate * 10;
    const MAX_THRESHOLD = 15 * 1024 * 1024; // 15MB cap
    const threshold = Math.min(computed, MAX_THRESHOLD);

    console.log(`[download-${id}] Computed threshold: ${(computed / 1024 / 1024).toFixed(2)} MB → capped at ${(threshold / 1024 / 1024).toFixed(2)} MB`);

    return threshold;
  }

  let playerStarted = false;

  /**
   * FASTER POLLING INTERVAL
   *
   * Changed from 1000ms to 500ms
   * Why?
   *  - Faster detection = smoother launch timing
   *  - Reduces delay between threshold reached and player launch
   *  - Minimal CPU overhead (just a stat() call)
   */
  const pollInterval = setInterval(() => {

    console.log(`[download-${id}] [POLL] Checking file...`);

    // Check if file exists yet
    if (!existsSync(outputFile)) {
      console.log(`[download-${id}] [POLL] File does not exist yet`);
      return;
    }

    // Get current file size
    const size = statSync(outputFile).size;

    console.log(`[download-${id}] File size: ${(size / 1024 / 1024).toFixed(2)} MB`);

    // Launch player once threshold reached
    const threshold = computeLaunchThreshold();

    if (size > threshold && !playerStarted) {

      console.log(`[download-${id}] Threshold reached, launching player`);

      /**
       * STRONGER MPV BUFFERING FLAGS
       *
       * Launch player with hardened flags for progressive playback:
       *  --force-seekable=yes         : Treat file as seekable even while growing
       *  --cache=yes                  : Enable cache buffering
       *  --cache-secs=30              : Buffer 30 seconds (increased from 20)
       *  --demuxer-max-bytes=50M      : Larger demux buffer prevents read underruns
       *  --demuxer-readahead-secs=20  : Readahead smooths progressive playback
       *  --no-terminal                : Suppress terminal output
       *
       * Why these flags matter:
       *  - Larger cache (30s) absorbs download speed jitter
       *  - Demux buffer (50MB) prevents "Network error" messages
       *  - Readahead (20s) ensures smooth playback during file growth
       *  - These are documented mpv options for unstable streams
       *
       * Without these flags:
       *  - Player may show "Network error when attempting to fetch resource"
       *  - Playback may stall when download speed drops
       *  - Seeking may fail during progressive playback
       */
      const playerProc = spawn(playerCommand, [
        "--force-seekable=yes",
        "--cache=yes",
        "--cache-secs=30",
        "--demuxer-max-bytes=50M",
        "--demuxer-readahead-secs=20",
        "--no-terminal",
        outputFile
      ], {
        detached: true,  // Run independently of Node.js process
        stdio: "ignore"  // Don't capture player output
      });

      /**
       * PLAYBACK HEALTH LOGGING
       *
       * Monitor player lifecycle to detect early exits
       * Early exit (within 3 seconds) indicates buffering issue
       */
      playerProc.on("spawn", () => {
        console.log(`[download-${id}] [player] Spawned successfully`);
      });

      playerProc.on("exit", (code) => {
        console.log(`[download-${id}] [player] Exited with code ${code}`);
      });

      /**
       * Detect early exit (possible buffering issue)
       */
      setTimeout(() => {
        if (playerProc.exitCode !== null) {
          console.warn(`[download-${id}] [player] exited too quickly — possible buffering issue`);
        }
      }, 3000);

      playerProc.unref(); // Allow Node.js to exit even if player running

      // Store player PID in registry
      const entry = activeDownloads.get(id);
      if (entry) {
        entry.playerPid = playerProc.pid;
      }

      console.log(`[download-${id}] Player launched with PID ${playerProc.pid}`);

      playerStarted = true;
    }

  }, 500); // Poll every 500ms (faster detection)

  // Stop polling when download completes
  proc.on("close", () => {
    clearInterval(pollInterval);
  });

  return outputFile;
}

/**
 * VERIFY YT-DLP VERSION
 *
 * Purpose: Log yt-dlp version for debugging
 * Why: Old versions cause 403 errors on YouTube downloads
 * Returns: version string
 */
async function verifyYtDlpVersion() {
  const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
  console.log("[yt-dlp] version:", stdout.trim());
  return stdout.trim();
}

/**
 * VERIFY FFMPEG EXISTS
 *
 * Purpose: Confirm ffmpeg is available for video/audio merging
 * Why: yt-dlp uses ffmpeg to merge separate video+audio streams into single MP4
 * Returns: ffmpeg version output
 */
async function verifyFfmpeg() {
  const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
  console.log("[ffmpeg] detected");
  return stdout;
}

/**
 * DOWNLOAD YOUTUBE VIDEO TO LOCAL FILE
 *
 * Purpose: Download YouTube video as complete MP4 file (not streaming manifest)
 *
 * Why this approach works:
 *  1. Forces progressive MP4 format (not HLS fragments that expire)
 *  2. Merges audio + video using ffmpeg into single file
 *  3. Avoids time-limited authentication tokens on HLS manifests
 *  4. Retries fragments if network issues occur
 *  5. Falls back to browser cookies if 403 errors occur
 *
 * Format selector explained:
 *  - "bv*[ext=mp4]+ba[ext=m4a]" = best video (mp4) + best audio (m4a), merge them
 *  - "/b[ext=mp4]" = fallback to progressive MP4 if DASH not available
 *
 * Returns: absolute path to downloaded MP4 file
 * Throws: Error if download fails or file not found
 */
async function downloadYouTubeVideo(url) {

  // STEP 1: Verify required tools are installed
  if (!(await verifyBinaryExists("yt-dlp"))) {
    throw new Error("yt-dlp not installed. Install with: pip install yt-dlp");
  }

  if (!(await verifyBinaryExists("ffmpeg"))) {
    throw new Error("ffmpeg not installed. Install with: sudo dnf install ffmpeg");
  }

  // Log versions for debugging
  await verifyYtDlpVersion();
  await verifyFfmpeg();

  // STEP 2: Prepare download location
  const tempDir = tmpdir(); // Usually /tmp on Linux

  /**
   * Output template uses %(id)s so filename is deterministic per video ID
   * Example: youtube-dQw4w9WgXcQ.mp4
   * This prevents duplicate downloads of same video
   */
  const outputTemplate = path.join(tempDir, "youtube-%(id)s.%(ext)s");

  // STEP 3: Build yt-dlp command arguments
  const args = [
    /**
     * Format selector strategy (CRITICAL FIX):
     *
     * Problem: "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" was selecting HLS format 96
     *          which has time-limited authentication tokens → HTTP 403 Forbidden
     *
     * Solution: Explicitly exclude HLS/m3u8 protocols and prefer progressive MP4
     *
     * Format selector breakdown:
     *  1. "18" = Progressive MP4 (640x360) with video+audio combined (no merge needed)
     *  2. "/" = Fallback separator
     *  3. "bv*[ext=mp4][protocol!=m3u8]+ba[ext=m4a][protocol!=m3u8]" =
     *     Best video (mp4, not HLS) + best audio (m4a, not HLS), merge them
     *  4. "/" = Fallback separator
     *  5. "b[ext=mp4][protocol!=m3u8]" = Any progressive MP4 (not HLS)
     *
     * Why format 18 first:
     *  - No merging required (faster)
     *  - No authentication tokens (reliable)
     *  - Good quality for most use cases (640x360)
     *  - Always available on YouTube
     */
    "-f", "18/bv*[ext=mp4][protocol!=m3u8]+ba[ext=m4a][protocol!=m3u8]/b[ext=mp4][protocol!=m3u8]",

    // Merge output to single MP4 file (requires ffmpeg)
    "--merge-output-format", "mp4",

    // Don't create .part files (avoids partial file confusion)
    "--no-part",

    // Retry logic for network issues
    "--retries", "10",              // Retry entire download 10 times
    "--fragment-retries", "10",     // Retry individual fragments 10 times
    "--concurrent-fragments", "5",  // Download 5 fragments in parallel

    // Suppress update warning (we know it's old, system package manager controls it)
    "--no-update",

    // Output file path
    "-o", outputTemplate,

    // YouTube URL
    url
  ];

  console.log("[yt-dlp] Executing:", "yt-dlp", args.join(" "));

  // STEP 4: Execute download (first attempt without cookies)
  try {
    const { stdout, stderr } = await execFileAsync("yt-dlp", args, {
      timeout: 120000 // 2 minute timeout
    });

    console.log("[yt-dlp] stdout:", stdout);
    if (stderr) console.log("[yt-dlp] stderr:", stderr);

  } catch (err) {

    console.error("[yt-dlp] Initial download failed:", err.message);

    /**
     * FALLBACK: If 403 Forbidden error, retry with browser cookies
     *
     * Why: Some videos require authentication (age-restricted, region-locked)
     * How: yt-dlp can extract cookies from Firefox browser
     *
     * We only use cookies as fallback, not by default, because:
     *  - Adds latency
     *  - Requires Firefox to be installed
     *  - Most videos don't need it
     */
    if (err.stderr && err.stderr.includes("403")) {

      console.log("[yt-dlp] Retrying with Firefox cookies...");

      const retryArgs = [
        "--cookies-from-browser", "firefox",
        ...args
      ];

      try {
        const { stdout, stderr } = await execFileAsync("yt-dlp", retryArgs, {
          timeout: 120000
        });

        console.log("[yt-dlp] Retry stdout:", stdout);
        if (stderr) console.log("[yt-dlp] Retry stderr:", stderr);

      } catch (retryErr) {
        // Both attempts failed, throw error
        throw new Error(`yt-dlp failed: ${retryErr.message}`);
      }

    } else {
      // Not a 403 error, throw original error
      throw err;
    }
  }

  // STEP 5: Verify downloaded file exists and is valid
  /**
   * Find all youtube-*.mp4 files in /tmp
   * Sort by modification time (newest first)
   * Verify file size > 1MB (sanity check)
   */
  const files = readdirSync(tempDir)
    .filter(f => f.startsWith("youtube-") && f.endsWith(".mp4"))
    .map(f => ({
      file: f,
      full: path.join(tempDir, f),
      size: statSync(path.join(tempDir, f)).size,
      mtime: statSync(path.join(tempDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  if (!files.length) {
    throw new Error("Download completed but no MP4 file found in /tmp");
  }

  const latest = files[0];

  // Sanity check: file should be at least 1MB
  if (latest.size < 1024 * 1024) {
    throw new Error(`Downloaded file suspiciously small: ${latest.size} bytes`);
  }

  console.log("[yt-dlp] ✅ Verified file:", latest.full);
  console.log("[yt-dlp] ✅ Size:", (latest.size / 1024 / 1024).toFixed(2), "MB");

  return latest.full; // Return absolute path to MP4 file
}

/**
 * LAUNCH EXTERNAL PLAYER WITH LOCAL FILE
 *
 * Purpose: Start VLC or MPV with downloaded video file
 *
 * Why detached + unref:
 *  - detached: Player runs independently of Node.js process
 *  - stdio: "ignore": Don't capture player output (prevents hanging)
 *  - unref(): Allow Node.js to exit even if player still running
 *
 * Returns: Process ID of launched player
 */
async function launchPlayer(playerCommand, filePath) {

  console.log("[player] Launching:", playerCommand, filePath);

  const child = execFile(playerCommand, [filePath], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  console.log("[player] ✅ Launched PID:", child.pid);

  return child.pid;
}

// ============================================================================
// STALL DETECTION WATCHDOG
// ============================================================================

/**
 * STALL DETECTION WATCHDOG
 *
 * Purpose: Automatically detect and terminate stalled downloads
 *
 * How it works:
 *  - Runs every 10 seconds
 *  - Checks all active downloads
 *  - If no progress update for 30 seconds → download is stalled
 *  - Kills stalled process and removes from registry
 *
 * Why 30 seconds:
 *  - YouTube may pause between fragments (normal)
 *  - Network may have temporary slowdown (normal)
 *  - 30 seconds is long enough to avoid false positives
 *  - 30 seconds is short enough to detect real stalls
 *
 * What causes stalls:
 *  - Network disconnection
 *  - YouTube rate limiting
 *  - Disk full
 *  - yt-dlp bug/crash
 *
 * Why kill instead of retry:
 *  - Prevents zombie processes
 *  - User can manually retry with resume support
 *  - Avoids infinite retry loops
 *
 * Production enhancement ideas:
 *  - Add automatic retry with exponential backoff
 *  - Send notification to front-end
 *  - Log stall reason for analytics
 */
setInterval(() => {

  const now = Date.now();

  // Iterate through all active downloads
  for (const [id, entry] of activeDownloads.entries()) {

    // Calculate time since last progress update
    const timeSinceUpdate = now - entry.lastUpdate;

    // Check if stalled (no update for 30 seconds)
    if (timeSinceUpdate > 30000) {

      console.warn(`[STALL DETECTED] Download ${id} stalled for ${(timeSinceUpdate / 1000).toFixed(0)}s`);
      console.warn(`[STALL DETECTED] Last progress: ${entry.progress.toFixed(1)}%`);
      console.warn(`[STALL DETECTED] File: ${entry.filePath}`);
      console.warn(`[STALL DETECTED] Terminating process...`);

      // Kill the stalled yt-dlp process
      /**
       * SIGTERM = graceful termination signal
       * Allows yt-dlp to clean up partial files
       * Better than SIGKILL which force-kills immediately
       */
      entry.process.kill("SIGTERM");

      // Remove from active registry
      activeDownloads.delete(id);

      console.warn(`[STALL DETECTED] Download ${id} terminated and removed from registry`);
    }
  }

}, 10000); // Run every 10 seconds

// ============================================================================
// API ENDPOINTS - DOWNLOAD MANAGEMENT
// ============================================================================

/**
 * GET DOWNLOAD PROGRESS
 *
 * Purpose: Query real-time download progress for front-end progress bar
 *
 * Request: GET /api/download-progress/:id
 * Response: {
 *   progress: number,      // 0-100 percentage
 *   file: string,          // Absolute path to MP4 file
 *   lastUpdate: number,    // Timestamp of last progress update
 *   playerPid: number|null // Player process ID (if launched)
 * }
 *
 * If download not found (completed or cancelled):
 *   { progress: 100, done: true }
 *
 * Front-end usage:
 *   Poll this endpoint every 1 second to update progress bar
 *   Stop polling when progress === 100 or done === true
 */
app.get("/api/download-progress/:id", (req, res) => {

  const id = req.params.id;
  const entry = activeDownloads.get(id);

  // Download not found (completed or cancelled)
  if (!entry) {
    return res.json({
      progress: 100,
      done: true
    });
  }

  // Return current progress
  return res.json({
    progress: entry.progress,
    file: entry.filePath,
    lastUpdate: entry.lastUpdate,
    playerPid: entry.playerPid,
    url: entry.url
  });
});

/**
 * CANCEL DOWNLOAD
 *
 * Purpose: Allow user to cancel in-progress download
 *
 * Request: POST /api/cancel-download
 * Body: { id: string }
 * Response: { success: true, cancelled: string }
 *
 * What happens:
 *  1. Find download in active registry
 *  2. Send SIGTERM to yt-dlp process
 *  3. Remove from registry
 *  4. Partial file remains on disk (can be resumed later)
 *
 * Why keep partial file:
 *  - User may want to resume later
 *  - Saves bandwidth (don't re-download same bytes)
 *  - Disk space is cheap
 *
 * Front-end usage:
 *   Add "Cancel" button next to progress bar
 *   Call this endpoint when clicked
 *   Hide progress bar after successful cancellation
 */
app.post("/api/cancel-download", (req, res) => {

  const { id } = req.body;

  // Validate input
  if (!id) {
    return res.status(400).json({
      success: false,
      error: "Download ID is required"
    });
  }

  const entry = activeDownloads.get(id);

  // Download not found
  if (!entry) {
    return res.status(404).json({
      success: false,
      error: "Download not found (may have already completed or been cancelled)"
    });
  }

  console.log(`[cancel-download] Cancelling download ${id}`);
  console.log(`[cancel-download] Progress was: ${entry.progress.toFixed(1)}%`);
  console.log(`[cancel-download] File: ${entry.filePath}`);

  // Kill the yt-dlp process
  entry.process.kill("SIGTERM");

  // Remove from registry
  activeDownloads.delete(id);

  console.log(`[cancel-download] Download ${id} cancelled successfully`);

  return res.json({
    success: true,
    cancelled: id,
    message: "Download cancelled. Partial file preserved for resume."
  });
});

// ============================================================================
// API ENDPOINT - PLAY VIDEO IN EXTERNAL PLAYER
// ============================================================================

// NEW: Play video URL in external player (VLC/MPV)
app.post("/api/play-in-external-player", async (req, res) => {
  try {
    const { url, player } = req.body;

    // Input validation
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Video URL is required" });
    }

    if (!player || !["vlc", "mpv"].includes(player.toLowerCase())) {
      return res.status(400).json({ error: "Player must be 'vlc' or 'mpv'" });
    }

    // URL validation (basic check for http/https)
    if (!url.match(/^https?:\/\/.+/i)) {
      return res.status(400).json({ error: "Invalid video URL (must start with http:// or https://)" });
    }

    const playerCommand = player.toLowerCase();

    // Verify player is installed
    try {
      await execFileAsync("which", [playerCommand], { timeout: 1000 });
    } catch (_error) {
      return res.status(404).json({
        error: `${player.toUpperCase()} is not installed`,
        recommendation: `Install ${player.toUpperCase()} to use this feature`,
      });
    }

    // Detect if URL is from YouTube or other streaming sites that need yt-dlp
    const isYouTube = /youtube\.com|youtu\.be|googlevideo\.com/i.test(url);
    const isStreamingSite = /vimeo\.com|dailymotion\.com|twitch\.tv/i.test(url);
    const needsYtDlp = isYouTube || isStreamingSite;

    // YOUTUBE/STREAMING SITE HANDLING - Use resumable progressive download
    if (needsYtDlp) {

      /**
       * PROGRESSIVE PLAYBACK WORKFLOW:
       *
       * 1. Generate unique download ID (timestamp)
       * 2. Start resumable download in background
       * 3. Return immediately (don't block API response)
       * 4. Download monitors file size and launches player when ready
       * 5. Front-end polls /api/download-progress/:id for updates
       *
       * UX improvement:
       *  - Old approach: User waits 30-60 seconds for full download
       *  - New approach: User waits 3-6 seconds for playback to start
       *
       * Why this works:
       *  - Progressive MP4 downloads sequentially (moov atom at start)
       *  - mpv can play growing files with --force-seekable
       *  - Download continues in background while playing
       */

      try {

        // Verify yt-dlp is installed
        if (!(await verifyBinaryExists("yt-dlp"))) {
          return res.status(404).json({
            success: false,
            error: "yt-dlp not installed",
            recommendation: "Install yt-dlp: pip install yt-dlp"
          });
        }

        // Generate unique download ID
        /**
         * Use timestamp as ID for simplicity
         * Production enhancement: Use UUID for better uniqueness
         */
        const downloadId = Date.now().toString();

        // Start resumable download (non-blocking)
        /**
         * This function:
         *  - Spawns yt-dlp process
         *  - Registers in activeDownloads map
         *  - Monitors progress and launches player
         *  - Returns immediately (doesn't await completion)
         */
        const filePath = startResumableDownload(downloadId, url, playerCommand);

        // Return success immediately
        /**
         * Front-end should:
         *  1. Display "Starting download..." message
         *  2. Poll /api/download-progress/:downloadId every 1 second
         *  3. Update progress bar
         *  4. Show "Playing..." when playerPid is set
         */
        return res.json({
          success: true,
          id: downloadId,
          file: filePath,
          player: player.toUpperCase(),
          message: "Download started. Player will launch automatically when ready.",
          resumable: true,
          progressive: true
        });

      } catch (error) {

        console.error("[youtube-playback-error]", error);

        return res.status(500).json({
          success: false,
          error: error.message,
          recommendation: "Check server logs for details. Ensure yt-dlp is installed."
        });
      }
    }

    // DIRECT URL HANDLING - For non-YouTube URLs (direct MP4, etc.)
    execFile(playerCommand, [url], {
      detached: true,
      stdio: "ignore",
    }).unref();

    res.json({
      success: true,
      player: player.toUpperCase(),
      message: `${player.toUpperCase()} launched with video URL`,
      url: url.substring(0, 100) + (url.length > 100 ? "..." : ""), // Truncate long URLs in response
      usedYtDlp: false,
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// NEW: Auto-fix all preference issues (one-click fix with auto-close and auto-restart)
app.post("/api/auto-fix", async (req, res) => {
  try {
    // 1. Close Firefox if running
    if (await isFirefoxRunning()) {
      try {
        // Kill all Firefox processes (graceful first, then force)
        try {
          await execFileAsync("pkill", ["firefox"], { timeout: 3000 });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch {
          // Graceful kill failed, force kill
          await execFileAsync("pkill", ["-9", "firefox"], { timeout: 3000 });
        }

        // Wait for processes to fully terminate and profile to unlock
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify Firefox is actually closed
        if (await isFirefoxRunning()) {
          return res.status(409).json({
            error: "Failed to close Firefox automatically. Please close it manually and try again.",
          });
        }
      } catch (error) {
        // pkill returns non-zero if no processes found, which is fine
        // Continue to check if Firefox is actually closed
        if (await isFirefoxRunning()) {
          return res.status(409).json({
            error: "Failed to close Firefox automatically. Please close it manually and try again.",
          });
        }
      }
    }

    // 2. Generate optimal user.js content from PREF_CATEGORIES
    const content = generateTemplate();

    // 3. Validate content
    const validation = validateUserJS(content);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    // 4. Get profile path and create backup
    const profilePath = await resolveProfile();
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`;
    const backupPath = await rotateBackups(userJsFile);

    // 5. Write user.js
    await writeFile(userJsFile, content, "utf-8");

    // Wait for filesystem to flush (ensures user.js is fully written)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. Count issues fixed (all preferences in PREF_CATEGORIES)
    const flatPrefs = {};
    for (const cat of Object.values(PREF_CATEGORIES)) {
      for (const key of Object.keys(cat)) {
        flatPrefs[key] = true;
      }
    }
    const issuesFixed = Object.keys(flatPrefs).length;

    // 7. Restart Firefox automatically with the tuner URL
    try {
      // Wait a bit more before restarting to ensure clean profile state
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Launch Firefox with the tuner page (detached process)
      // This allows user to continue using the tool immediately
      execFileAsync("firefox", ["http://localhost:3000"], {
        detached: true,
        stdio: 'ignore'
      }).catch(() => {
        // Ignore errors - Firefox might already be starting
      });
    } catch (error) {
      // Non-critical - user can restart manually
    }

    // 8. Return success response
    res.json({
      success: true,
      message: `Auto-fixed ${issuesFixed} preference issues`,
      issuesFixed,
      issues: Object.keys(flatPrefs),
      backupCreated: !!backupPath,
      backupPath: backupPath || "none",
      firefoxRestarted: true,
      nextSteps: [
        "Firefox is restarting automatically",
        "Verify preferences in about:config",
        "Test video playback and tab performance",
      ],
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Get user.js content (returns template if file doesn't exist)
app.get("/api/user-js", async (req, res) => {
  try {
    const profilePath = await resolveProfile();
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`;

    if (!existsSync(userJsFile)) {
      return res.json({
        content: generateTemplate(),
        path: userJsFile,
        isTemplate: true,
      });
    }

    const content = await readFile(userJsFile, "utf-8");
    res.json({ content, path: userJsFile, isTemplate: false });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// NEW: Dry-run validation endpoint (validates WITHOUT writing)
app.post("/api/user-js/validate", async (req, res) => {
  try {
    const { content } = req.body;
    const validation = validateUserJS(content);

    if (!validation.valid) {
      return res.status(400).json({
        valid: false,
        error: validation.reason,
        safe: false,
      });
    }

    // Count preferences
    const lines = content.split("\n");
    const prefCount = lines.filter(line =>
      line.trim().startsWith("user_pref(")
    ).length;

    // Check if Firefox is running (warning, not error)
    const firefoxRunning = await isFirefoxRunning();

    res.json({
      valid: true,
      safe: true,
      prefCount,
      warnings: validation.warnings || [],
      firefoxRunning,
      message: firefoxRunning
        ? "⚠️ Close Firefox before applying changes"
        : "✅ Safe to apply (validation passed)",
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Save user.js content (with validation, Firefox check, backup rotation)
app.post("/api/user-js", async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res
        .status(409)
        .json({
          error:
            "Close Firefox before modifying user.js — profile is locked while running",
        });
    }

    const { content } = req.body;
    const validation = validateUserJS(content);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    const profilePath = await resolveProfile();
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`;

    const backupPath = await rotateBackups(userJsFile);

    await writeFile(userJsFile, content, "utf-8");

    const warnings = validation.warnings && validation.warnings.length > 0
      ? `\n\nWarnings:\n${validation.warnings.join("\n")}`
      : "";

    const msg = backupPath
      ? `✅ user.js saved! Backup created: ${path.basename(backupPath)}\n` +
        `🔄 Restart Firefox to apply changes.${warnings}`
      : `✅ user.js saved successfully!\n🔄 Restart Firefox to apply changes.${warnings}`;

    res.json({
      message: msg,
      path: userJsFile,
      backupPath,
      warnings: validation.warnings || [],
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Restore user.js from most recent backup
app.post("/api/user-js/restore", async (req, res) => {
  try {
    const profilePath = await resolveProfile();
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`;
    const dir = path.dirname(userJsFile);
    const base = path.basename(userJsFile);

    // Find the most recent backup (supports both old .backup and new timestamped format)
    const files = await readdir(dir);
    const backups = files
      .filter((f) => f === `${base}.backup` || f.startsWith(`${base}.backup-`))
      .sort()
      .reverse();

    if (backups.length === 0) {
      return res.status(404).json({ error: "No backup file found" });
    }

    const latestBackup = path.join(dir, backups[0]);
    await copyFile(latestBackup, userJsFile);
    const content = await readFile(userJsFile, "utf-8");
    res.json({
      message: `Restored from ${backups[0]}! Restart Firefox to apply.`,
      content,
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// === ZERO-MISTAKE CONFIGURATION WIZARD ENDPOINTS ===
// Production-grade wizard with robust profile detection, diff preview, rollback

/**
 * Detect Firefox profile with support for normal/Flatpak/Snap installs
 * Returns absolute path to profile directory
 */
async function detectProfileRobust() {
  const candidates = [
    `${process.env.HOME}/.mozilla/firefox`,
    `${process.env.HOME}/.var/app/org.mozilla.firefox/.mozilla/firefox`,
    `${process.env.HOME}/snap/firefox/common/.mozilla/firefox`,
  ];

  for (const base of candidates) {
    const iniPath = `${base}/profiles.ini`;
    if (!existsSync(iniPath)) continue;

    try {
      const iniContent = await readFile(iniPath, "utf8");
      const lines = iniContent.split("\n");

      let currentPath = null;
      for (const line of lines) {
        if (line.startsWith("Path=")) {
          currentPath = line.split("=")[1].trim();
        }
        if (line.startsWith("Default=1") && currentPath) {
          const fullPath = `${base}/${currentPath}`;
          if (existsSync(fullPath)) {
            return fullPath;
          }
        }
      }
    } catch (_err) {
      continue;
    }
  }

  throw new Error("No Firefox profile found (checked normal, Flatpak, Snap)");
}

// Step 1: Detect profile and verify prefs.js exists
app.get("/api/wizard/profile", async (_req, res) => {
  try {
    const profilePath = await detectProfileRobust();
    const prefsPath = `${profilePath}/prefs.js`;
    const userJsPath = `${profilePath}/user.js`;

    res.json({
      profile: profilePath,
      prefsExists: existsSync(prefsPath),
      userJsExists: existsSync(userJsPath),
      firefoxRunning: await isFirefoxRunning(),
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Step 2: Generate diff preview (current vs new user.js)
app.post("/api/wizard/diff", async (req, res) => {
  try {
    const { newContent } = req.body;

    if (typeof newContent !== "string" || newContent.length > 512 * 1024) {
      return res.status(400).json({ error: "Invalid content (max 512KB)" });
    }

    const profilePath = await detectProfileRobust();
    const userJsPath = `${profilePath}/user.js`;

    let currentContent = "";
    if (existsSync(userJsPath)) {
      currentContent = await readFile(userJsPath, "utf8");
    }

    const diff = diffLines(currentContent, newContent);

    res.json({
      diff,
      currentSize: currentContent.length,
      newSize: newContent.length,
      hasChanges: diff.some((part) => part.added || part.removed),
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Step 3: Apply configuration safely (with Firefox check + rotating backups)
app.post("/api/wizard/apply", async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res.status(409).json({
        error: "Firefox is running",
        message: "Close Firefox before applying configuration",
      });
    }

    const { newContent } = req.body;

    if (typeof newContent !== "string" || newContent.length > 512 * 1024) {
      return res.status(400).json({ error: "Invalid content (max 512KB)" });
    }

    const validation = validateUserJS(newContent);
    if (!validation.valid) {
      return res
        .status(400)
        .json({ error: validation.reason || "Invalid user.js content" });
    }

    const profilePath = await detectProfileRobust();
    const userJsPath = `${profilePath}/user.js`;

    // Rotate backups (keep last 5)
    const backupPath = await rotateBackups(userJsPath);

    // Write new user.js
    await writeFile(userJsPath, newContent, "utf8");

    res.json({
      success: true,
      path: userJsPath,
      backupCreated: !!backupPath,
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// Step 4: Rollback to most recent backup (supports timestamped backups from rotateBackups)
app.post("/api/wizard/rollback", async (_req, res) => {
  try {
    const profilePath = await detectProfileRobust();
    const userJsPath = `${profilePath}/user.js`;
    const dir = path.dirname(userJsPath);
    const base = path.basename(userJsPath);

    // Find most recent backup (timestamped format: user.js.backup-2026-02-09T...)
    const files = await readdir(dir);
    const backups = files
      .filter((f) => f === `${base}.backup` || f.startsWith(`${base}.backup-`))
      .sort()
      .reverse();

    if (backups.length === 0) {
      return res.status(404).json({ error: "No backup available" });
    }

    const latestBackup = path.join(dir, backups[0]);
    await copyFile(latestBackup, userJsPath);

    res.json({
      success: true,
      restored: true,
      path: userJsPath,
      backupUsed: latestBackup,
      availableBackups: backups.length,
    });
  } catch (error) {
    res.status(500).json(safeError(error));
  }
});

// ============================================================================
// TELEMETRY BLOCKING ENDPOINTS
// ============================================================================

// Check current telemetry blocking status
app.get("/api/telemetry/status", async (_req, res) => {
  try {
    const status = {
      dnsBlocking: false,
      enterprisePolicy: false,
      dnsBlockedDomains: [],
      policyPath: null,
      verification: {},
    };

    // Check DNS blocking in /etc/hosts
    const hostsFile = "/etc/hosts";
    if (existsSync(hostsFile)) {
      const hostsContent = await readFile(hostsFile, "utf8");
      const marker = "# Mozilla Telemetry Blocking (added by Firefox Performance Tuner)";
      status.dnsBlocking = hostsContent.includes(marker);

      if (status.dnsBlocking) {
        // Count blocked domains
        const lines = hostsContent.split("\n");
        const blockedDomains = lines
          .filter((line) => line.includes("telemetry") || line.includes("mozilla"))
          .filter((line) => line.startsWith("127.0.0.1"))
          .map((line) => line.split(/\s+/)[1])
          .filter(Boolean);
        status.dnsBlockedDomains = blockedDomains;
      }
    }

    // Check Enterprise Policy
    const policyPaths = [
      "/etc/firefox/policies/policies.json",
      "/usr/lib64/firefox/distribution/policies.json",
    ];

    for (const policyPath of policyPaths) {
      if (existsSync(policyPath)) {
        try {
          const policyContent = await readFile(policyPath, "utf8");
          const policy = JSON.parse(policyContent);
          if (policy.policies?.DisableTelemetry) {
            status.enterprisePolicy = true;
            status.policyPath = policyPath;
            break;
          }
        } catch (err) {
          // Invalid JSON, skip
        }
      }
    }

    // Verify DNS blocking works (test one domain)
    if (status.dnsBlocking) {
      try {
        const { stdout } = await execFileAsync("nslookup", ["incoming.telemetry.mozilla.org"], {
          timeout: 3000,
        });
        status.verification.dnsTest = stdout.includes("127.0.0.1") ? "BLOCKED" : "NOT_BLOCKED";
      } catch (err) {
        status.verification.dnsTest = "ERROR";
      }
    }

    res.json(status);
  } catch (error) {
    console.error("Telemetry status check error:", error);
    res.status(500).json(safeError(error));
  }
});

// Block telemetry via DNS (/etc/hosts)
app.post("/api/telemetry/block-dns", async (req, res) => {
  try {
    const scriptPath = path.join(process.cwd(), "scripts/block-telemetry-dns.sh");

    if (!existsSync(scriptPath)) {
      return res.status(404).json({
        error: "Script not found",
        message: "block-telemetry-dns.sh not found in scripts/ directory",
      });
    }

    // Execute script with sudo (will prompt user for password)
    const { stdout, stderr } = await execFileAsync("pkexec", [scriptPath], {
      timeout: 30000,
    });

    // Verify blocking worked
    let verification = "UNKNOWN";
    try {
      const { stdout: nslookupOut } = await execFileAsync(
        "nslookup",
        ["incoming.telemetry.mozilla.org"],
        { timeout: 3000 }
      );
      verification = nslookupOut.includes("127.0.0.1") ? "SUCCESS" : "FAILED";
    } catch (err) {
      verification = "ERROR";
    }

    res.json({
      success: true,
      message: "DNS-level telemetry blocking enabled",
      output: stdout,
      verification,
      nextSteps: [
        "Telemetry domains now resolve to 127.0.0.1",
        "Blocking survives system reboots",
        "Backup created at /etc/hosts.backup-*",
      ],
    });
  } catch (error) {
    console.error("DNS blocking error:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to enable DNS blocking. Make sure you have sudo access.",
    });
  }
});

// Install Enterprise Policy
app.post("/api/telemetry/install-policy", async (req, res) => {
  try {
    const policyDir = "/etc/firefox/policies";
    const policyFile = `${policyDir}/policies.json`;

    const policy = {
      policies: {
        DisableTelemetry: true,
        DisableFirefoxStudies: true,
        DisablePocket: true,
        DisableFormHistory: true,
        DontCheckDefaultBrowser: true,
        DisableFirefoxAccounts: true,
        OverrideFirstRunPage: "",
        OverridePostUpdatePage: "",
      },
    };

    const policyContent = JSON.stringify(policy, null, 2);

    // Create script to install policy (requires sudo)
    const installScript = `#!/bin/bash
set -e
mkdir -p "${policyDir}"
cat > "${policyFile}" << 'EOF'
${policyContent}
EOF
chmod 644 "${policyFile}"
echo "SUCCESS: Enterprise policy installed at ${policyFile}"
`;

    const scriptPath = `${STATE_DIR}/install-policy.sh`;
    await writeFile(scriptPath, installScript, { mode: 0o755 });

    // Execute with sudo
    const { stdout } = await execFileAsync("pkexec", [scriptPath], {
      timeout: 10000,
    });

    // Verify policy was created
    const policyExists = existsSync(policyFile);

    res.json({
      success: true,
      message: "Enterprise policy installed successfully",
      policyPath: policyFile,
      policyContent: policy,
      verification: policyExists ? "SUCCESS" : "FAILED",
      nextSteps: [
        "Restart Firefox to apply policy",
        "Policy applies to all users on this system",
        "Policy cannot be overridden by user.js",
        "Verify in about:policies",
      ],
    });
  } catch (error) {
    console.error("Policy installation error:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to install enterprise policy. Make sure you have sudo access.",
    });
  }
});

// === START SERVER (LOCALHOST ONLY — OWASP: bind to loopback) ===
const PORT = 3001;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(
    `Firefox Performance Tuner API running on http://${HOST}:${PORT}`,
  );
});
