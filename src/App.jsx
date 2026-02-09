import { useState, useEffect, useCallback } from 'react'
import SystemInfo from './components/SystemInfo'
import PreferencesPanel from './components/PreferencesPanel'
import ProcessMonitor from './components/ProcessMonitor'
import LogViewer from './components/LogViewer'
import UserJsEditor from './components/UserJsEditor'
import ToastContainer, { showToast } from './components/Toast'
import StatusBadge from './components/StatusBadge'
import CopyButton from './components/CopyButton'
import { generatePreferenceScript } from './utils/clipboard'
import './App.css'

const TABS = [
  { id: 'overview', label: '📊 Overview', icon: '📊' },
  { id: 'prefs', label: '⚙️ Preferences', icon: '⚙️' },
  { id: 'editor', label: '📝 Editor', icon: '📝' },
  { id: 'monitor', label: '🔍 Monitor', icon: '🔍' },
]

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [systemInfo, setSystemInfo] = useState(null)
  const [preferences, setPreferences] = useState({})
  const [prefCategories, setPrefCategories] = useState({})
  const [processes, setProcesses] = useState([])
  const [logs, setLogs] = useState([])
  const [refreshInterval, setRefreshInterval] = useState(5)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState(null)
  const [benchmark, setBenchmark] = useState(null)
  const [benchLoading, setBenchLoading] = useState(false)
  const [apiMode, setApiMode] = useState('checking') // 'full' | 'demo' | 'disconnected' | 'checking'

  const fetchData = useCallback(async (url, setter, label) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status}`)
      const data = await response.json()
      setter(data)
    } catch (error) {
      console.error(`Failed to fetch ${label}:`, error)
    }
  }, [])

  const checkApiMode = useCallback(async () => {
    // Detect if we're on GitHub Pages (static demo — no API)
    if (window.location.hostname.includes('github.io')) {
      setApiMode('demo')
      return 'demo'
    }
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        setApiMode(data.mode || 'full')
        return data.mode || 'full'
      }
      setApiMode('disconnected')
      return 'disconnected'
    } catch {
      setApiMode('disconnected')
      return 'disconnected'
    }
  }, [])

  const fetchAll = useCallback(async () => {
    const mode = await checkApiMode()
    if (mode === 'full') {
      await Promise.all([
        fetchData('/api/system-info', setSystemInfo, 'system info'),
        fetchData('/api/preferences', setPreferences, 'preferences'),
        fetchData('/api/pref-categories', setPrefCategories, 'categories'),
        fetchData('/api/processes', setProcesses, 'processes'),
        fetchData('/api/logs', setLogs, 'logs'),
      ])
    }
    setLoading(false)
  }, [fetchData, checkApiMode])

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
      showToast(result.message, 'success')
      fetchData('/api/preferences', setPreferences, 'preferences')
    } catch (error) {
      showToast('Failed to apply preferences', 'error')
    }
    setConfirmAction(null)
  }

  const runBenchmark = async () => {
    setBenchLoading(true)
    try {
      const response = await fetch('/api/benchmark')
      if (!response.ok) throw new Error(`${response.status}`)
      const data = await response.json()
      setBenchmark(data)
      showToast(`Benchmark complete — score: ${data.score}/100`, data.score >= 70 ? 'success' : 'warning')
    } catch (error) {
      showToast('Benchmark failed', 'error')
    }
    setBenchLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (isMonitoring) {
      const interval = setInterval(() => {
        fetchData('/api/system-info', setSystemInfo, 'system info')
        fetchData('/api/preferences', setPreferences, 'preferences')
        fetchData('/api/processes', setProcesses, 'processes')
        fetchData('/api/logs', setLogs, 'logs')
      }, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [isMonitoring, refreshInterval, fetchData])

  const prefIssueCount = Object.keys(getCriticalPrefs()).filter(key => {
    const expected = getCriticalPrefs()[key]
    return preferences[key] !== expected
  }).length

  if (loading) {
    return (
      <div className="container">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading Firefox Performance Tuner...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <ToastContainer />

      {confirmAction && (
        <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3>{confirmAction.title}</h3>
            <p>{confirmAction.message}</p>
            <div className="confirm-buttons">
              <button className="btn-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="btn-confirm" onClick={confirmAction.onConfirm}>{confirmAction.confirmLabel || 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-top">
          <h1>🦊 Firefox Performance Tuner</h1>
          <StatusBadge isMonitoring={isMonitoring} refreshInterval={refreshInterval} />
        </div>
        <p className="header-subtitle">Real-time monitoring and optimization for Firefox on X11 + Mesa</p>
      </header>

      {apiMode !== 'full' && apiMode !== 'checking' && (
        <div className={`mode-banner mode-${apiMode}`}>
          {apiMode === 'demo' && '📺 DEMO MODE — Static preview on GitHub Pages. Run locally with `npm start` for full features.'}
          {apiMode === 'disconnected' && '⚠️ API DISCONNECTED — Backend server is not running. Start with `npm start` to enable all features.'}
        </div>
      )}

      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'prefs' && prefIssueCount > 0 && (
              <span className="tab-badge">{prefIssueCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={`btn-monitor ${isMonitoring ? 'btn-active' : ''}`}
            onClick={() => {
              setIsMonitoring(!isMonitoring)
              showToast(isMonitoring ? 'Monitoring paused' : 'Monitoring started', 'info', 2000)
            }}
          >
            {isMonitoring ? '⏸ Pause' : '▶ Monitor'}
          </button>
          <select
            className="interval-select"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
          >
            <option value={1}>1s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button
            className="btn-apply"
            onClick={() => setConfirmAction({
              title: 'Apply All Optimized Preferences?',
              message: 'This will write all recommended values to user.js. A backup will be created. Firefox must be restarted to apply changes.',
              confirmLabel: 'Apply',
              onConfirm: applyPreferences
            })}
          >
            ⚙️ Apply All Preferences
          </button>
          <button className="btn-refresh" onClick={fetchAll}>🔄 Refresh</button>
        </div>
      </div>

      <main className="tab-content">
        {activeTab === 'overview' && (
          <>
            <div className="overview-grid">
              <SystemInfo data={systemInfo} />
              <div className="overview-summary">
                <div className="section">
                  <div className="section-title">Quick Status</div>
                  <div className="summary-cards">
                    <div className={`summary-card ${prefIssueCount === 0 ? 'card-ok' : 'card-warn'}`}>
                      <div className="card-number">{prefIssueCount}</div>
                      <div className="card-label">Pref Issues</div>
                    </div>
                    <div className="summary-card card-info">
                      <div className="card-number">{processes.length}</div>
                      <div className="card-label">Processes</div>
                    </div>
                    <div className={`summary-card ${logs.length === 0 ? 'card-ok' : 'card-warn'}`}>
                      <div className="card-number">{logs.length}</div>
                      <div className="card-label">GPU Delays</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="section" style={{ marginTop: '16px' }}>
              <div className="section-title">🧪 Performance Benchmark</div>
              <p style={{ color: '#888', marginBottom: '12px', fontSize: '0.9rem' }}>
                Detect your system capabilities and get tailored Firefox optimization recommendations.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                  className="btn-apply"
                  onClick={runBenchmark}
                  disabled={benchLoading}
                >
                  {benchLoading ? '⏳ Running...' : '🚀 Run Benchmark'}
                </button>
                {Object.keys(prefCategories).length > 0 && (
                  <CopyButton
                    text={generatePreferenceScript(getCriticalPrefs())}
                    label="📦 Export Configuration"
                    showToast={showToast}
                  />
                )}
              </div>

              {benchmark && (
                <div className="bench-results">
                  <div className="summary-cards" style={{ marginBottom: '16px' }}>
                    <div className={`summary-card ${benchmark.score >= 70 ? 'card-ok' : benchmark.score >= 40 ? 'card-warn' : 'card-error'}`}>
                      <div className="card-number">{benchmark.score}</div>
                      <div className="card-label">Score / 100</div>
                    </div>
                    <div className="summary-card card-info">
                      <div className="card-number">{benchmark.system?.cpuCores || '?'}</div>
                      <div className="card-label">CPU Cores</div>
                    </div>
                    <div className="summary-card card-info">
                      <div className="card-number">{benchmark.system?.ramGb || '?'}</div>
                      <div className="card-label">RAM (GB)</div>
                    </div>
                  </div>

                  <div className="bench-hw">
                    <div className="metric"><span className="metric-label">GPU Renderer</span><span className="metric-value">{benchmark.gpu?.renderer}</span></div>
                    <div className="metric"><span className="metric-label">OpenGL</span><span className="metric-value">{benchmark.gpu?.glVersion}</span></div>
                    <div className="metric"><span className="metric-label">GPU Device</span><span className="metric-value">{benchmark.gpu?.device}</span></div>
                    <div className="metric"><span className="metric-label">VA-API</span><span className="metric-value">{benchmark.gpu?.vaapi}</span></div>
                    <div className="metric"><span className="metric-label">CPU</span><span className="metric-value">{benchmark.system?.cpuModel}</span></div>
                    <div className="metric"><span className="metric-label">Software Render</span><span className={`metric-value ${benchmark.gpu?.isSoftwareRenderer ? 'val-high' : 'status-ok'}`}>{benchmark.gpu?.isSoftwareRenderer ? 'YES ⚠' : 'No ✓'}</span></div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ color: '#4a9eff', marginBottom: '8px' }}>Recommendations</h4>
                    {benchmark.recommendations?.map((rec, i) => (
                      <div key={i} className={`bench-rec bench-rec-${rec.severity}`}>
                        <span className="bench-rec-icon">
                          {rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : rec.severity === 'ok' ? '🟢' : 'ℹ️'}
                        </span>
                        <div>
                          <strong>{rec.title}</strong>
                          <p style={{ color: '#aaa', margin: '4px 0 0', fontSize: '0.85rem' }}>{rec.detail}</p>
                          {rec.prefs?.length > 0 && (
                            <div className="bench-rec-prefs">
                              {rec.prefs.map((p, j) => <code key={j}>{p}</code>)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'prefs' && (
          <PreferencesPanel
            preferences={preferences}
            categories={prefCategories}
            onApply={() => setConfirmAction({
              title: 'Apply All Optimized Preferences?',
              message: 'This will write all recommended values to user.js. A backup will be created. Firefox must be restarted to apply changes.',
              confirmLabel: 'Apply',
              onConfirm: applyPreferences
            })}
          />
        )}

        {activeTab === 'editor' && (
          <UserJsEditor showToast={showToast} systemInfo={systemInfo} apiMode={apiMode} />
        )}

        {activeTab === 'monitor' && (
          <>
            <ProcessMonitor processes={processes} />
            <LogViewer logs={logs} />
          </>
        )}
      </main>
    </div>
  )
}

export default App

