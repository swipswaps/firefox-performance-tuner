import { useRef, useEffect, useMemo } from 'react'

function classifyLine(line) {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('fail')) return 'log-error'
  if (lower.includes('wait') || lower.includes('delay')) return 'log-warn'
  if (lower.includes('flush') || lower.includes('timeout')) return 'log-warn'
  return 'log-info'
}

export default function LogViewer({ logs }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const classified = useMemo(() => {
    return (logs || []).map((line, i) => ({
      id: i,
      text: line,
      severity: classifyLine(line),
    }))
  }, [logs])

  const warnCount = classified.filter(l => l.severity === 'log-warn').length
  const errorCount = classified.filter(l => l.severity === 'log-error').length

  return (
    <div className="section">
      <div className="section-title">📋 GPU Log (MOZ_LOG)</div>

      {logs.length === 0 ? (
        <div className="log-empty">
          <p style={{ color: '#888', marginBottom: '8px' }}>No GPU log data available.</p>
          <p style={{ color: '#666', fontSize: '0.85rem' }}>
            Start Firefox with logging enabled:
          </p>
          <code style={{ display: 'block', marginTop: '8px', padding: '8px 12px', background: '#1a1a1a', borderRadius: '6px', fontSize: '0.8rem', overflowX: 'auto' }}>
            MOZ_LOG="Graphics:5" MOZ_LOG_FILE="~/.cache/firefox-hud/mozlog_graphics.txt" firefox
          </code>
        </div>
      ) : (
        <>
          <div className="log-stats">
            <span className="log-stat">Lines: {classified.length}</span>
            {warnCount > 0 && <span className="log-stat log-stat-warn">⚠ {warnCount} delays</span>}
            {errorCount > 0 && <span className="log-stat log-stat-error">✗ {errorCount} errors</span>}
            {warnCount === 0 && errorCount === 0 && <span className="log-stat log-stat-ok">✓ No issues</span>}
          </div>
          <div className="log-scroll" ref={scrollRef}>
            {classified.map(l => (
              <div key={l.id} className={`log-row ${l.severity}`}>
                <span className="log-text">{l.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

