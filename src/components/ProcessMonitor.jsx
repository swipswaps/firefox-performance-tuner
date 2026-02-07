export default function ProcessMonitor({ processes }) {
  if (!processes || processes.length === 0) {
    return (
      <div className="section">
        <div className="section-title">Firefox Processes</div>
        <p className="status-warn">Firefox not running</p>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="section-title">Firefox Processes</div>
      <div className="metric">
        <span className="metric-label">Total processes:</span>
        <span className="metric-value">{processes.length}</span>
      </div>
      
      <div className="process-list">
        <pre>
          <div>USER       PID  %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND</div>
          {processes.map((proc, idx) => (
            <div key={idx}>{proc}</div>
          ))}
        </pre>
      </div>
    </div>
  )
}

