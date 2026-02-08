import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

const MOZILLA_DIR = `${process.env.HOME}/.mozilla/firefox`
const STATE_DIR = `${process.env.HOME}/.cache/firefox-hud`

// Categorized preferences with descriptions (inspired by Betterfox Fastfox.js)
const PREF_CATEGORIES = {
  'GPU & Rendering': {
    'gfx.webrender.enable-gpu-thread': {
      expected: 'false',
      description: 'Disable separate GPU thread to prevent threading contention on X11+Mesa'
    },
    'gfx.gl.multithreaded': {
      expected: 'false',
      description: 'Disable Mesa GL multithreading to avoid synchronization delays'
    },
    'gfx.webrender.wait-for-gpu': {
      expected: 'false',
      description: 'Don\'t block on GPU flush — eliminates WaitFlushedEvent delays'
    }
  },
  'Process Management': {
    'dom.ipc.processCount': {
      expected: '4',
      description: 'Limit total content processes to reduce GPU contention'
    },
    'dom.ipc.processCount.web': {
      expected: '4',
      description: 'Limit web content processes specifically'
    }
  },
  'Media & Codecs': {
    'media.ffvpx.enabled': {
      expected: 'true',
      description: 'Enable software video decoding fallback (ffvpx)'
    }
  },
  'Network & Prefetch': {
    'network.prefetch-next': {
      expected: 'true',
      description: 'Prefetch linked pages for faster navigation'
    },
    'network.dns.disablePrefetch': {
      expected: 'false',
      description: 'Allow DNS prefetching for faster domain resolution'
    },
    'network.predictor.enabled': {
      expected: 'true',
      description: 'Enable network predictor for speculative connections'
    }
  },
  'Cache & Memory': {
    'browser.cache.disk.enable': {
      expected: 'true',
      description: 'Enable disk cache for persistent caching'
    },
    'browser.cache.memory.enable': {
      expected: 'true',
      description: 'Enable memory cache for fast access'
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

// Get system information
app.get('/api/system-info', async (req, res) => {
  try {
    const display = process.env.DISPLAY || '<not set>'
    const session = process.env.XDG_SESSION_TYPE || '<not set>'
    
    let renderer = '<not available>'
    let version = '<not available>'
    let vaapi = '<not available>'
    
    try {
      const { stdout: glxOutput } = await execAsync('glxinfo 2>/dev/null | grep -m1 "OpenGL renderer"')
      renderer = glxOutput.split(':')[1]?.trim() || '<not available>'
    } catch {}
    
    try {
      const { stdout: glxVersion } = await execAsync('glxinfo 2>/dev/null | grep -m1 "OpenGL version"')
      version = glxVersion.split(':')[1]?.trim() || '<not available>'
    } catch {}
    
    try {
      const { stdout: vaapiOutput } = await execAsync('vainfo 2>&1 | grep -m1 "Driver version"')
      vaapi = vaapiOutput.split(':')[1]?.trim() || '<not available>'
    } catch {}
    
    res.json({ display, session, renderer, version, vaapi })
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
  }
})

// Get preference categories with descriptions
app.get('/api/pref-categories', (req, res) => {
  res.json(PREF_CATEGORIES)
})

// Get Firefox processes
app.get('/api/processes', async (req, res) => {
  try {
    const { stdout } = await execAsync('ps aux | grep firefox | grep -v grep | head -n 6')
    const processes = stdout.trim().split('\n').filter(line => line.length > 0)
    res.json(processes)
  } catch (error) {
    res.json([])
  }
})

// Get MOZ_LOG logs
app.get('/api/logs', async (req, res) => {
  try {
    const logFile = `${STATE_DIR}/mozlog_graphics.txt`
    if (!existsSync(logFile)) {
      return res.json([])
    }
    
    const { stdout } = await execAsync(`grep -i "wait\\|delay\\|flush" "${logFile}" | tail -n 10`)
    const logs = stdout.trim().split('\n').filter(line => line.length > 0)
    res.json(logs)
  } catch (error) {
    res.json([])
  }
})

// Backup user.js before writing (inspired by arkenfox updater)
async function backupUserJs(userJsFile) {
  if (existsSync(userJsFile)) {
    const backupFile = `${userJsFile}.backup`
    await copyFile(userJsFile, backupFile)
    return backupFile
  }
  return null
}

// Generate default user.js template from PREF_CATEGORIES
function generateTemplate() {
  const lines = [
    '// Firefox Performance Tuner — user.js',
    `// Generated: ${new Date().toISOString()}`,
    '// Optimized for X11 + Mesa + Radeon GPU systems',
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

// Apply preferences to user.js
app.post('/api/apply-preferences', async (req, res) => {
  try {
    const { preferences } = req.body
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    const backupPath = await backupUserJs(userJsFile)

    let content = ''
    if (existsSync(userJsFile)) {
      content = await readFile(userJsFile, 'utf-8')
    }

    let updated = false
    for (const [key, value] of Object.entries(preferences)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`user_pref\\("${escaped}",\\s*[^)]+\\)`)
      if (regex.test(content)) {
        // Update existing preference
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
        ? `Preferences applied! Backup saved to ${backupPath}. Restart Firefox to apply.`
        : 'Preferences applied! Restart Firefox to apply changes.'
      res.json({ message: msg })
    } else {
      res.json({ message: 'All preferences already present in user.js' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
  }
})

// Save user.js content (with backup and validation)
app.post('/api/user-js', async (req, res) => {
  try {
    const { content } = req.body

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' })
    }

    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    const backupPath = await backupUserJs(userJsFile)

    await writeFile(userJsFile, content, 'utf-8')
    const msg = backupPath
      ? `user.js saved! Backup at ${backupPath}. Restart Firefox to apply.`
      : 'user.js saved successfully! Restart Firefox to apply changes.'
    res.json({ message: msg, path: userJsFile })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Restore user.js from backup
app.post('/api/user-js/restore', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`
    const backupFile = `${userJsFile}.backup`

    if (!existsSync(backupFile)) {
      return res.status(404).json({ error: 'No backup file found' })
    }

    await copyFile(backupFile, userJsFile)
    const content = await readFile(userJsFile, 'utf-8')
    res.json({ message: 'Restored from backup! Restart Firefox to apply.', content })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Firefox Performance Tuner API running on http://localhost:${PORT}`)
})

