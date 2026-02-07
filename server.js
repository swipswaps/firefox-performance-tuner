import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

const MOZILLA_DIR = `${process.env.HOME}/.mozilla/firefox`
const STATE_DIR = `${process.env.HOME}/.cache/firefox-hud`

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
    
    // Fallback to Profile with Default=1
    let inProfile = false
    for (const line of lines) {
      if (line.startsWith('[Profile')) inProfile = true
      if (inProfile && line === 'Default=1') {
        for (const l of lines) {
          if (l.startsWith('Path=')) return l.split('=')[1].trim()
        }
      }
    }
  } catch (error) {
    throw new Error('Cannot resolve Firefox profile')
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

// Get Firefox preferences
app.get('/api/preferences', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const prefsFile = `${MOZILLA_DIR}/${profilePath}/prefs.js`
    
    if (!existsSync(prefsFile)) {
      return res.json({})
    }
    
    const content = await readFile(prefsFile, 'utf-8')
    const prefs = {}
    
    const criticalPrefs = [
      'gfx.webrender.enable-gpu-thread',
      'gfx.gl.multithreaded',
      'dom.ipc.processCount',
      'dom.ipc.processCount.web',
      'gfx.webrender.wait-for-gpu',
      'media.ffvpx.enabled',
      'network.prefetch-next'
    ]
    
    for (const pref of criticalPrefs) {
      const regex = new RegExp(`user_pref\\("${pref}", ([^)]+)\\)`)
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

// Apply preferences to user.js
app.post('/api/apply-preferences', async (req, res) => {
  try {
    const { preferences } = req.body
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    let content = ''
    if (existsSync(userJsFile)) {
      content = await readFile(userJsFile, 'utf-8')
    }

    let updated = false
    for (const [key, value] of Object.entries(preferences)) {
      if (!content.includes(`user_pref("${key}"`)) {
        content += `\nuser_pref("${key}", ${value});`
        updated = true
      }
    }

    if (updated) {
      await writeFile(userJsFile, content)
      res.json({ message: 'Preferences applied! Restart Firefox to apply changes.' })
    } else {
      res.json({ message: 'All preferences already present in user.js' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get user.js content
app.get('/api/user-js', async (req, res) => {
  try {
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    if (!existsSync(userJsFile)) {
      return res.json({ content: '', path: userJsFile })
    }

    const content = await readFile(userJsFile, 'utf-8')
    res.json({ content, path: userJsFile })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Save user.js content
app.post('/api/user-js', async (req, res) => {
  try {
    const { content } = req.body
    const profilePath = await resolveProfile()
    const userJsFile = `${MOZILLA_DIR}/${profilePath}/user.js`

    await writeFile(userJsFile, content, 'utf-8')
    res.json({
      message: 'user.js saved successfully! Restart Firefox to apply changes.',
      path: userJsFile
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Firefox Performance Tuner API running on http://localhost:${PORT}`)
})

