import { useState, useEffect } from 'react'
import SystemInfo from './components/SystemInfo'
import PreferencesPanel from './components/PreferencesPanel'
import ProcessMonitor from './components/ProcessMonitor'
import LogViewer from './components/LogViewer'
import UserJsEditor from './components/UserJsEditor'
import './App.css'

const CRITICAL_PREFS = {
  'gfx.webrender.enable-gpu-thread': 'false',
  'gfx.gl.multithreaded': 'false',
  'dom.ipc.processCount': '4',
  'dom.ipc.processCount.web': '4',
  'gfx.webrender.wait-for-gpu': 'false',
  'media.ffvpx.enabled': 'true',
  'network.prefetch-next': 'true'
}

function App() {
  const [systemInfo, setSystemInfo] = useState(null)
  const [preferences, setPreferences] = useState({})
  const [processes, setProcesses] = useState([])
  const [logs, setLogs] = useState([])
  const [refreshInterval, setRefreshInterval] = useState(5)
  const [isMonitoring, setIsMonitoring] = useState(false)

  // Fetch system information
  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/system-info')
      const data = await response.json()
      setSystemInfo(data)
    } catch (error) {
      console.error('Failed to fetch system info:', error)
    }
  }

  // Fetch Firefox preferences
  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/preferences')
      const data = await response.json()
      setPreferences(data)
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
    }
  }

  // Fetch Firefox processes
  const fetchProcesses = async () => {
    try {
      const response = await fetch('/api/processes')
      const data = await response.json()
      setProcesses(data)
    } catch (error) {
      console.error('Failed to fetch processes:', error)
    }
  }

  // Fetch MOZ_LOG logs
  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs')
      const data = await response.json()
      setLogs(data)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    }
  }

  // Apply preferences to user.js
  const applyPreferences = async () => {
    try {
      const response = await fetch('/api/apply-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: CRITICAL_PREFS })
      })
      const result = await response.json()
      alert(result.message)
      fetchPreferences()
    } catch (error) {
      console.error('Failed to apply preferences:', error)
      alert('Failed to apply preferences')
    }
  }

  // Auto-refresh data
  useEffect(() => {
    if (isMonitoring) {
      const interval = setInterval(() => {
        fetchSystemInfo()
        fetchPreferences()
        fetchProcesses()
        fetchLogs()
      }, refreshInterval * 1000)

      return () => clearInterval(interval)
    }
  }, [isMonitoring, refreshInterval])

  // Initial load
  useEffect(() => {
    fetchSystemInfo()
    fetchPreferences()
    fetchProcesses()
    fetchLogs()
  }, [])

  return (
    <div className="container">
      <div className="header">
        <h1>🦊 Firefox Performance Tuner</h1>
        <p>Real-time monitoring and optimization for Firefox on X11 + Mesa</p>
      </div>

      <div className="controls">
        <button onClick={() => setIsMonitoring(!isMonitoring)}>
          {isMonitoring ? '⏸ Pause Monitoring' : '▶ Start Monitoring'}
        </button>
        <button onClick={applyPreferences}>
          ⚙️ Apply Critical Preferences
        </button>
        <label>
          Refresh Interval:
          <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}>
            <option value={1}>1s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </label>
      </div>

      <div className="grid">
        <SystemInfo data={systemInfo} />
        <PreferencesPanel 
          preferences={preferences} 
          criticalPrefs={CRITICAL_PREFS} 
        />
      </div>

      <ProcessMonitor processes={processes} />
      <LogViewer logs={logs} />

      <UserJsEditor />

      <div className="refresh-info">
        {isMonitoring ? `Auto-refreshing every ${refreshInterval}s` : 'Monitoring paused'}
      </div>
    </div>
  )
}

export default App

