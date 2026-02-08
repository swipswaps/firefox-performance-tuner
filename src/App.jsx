import { useState, useEffect } from 'react'
import SystemInfo from './components/SystemInfo'
import PreferencesPanel from './components/PreferencesPanel'
import ProcessMonitor from './components/ProcessMonitor'
import LogViewer from './components/LogViewer'
import UserJsEditor from './components/UserJsEditor'
import './App.css'

function App() {
  const [systemInfo, setSystemInfo] = useState(null)
  const [preferences, setPreferences] = useState({})
  const [prefCategories, setPrefCategories] = useState({})
  const [processes, setProcesses] = useState([])
  const [logs, setLogs] = useState([])
  const [refreshInterval, setRefreshInterval] = useState(5)
  const [isMonitoring, setIsMonitoring] = useState(false)

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/system-info')
      const data = await response.json()
      setSystemInfo(data)
    } catch (error) {
      console.error('Failed to fetch system info:', error)
    }
  }

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/preferences')
      const data = await response.json()
      setPreferences(data)
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
    }
  }

  const fetchPrefCategories = async () => {
    try {
      const response = await fetch('/api/pref-categories')
      const data = await response.json()
      setPrefCategories(data)
    } catch (error) {
      console.error('Failed to fetch pref categories:', error)
    }
  }

  const fetchProcesses = async () => {
    try {
      const response = await fetch('/api/processes')
      const data = await response.json()
      setProcesses(data)
    } catch (error) {
      console.error('Failed to fetch processes:', error)
    }
  }

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs')
      const data = await response.json()
      setLogs(data)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    }
  }

  // Build flat expected prefs from categories
  const getCriticalPrefs = () => {
    const flat = {}
    for (const cat of Object.values(prefCategories)) {
      for (const [key, val] of Object.entries(cat)) {
        flat[key] = val.expected
      }
    }
    return flat
  }

  const applyPreferences = async () => {
    try {
      const response = await fetch('/api/apply-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: getCriticalPrefs() })
      })
      const result = await response.json()
      alert(result.message)
      fetchPreferences()
    } catch (error) {
      console.error('Failed to apply preferences:', error)
      alert('Failed to apply preferences')
    }
  }

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

  useEffect(() => {
    fetchSystemInfo()
    fetchPreferences()
    fetchPrefCategories()
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
          ⚙️ Apply All Optimized Preferences
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

      <SystemInfo data={systemInfo} />

      <PreferencesPanel
        preferences={preferences}
        categories={prefCategories}
      />

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

