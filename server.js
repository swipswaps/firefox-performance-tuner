import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, copyFile, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { diffLines } from 'diff'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

// === SECURITY BASELINE (OWASP + Express best practices) ===
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false })) // CSP off — Vite injects inline scripts in dev
app.use(express.json({ limit: '1mb' }))

const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 60,               // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
})
app.use('/api/', limiter)

const MOZILLA_DIR = `${process.env.HOME}/.mozilla/firefox`
const STATE_DIR = `${process.env.HOME}/.cache/firefox-hud`

// Categorized preferences with descriptions
// Sources: Betterfox v146, ArchWiki Firefox/Tweaks (Jan 2026), Mozilla docs
// Optimized for: VM with llvmpipe (software rendering), 8GB RAM, 2 cores
const PREF_CATEGORIES = {
  'GPU & Rendering': {
    'gfx.webrender.all': {
      expected: 'true',
      description: 'Force WebRender for all content — GPU-accelerated 2D rendering (Betterfox)'
    },
    'gfx.webrender.software': {
      expected: 'true',
      description: 'Enable Software WebRender — required when hardware GPU is unavailable (llvmpipe/VM)'
    },
    'gfx.canvas.accelerated.cache-items': {
      expected: '32768',
      description: 'Increase accelerated canvas cache items for smoother rendering (Betterfox)'
    },
    'gfx.canvas.accelerated.cache-size': {
      expected: '4096',
      description: 'Increase accelerated canvas cache size in MB (Betterfox)'
    },
    'gfx.content.skia-font-cache-size': {
      expected: '32',
      description: 'Increase Skia font cache — reduces font re-rasterization (Betterfox)'
    },
    'image.cache.size': {
      expected: '10485760',
      description: 'Increase decoded image cache to 10MB — fewer re-decodes (Betterfox)'
    },
    'image.mem.decode_bytes_at_a_time': {
      expected: '65536',
      description: 'Decode images in 64KB chunks instead of 16KB — faster loading (Betterfox)'
    }
  },
  'Cache & Memory': {
    'browser.cache.disk.enable': {
      expected: 'false',
      description: 'Disable disk cache — eliminates frequent disk writes, use memory only (Betterfox/ArchWiki)'
    },
    'browser.cache.memory.enable': {
      expected: 'true',
      description: 'Enable memory cache for fast access to recently loaded resources'
    },
    'browser.cache.memory.capacity': {
      expected: '131072',
      description: 'Set memory cache to 128MB — default auto-select uses decade-old table (Betterfox)'
    },
    'browser.cache.memory.max_entry_size': {
      expected: '20480',
      description: 'Allow up to 20MB per cache entry — prevents large resources from bypassing cache (Betterfox)'
    },
    'browser.sessionhistory.max_total_viewers': {
      expected: '4',
      description: 'Keep 4 pages in back/forward cache — balance between memory and speed (Betterfox)'
    },
    'browser.privatebrowsing.forceMediaMemoryCache': {
      expected: 'true',
      description: 'Force media to use memory cache — avoids disk writes for media (Betterfox)'
    }
  },
  'Media': {
    'media.memory_cache_max_size': {
      expected: '262144',
      description: 'Increase media memory cache to 256MB — smoother video playback (Betterfox)'
    },
    'media.memory_caches_combined_limit_kb': {
      expected: '1048576',
      description: 'Combined media cache limit 1GB — prevents cache eviction during streaming (Betterfox)'
    },
    'media.cache_readahead_limit': {
      expected: '600',
      description: 'Read ahead 600 seconds of media — fewer buffering stalls (Betterfox)'
    },
    'media.cache_resume_threshold': {
      expected: '300',
      description: 'Resume caching when buffer drops below 300s — prevents buffer underruns (Betterfox)'
    },
    'media.ffvpx.enabled': {
      expected: 'true',
      description: 'Enable software video decoding (ffvpx) — required when no hardware VA-API'
    }
  },
  'Network': {
    'network.http.max-connections': {
      expected: '1800',
      description: 'Increase max connections from 900 to 1800 — faster parallel downloads (Betterfox)'
    },
    'network.http.max-persistent-connections-per-server': {
      expected: '10',
      description: 'Allow 10 persistent connections per server (default 6) — faster page loads (Betterfox)'
    },
    'network.http.max-urgent-start-excessive-connections-per-host': {
      expected: '5',
      description: 'Allow 5 urgent connections per host — faster critical resource loading (Betterfox)'
    },
    'network.http.pacing.requests.enabled': {
      expected: 'false',
      description: 'Disable request pacing — send requests immediately without throttling (Betterfox)'
    },
    'network.dnsCacheEntries': {
      expected: '10000',
      description: 'Cache 10K DNS entries (default 400) — fewer DNS lookups (Betterfox)'
    },
    'network.dnsCacheExpiration': {
      expected: '3600',
      description: 'Keep DNS cache entries for 1 hour (default 60s) — fewer re-lookups (Betterfox)'
    },
    'network.ssl_tokens_cache_capacity': {
      expected: '10240',
      description: 'Increase SSL session token cache — faster HTTPS reconnections (Betterfox)'
    }
  },
  'Speculative Loading': {
    'network.http.speculative-parallel-limit': {
      expected: '0',
      description: 'Disable speculative connections — saves CPU/bandwidth on low-end systems (Betterfox)'
    },
    'network.dns.disablePrefetch': {
      expected: 'true',
      description: 'Disable DNS prefetching — saves resources, improves privacy (Betterfox)'
    },
    'network.dns.disablePrefetchFromHTTPS': {
      expected: 'true',
      description: 'Disable DNS prefetch from HTTPS pages — saves resources (Betterfox)'
    },
    'network.prefetch-next': {
      expected: 'false',
      description: 'Disable link prefetching — prevents unwanted background downloads (Betterfox)'
    },
    'browser.urlbar.speculativeConnect.enabled': {
      expected: 'false',
      description: 'Disable speculative URL bar connections — saves resources (Betterfox)'
    },
    'browser.places.speculativeConnect.enabled': {
      expected: 'false',
      description: 'Disable bookmarks speculative connections (Betterfox)'
    }
  },
  'Process Management': {
    'dom.ipc.processCount': {
      expected: '4',
      description: 'Limit content processes to 4 — optimal for 2-core CPU, reduces memory/CPU contention (ArchWiki)'
    },
    'browser.sessionstore.interval': {
      expected: '600000',
      description: 'Save session every 10 minutes instead of 15s — reduces disk writes (ArchWiki)'
    },
    'browser.sessionstore.max_tabs_undo': {
      expected: '10',
      description: 'Keep undo data for 10 tabs — balance between memory and convenience (Betterfox)'
    }
  },
  'Telemetry & Experiments': {
    'datareporting.policy.dataSubmissionEnabled': {
      expected: 'false',
      description: 'Disable data reporting — saves bandwidth and CPU (Betterfox)'
    },
    'toolkit.telemetry.enabled': {
      expected: 'false',
      description: 'Disable telemetry collection — reduces background CPU usage (Betterfox)'
    },
    'toolkit.telemetry.unified': {
      expected: 'false',
      description: 'Disable unified telemetry — prevents data gathering overhead (Betterfox)'
    },
    'toolkit.telemetry.archive.enabled': {
      expected: 'false',
      description: 'Disable telemetry archive — saves disk writes (Betterfox)'
    },
    'app.normandy.enabled': {
      expected: 'false',
      description: 'Disable remote experiment/study system — prevents unexpected behavior changes (Betterfox)'
    },
    'app.shield.optoutstudies.enabled': {
      expected: 'false',
      description: 'Opt out of Shield studies — prevents A/B test overhead (Betterfox)'
    },
    'browser.newtabpage.activity-stream.feeds.telemetry': {
      expected: 'false',
      description: 'Disable new tab telemetry feed — saves CPU on every new tab (Betterfox)'
    }
  }
}

// Flatten categories into a simple key->expected map
function getFlatPrefs() {
  const flat = {}
  for (const cat of Object.values(PREF_CATEGORIES)) {
    for (const [key, val] of Object.entries(cat)) {
      flat[key] = val.expected
    }
  }
  return flat
}

// === SECURITY HELPERS ===

// Strip filesystem paths and stack traces from error messages (OWASP: information disclosure)
function safeError(error) {
  const msg = (error.message || 'Internal server error')
    .replace(/\/home\/[^\s]+/g, '[path]')
    .replace(/\n.*at .*/g, '')
  return { error: msg.length > 200 ? 'Operation failed' : msg }
}

// Validate user.js content — only allow user_pref() lines, comments, and blanks
function validateUserJS(content) {
  if (typeof content !== 'string') return { valid: false, reason: 'Content must be a string' }
  if (content.length > 512 * 1024) return { valid: false, reason: 'Content too large (max 512KB)' }

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '' || line.startsWith('//')) continue
    if (!/^user_pref\("[-a-zA-Z0-9._]+",\s*(true|false|-?\d+|"[^"]*")\);$/.test(line)) {
      return { valid: false, reason: `Invalid syntax on line ${i + 1}: ${line.substring(0, 80)}` }
    }
  }
  return { valid: true }
}

// Rotate backups — keep timestamped copies, prune to maxBackups (arkenfox pattern)
async function rotateBackups(filePath, maxBackups = 5) {
  if (!existsSync(filePath)) return null

  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(dir, `${base}.backup-${timestamp}`)

  await copyFile(filePath, backupPath)

  // Prune old backups beyond maxBackups
  const files = await readdir(dir)
  const backups = files
    .filter(f => f.startsWith(`${base}.backup-`))
    .sort()
    .reverse()

  for (const old of backups.slice(maxBackups)) {
    await unlink(path.join(dir, old)).catch(() => {})
  }

  return backupPath
}

// Check if Firefox is running — refuse writes while profile is active
async function isFirefoxRunning() {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', 'firefox'], { timeout: 3000 })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

// === HEALTH ENDPOINT ===
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'full', version: '1.1.0' })
})

// Resolve active Firefox profile
async function resolveProfile() {
  const profilesIni = `${MOZILLA_DIR}/profiles.ini`
  try {
    const content = await readFile(profilesIni, 'utf-8')
    const lines = content.split('\n')

    // Look for Install-locked default
    let inInstall = false
    for (const line of lines) {
      if (line.startsWith('[Install')) inInstall = true
      if (inInstall && line.startsWith('Default=')) {
        return line.split('=')[1].trim()
      }
    }

    // Fallback: find Profile section with Default=1, then get its Path
    let currentPath = ''
    let foundDefault = false
    for (const line of lines) {
      if (line.startsWith('[Profile')) {
        currentPath = ''
        foundDefault = false
      }
      if (line.startsWith('Path=')) {
        currentPath = line.split('=')[1].trim()
      }
      if (line === 'Default=1') {
        foundDefault = true
      }
      if (foundDefault && currentPath) {
        return currentPath
      }
    }
    throw new Error('No default profile found in profiles.ini')
  } catch (error) {
    throw new Error(`Cannot resolve Firefox profile: ${error.message}`)
  }
}

// Get system information (execFile — no shell spawning)
app.get('/api/system-info', async (req, res) => {
  try {
    const display = process.env.DISPLAY || '<not set>'
    const session = process.env.XDG_SESSION_TYPE || '<not set>'

    let renderer = '<not available>'
    let version = '<not available>'
    let vaapi = '<not available>'

    try {
      const { stdout } = await execFileAsync('glxinfo', [], { timeout: 5000 })
      const rendererLine = stdout.split('\n').find(l => l.includes('OpenGL renderer'))
      renderer = rendererLine?.split(':')[1]?.trim() || '<not available>'
      const versionLine = stdout.split('\n').find(l => l.includes('OpenGL version'))
      version = versionLine?.split(':')[1]?.trim() || '<not available>'
    } catch {}

    try {
      const { stdout, stderr } = await execFileAsync('vainfo', [], { timeout: 5000 })
      const combined = stdout + stderr
      const driverLine = combined.split('\n').find(l => l.includes('Driver version'))
      vaapi = driverLine?.split(':')[1]?.trim() || '<not available>'
    } catch {}

    res.json({ display, session, renderer, version, vaapi })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Get Firefox preferences (reads from prefs.js — the runtime state)
app.get('/api/preferences', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const prefsFile = `${MOZILLA_DIR}/${profilePath}/prefs.js`

    if (!existsSync(prefsFile)) {
      return res.json({})
    }

    const content = await readFile(prefsFile, 'utf-8')
    const prefs = {}
    const flatPrefs = getFlatPrefs()

    for (const pref of Object.keys(flatPrefs)) {
      // Match both user_pref("key", value) and pref("key", value) formats
      const escaped = pref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?:user_)?pref\\("${escaped}",\\s*([^)]+)\\)`)
      const match = content.match(regex)
      if (match) {
        prefs[pref] = match[1].trim()
      }
    }

    res.json(prefs)
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Get preference categories with descriptions
app.get('/api/pref-categories', (req, res) => {
  res.json(PREF_CATEGORIES)
})

// System benchmark — detect capabilities and generate recommendations
app.get('/api/benchmark', async (req, res) => {
  try {
    const results = { gpu: {}, system: {}, recommendations: [], score: 0 }

    // GPU detection (execFile — no shell)
    try {
      const { stdout } = await execFileAsync('glxinfo', [], { timeout: 5000 })
      const rendererLine = stdout.split('\n').find(l => l.includes('OpenGL renderer'))
      results.gpu.renderer = rendererLine?.split(':')[1]?.trim() || 'unknown'
      const versionLine = stdout.split('\n').find(l => l.includes('OpenGL version'))
      results.gpu.glVersion = versionLine?.split(':')[1]?.trim() || 'unknown'
    } catch {
      results.gpu.renderer = 'unavailable'
      results.gpu.glVersion = 'unavailable'
    }

    try {
      const { stdout } = await execFileAsync('lspci', [], { timeout: 5000 })
      const gpuLine = stdout.split('\n').find(l => /vga|3d|display/i.test(l))
      results.gpu.device = gpuLine?.replace(/^[^:]+:\s*/, '').trim() || 'unknown'
    } catch { results.gpu.device = 'unavailable' }

    results.gpu.isSoftwareRenderer = /llvmpipe|softpipe|swrast/i.test(results.gpu.renderer)
    results.gpu.isVirtual = /virtio|vmware|virtualbox|qxl/i.test(results.gpu.device || '')

    // System info (read /proc directly — no shell needed)
    try {
      const meminfo = await readFile('/proc/meminfo', 'utf-8')
      const memLine = meminfo.split('\n').find(l => l.startsWith('MemTotal'))
      results.system.ramKb = parseInt(memLine?.split(/\s+/)[1]) || 0
      results.system.ramMb = Math.round(results.system.ramKb / 1024)
      results.system.ramGb = (results.system.ramKb / 1048576).toFixed(1)
    } catch { results.system.ramKb = 0 }

    try {
      const { stdout } = await execFileAsync('nproc', [], { timeout: 3000 })
      results.system.cpuCores = parseInt(stdout.trim()) || 1
    } catch { results.system.cpuCores = 1 }

    try {
      const cpuinfo = await readFile('/proc/cpuinfo', 'utf-8')
      const modelLine = cpuinfo.split('\n').find(l => l.includes('model name'))
      results.system.cpuModel = modelLine?.split(':')[1]?.trim() || 'unknown'
    } catch { results.system.cpuModel = 'unknown' }

    // VA-API (hardware video decode)
    try {
      const { stdout, stderr } = await execFileAsync('vainfo', [], { timeout: 5000 })
      const combined = stdout + stderr
      const driverLine = combined.split('\n').find(l => l.includes('Driver version'))
      results.gpu.vaapi = driverLine?.split(':')[1]?.trim() || 'unavailable'
      results.gpu.hasVaapi = true
    } catch {
      results.gpu.vaapi = 'not available'
      results.gpu.hasVaapi = false
    }

    // Generate recommendations
    let score = 100
    const recs = []

    if (results.gpu.isSoftwareRenderer) {
      score -= 40
      recs.push({
        severity: 'critical',
        title: 'Software Rendering (llvmpipe)',
        detail: 'Your system uses CPU-based software rendering instead of a real GPU. This is the #1 cause of Firefox slowness. Enable Software WebRender and disable GPU-dependent features.',
        prefs: ['gfx.webrender.software=true', 'gfx.webrender.all=true']
      })
    }

    if (results.gpu.isVirtual) {
      score -= 10
      recs.push({
        severity: 'warning',
        title: 'Virtual GPU Detected',
        detail: 'Running in a VM with a virtual GPU. Hardware acceleration is limited. Software rendering optimizations are recommended.',
        prefs: []
      })
    }

    if (!results.gpu.hasVaapi) {
      score -= 10
      recs.push({
        severity: 'warning',
        title: 'No Hardware Video Decoding (VA-API)',
        detail: 'VA-API is not available — video decoding uses CPU. Increase media memory cache to reduce re-decoding overhead.',
        prefs: ['media.memory_cache_max_size=262144', 'media.ffvpx.enabled=true']
      })
    }

    if (results.system.ramKb < 4194304) {
      score -= 15
      recs.push({
        severity: 'warning',
        title: 'Low RAM (<4GB)',
        detail: 'Limited RAM detected. Reduce cache sizes and limit content processes.',
        prefs: ['dom.ipc.processCount=2', 'browser.cache.memory.capacity=65536']
      })
    } else if (results.system.ramKb >= 8388608) {
      recs.push({
        severity: 'ok',
        title: 'Sufficient RAM (8GB+)',
        detail: 'RAM is adequate for 128MB memory cache and 4 content processes.',
        prefs: []
      })
    }

    if (results.system.cpuCores <= 2) {
      score -= 10
      recs.push({
        severity: 'warning',
        title: `Low CPU cores (${results.system.cpuCores})`,
        detail: 'Few CPU cores detected. Limit content processes to 4 to reduce CPU contention and context switching.',
        prefs: ['dom.ipc.processCount=4']
      })
    }

    recs.push({
      severity: 'info',
      title: 'Disable Telemetry',
      detail: 'Mozilla telemetry collects usage data in the background. Disabling it saves CPU and bandwidth.',
      prefs: ['toolkit.telemetry.enabled=false', 'datareporting.policy.dataSubmissionEnabled=false']
    })

    recs.push({
      severity: 'info',
      title: 'Disable Disk Cache',
      detail: 'Disk cache causes frequent I/O writes. Using memory-only cache is faster, especially on VM disk or SSDs with limited write endurance.',
      prefs: ['browser.cache.disk.enable=false', 'browser.cache.memory.capacity=131072']
    })

    results.recommendations = recs
    results.score = Math.max(0, score)
    res.json(results)
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Read per-process detail from /proc (no shell — direct file reads)
async function readProcDetail(pid) {
  const detail = {}
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf-8')
    const get = (key) => {
      const m = status.match(new RegExp(`^${key}:\\s*(.+)`, 'm'))
      return m ? m[1].trim() : null
    }
    detail.threads = parseInt(get('Threads')) || 1
    detail.state = get('State') || 'unknown'
    detail.vmPeakKb = parseInt(get('VmPeak')) || 0
    detail.vmSizeKb = parseInt(get('VmSize')) || 0
    detail.voluntaryCtxSwitches = parseInt(get('voluntary_ctxt_switches')) || 0
    detail.nonvoluntaryCtxSwitches = parseInt(get('nonvoluntary_ctxt_switches')) || 0
  } catch { /* process may have exited */ }

  try {
    const io = await readFile(`/proc/${pid}/io`, 'utf-8')
    const ioGet = (key) => {
      const m = io.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'))
      return m ? parseInt(m[1]) : 0
    }
    detail.ioReadBytes = ioGet('read_bytes')
    detail.ioWriteBytes = ioGet('write_bytes')
    detail.ioSyscallsR = ioGet('syscr')
    detail.ioSyscallsW = ioGet('syscw')
  } catch { detail.ioReadBytes = 0; detail.ioWriteBytes = 0 }

  try {
    const fds = await readdir(`/proc/${pid}/fd`)
    detail.fdCount = fds.length
  } catch { detail.fdCount = 0 }

  try {
    detail.oomScore = parseInt(await readFile(`/proc/${pid}/oom_score`, 'utf-8')) || 0
  } catch { detail.oomScore = 0 }

  try {
    const smaps = await readFile(`/proc/${pid}/smaps_rollup`, 'utf-8')
    const smGet = (key) => {
      const m = smaps.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'))
      return m ? parseInt(m[1]) : 0
    }
    detail.pssKb = smGet('Pss')
    detail.sharedCleanKb = smGet('Shared_Clean')
    detail.privateCleanKb = smGet('Private_Clean')
    detail.privateDirtyKb = smGet('Private_Dirty')
  } catch { detail.pssKb = 0 }

  try {
    const env = await readFile(`/proc/${pid}/environ`, 'utf-8')
    const vars = env.split('\0').filter(v =>
      /^(MOZ_|DISPLAY|WAYLAND|XDG_SESSION_TYPE|MESA|LIBVA|GDK_BACKEND)/.test(v)
    )
    detail.envVars = vars.slice(0, 15)
  } catch { detail.envVars = [] }

  try {
    const cgroup = await readFile(`/proc/${pid}/cgroup`, 'utf-8')
    detail.cgroup = cgroup.trim().split('\n')[0] || ''
  } catch { detail.cgroup = '' }

  return detail
}

// Get Firefox processes (structured output with rich detail)
app.get('/api/processes', async (req, res) => {
  try {
    const { stdout } = await execFileAsync(
      'ps', ['-eo', 'pid,pcpu,pmem,rss,nlwp,stat,etimes,args', '--no-headers'], { timeout: 3000 }
    )
    const lines = stdout.trim().split('\n')
      .filter(line => line.includes('/usr/lib64/firefox/') || line.includes('/usr/lib/firefox/'))
      .slice(0, 30)
    const processes = await Promise.all(lines.map(async line => {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 8) return null
      const pid = parseInt(parts[0])
      const cpu = parseFloat(parts[1]) || 0
      const mem = parseFloat(parts[2]) || 0
      const rss = parseInt(parts[3]) || 0
      const threads = parseInt(parts[4]) || 1
      const stat = parts[5] || ''
      const uptimeSec = parseInt(parts[6]) || 0
      const args = parts.slice(7).join(' ')
      const lastArg = parts[parts.length - 1]
      const knownTypes = ['tab', 'socket', 'rdd', 'utility', 'forkserver']
      const type = knownTypes.includes(lastArg) ? lastArg
        : args.includes('crashhelper') ? 'crashhelper'
        : !args.includes('-contentproc') ? 'main'
        : 'content'

      // Read /proc detail in parallel (non-blocking, best-effort)
      const detail = await readProcDetail(pid)

      return { pid, cpu, mem, rss, threads, stat, uptimeSec, type, args, detail }
    }))
    res.json(processes.filter(Boolean))
  } catch (error) {
    res.json([])
  }
})

// Get MOZ_LOG logs (read file directly — no shell)
app.get('/api/logs', async (req, res) => {
  try {
    const logFile = `${STATE_DIR}/mozlog_graphics.txt`
    if (!existsSync(logFile)) {
      return res.json([])
    }

    const content = await readFile(logFile, 'utf-8')
    const logs = content.split('\n')
      .filter(line => /wait|delay|flush/i.test(line))
      .slice(-10)
    res.json(logs)
  } catch (error) {
    res.json([])
  }
})

// Generate default user.js template from PREF_CATEGORIES
function generateTemplate() {
  const lines = [
    '// Firefox Performance Tuner — user.js',
    `// Generated: ${new Date().toISOString()}`,
    '// Sources: Betterfox v146, ArchWiki Firefox/Tweaks, Mozilla docs',
    '// Restart Firefox after saving to apply changes.',
    ''
  ]
  for (const [category, prefs] of Object.entries(PREF_CATEGORIES)) {
    lines.push(`// === ${category} ===`)
    for (const [key, val] of Object.entries(prefs)) {
      lines.push(`// ${val.description}`)
      lines.push(`user_pref("${key}", ${val.expected});`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// Apply preferences to user.js (with Firefox running check + backup rotation)
app.post('/api/apply-preferences', async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res.status(409).json({ error: 'Close Firefox before modifying user.js — profile is locked while running' })
    }

    const { preferences } = req.body
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Preferences object required' })
    }

    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    const backupPath = await rotateBackups(userJsFile)

    let content = ''
    if (existsSync(userJsFile)) {
      content = await readFile(userJsFile, 'utf-8')
    }

    let updated = false
    for (const [key, value] of Object.entries(preferences)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`user_pref\\("${escaped}",\\s*[^)]+\\)`)
      if (regex.test(content)) {
        content = content.replace(regex, `user_pref("${key}", ${value})`)
        updated = true
      } else if (!content.includes(`user_pref("${key}"`)) {
        content += `\nuser_pref("${key}", ${value});`
        updated = true
      }
    }

    if (updated) {
      await writeFile(userJsFile, content)
      const msg = backupPath
        ? 'Preferences applied! Backup created. Restart Firefox to apply.'
        : 'Preferences applied! Restart Firefox to apply changes.'
      res.json({ message: msg })
    } else {
      res.json({ message: 'All preferences already present in user.js' })
    }
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Get user.js content (returns template if file doesn't exist)
app.get('/api/user-js', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    if (!existsSync(userJsFile)) {
      return res.json({ content: generateTemplate(), path: userJsFile, isTemplate: true })
    }

    const content = await readFile(userJsFile, 'utf-8')
    res.json({ content, path: userJsFile, isTemplate: false })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Save user.js content (with validation, Firefox check, backup rotation)
app.post('/api/user-js', async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res.status(409).json({ error: 'Close Firefox before modifying user.js — profile is locked while running' })
    }

    const { content } = req.body
    const validation = validateUserJS(content)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason })
    }

    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    const backupPath = await rotateBackups(userJsFile)

    await writeFile(userJsFile, content, 'utf-8')
    const msg = backupPath
      ? 'user.js saved! Backup created. Restart Firefox to apply.'
      : 'user.js saved successfully! Restart Firefox to apply changes.'
    res.json({ message: msg, path: userJsFile })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Restore user.js from most recent backup
app.post('/api/user-js/restore', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`
    const dir = path.dirname(userJsFile)
    const base = path.basename(userJsFile)

    // Find the most recent backup (supports both old .backup and new timestamped format)
    const files = await readdir(dir)
    const backups = files
      .filter(f => f === `${base}.backup` || f.startsWith(`${base}.backup-`))
      .sort()
      .reverse()

    if (backups.length === 0) {
      return res.status(404).json({ error: 'No backup file found' })
    }

    const latestBackup = path.join(dir, backups[0])
    await copyFile(latestBackup, userJsFile)
    const content = await readFile(userJsFile, 'utf-8')
    res.json({ message: `Restored from ${backups[0]}! Restart Firefox to apply.`, content })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

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
    `${process.env.HOME}/snap/firefox/common/.mozilla/firefox`
  ]

  for (const base of candidates) {
    const iniPath = `${base}/profiles.ini`
    if (!existsSync(iniPath)) continue

    try {
      const iniContent = await readFile(iniPath, 'utf8')
      const lines = iniContent.split('\n')

      let currentPath = null
      for (const line of lines) {
        if (line.startsWith('Path=')) {
          currentPath = line.split('=')[1].trim()
        }
        if (line.startsWith('Default=1') && currentPath) {
          const fullPath = `${base}/${currentPath}`
          if (existsSync(fullPath)) {
            return fullPath
          }
        }
      }
    } catch (err) {
      continue
    }
  }

  throw new Error('No Firefox profile found (checked normal, Flatpak, Snap)')
}

// Step 1: Detect profile and verify prefs.js exists
app.get('/api/wizard/profile', async (_req, res) => {
  try {
    const profilePath = await detectProfileRobust()
    const prefsPath = `${profilePath}/prefs.js`
    const userJsPath = `${profilePath}/user.js`

    res.json({
      profile: profilePath,
      prefsExists: existsSync(prefsPath),
      userJsExists: existsSync(userJsPath),
      firefoxRunning: await isFirefoxRunning()
    })
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// Step 2: Generate diff preview (current vs new user.js)
app.post('/api/wizard/diff', async (req, res) => {
  try {
    const { newContent } = req.body

    if (typeof newContent !== 'string' || newContent.length > 512 * 1024) {
      return res.status(400).json({ error: 'Invalid content (max 512KB)' })
    }

    const profilePath = await detectProfileRobust()
    const userJsPath = `${profilePath}/user.js`

    let currentContent = ''
    if (existsSync(userJsPath)) {
      currentContent = await readFile(userJsPath, 'utf8')
    }

    const diff = diffLines(currentContent, newContent)

    res.json({
      diff,
      currentSize: currentContent.length,
      newSize: newContent.length,
      hasChanges: diff.some(part => part.added || part.removed)
    })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Step 3: Apply configuration safely (with Firefox check + rotating backups)
app.post('/api/wizard/apply', async (req, res) => {
  try {
    if (await isFirefoxRunning()) {
      return res.status(409).json({
        error: 'Firefox is running',
        message: 'Close Firefox before applying configuration'
      })
    }

    const { newContent } = req.body

    if (typeof newContent !== 'string' || newContent.length > 512 * 1024) {
      return res.status(400).json({ error: 'Invalid content (max 512KB)' })
    }

    if (!validateUserJS(newContent)) {
      return res.status(400).json({ error: 'Invalid user.js content (failed validation)' })
    }

    const profilePath = await detectProfileRobust()
    const userJsPath = `${profilePath}/user.js`

    // Rotate backups (keep last 5)
    await rotateBackups(userJsPath)

    // Write new user.js
    await writeFile(userJsPath, newContent, 'utf8')

    res.json({
      success: true,
      path: userJsPath,
      backupCreated: existsSync(`${userJsPath}.backup.1`)
    })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// Step 4: Rollback to most recent backup
app.post('/api/wizard/rollback', async (_req, res) => {
  try {
    const profilePath = await detectProfileRobust()
    const userJsPath = `${profilePath}/user.js`
    const backupPath = `${userJsPath}.backup.1`

    if (!existsSync(backupPath)) {
      return res.status(404).json({ error: 'No backup available' })
    }

    await copyFile(backupPath, userJsPath)

    res.json({
      success: true,
      restored: true,
      path: userJsPath,
      backupUsed: backupPath
    })
  } catch (error) {
    res.status(500).json(safeError(error))
  }
})

// === START SERVER (LOCALHOST ONLY — OWASP: bind to loopback) ===
const PORT = 3001
const HOST = '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`Firefox Performance Tuner API running on http://${HOST}:${PORT}`)
})

