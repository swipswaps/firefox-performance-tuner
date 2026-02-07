export default function LogViewer({ logs }) {
  const hasDelays = logs.some(log => 
    log.toLowerCase().includes('wait') || 
    log.toLowerCase().includes('delay') || 
    log.toLowerCase().includes('flush')
  )

  return (
    <div className="section">
      <div className="section-title">MOZ_LOG (GPU delays - last 10 lines)</div>
      
      {logs.length === 0 ? (
        <div className="warning-box">
          <p>MOZ_LOG not available</p>
          <p>Start Firefox with:</p>
          <code>MOZ_LOG="Graphics:5" MOZ_LOG_FILE="~/.cache/firefox-hud/mozlog_graphics.txt" firefox</code>
        </div>
      ) : hasDelays ? (
        <div className="log-line delay">
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      ) : (
        <div className="log-line ok">
          ✓ No GPU delays detected
        </div>
      )}
    </div>
  )
}

