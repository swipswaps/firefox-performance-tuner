export default function PreferencesPanel({ preferences, criticalPrefs }) {
  const hasIssues = Object.keys(criticalPrefs).some(key => {
    const expected = criticalPrefs[key]
    const actual = preferences[key]
    return actual !== expected
  })

  return (
    <div className="section">
      <div className="section-title">Critical Preferences (X11+Mesa Optimization)</div>
      
      {Object.keys(criticalPrefs).map(key => {
        const expected = criticalPrefs[key]
        const actual = preferences[key]
        
        let status = 'ok'
        let icon = '✓'
        let className = 'status-ok'
        
        if (actual === undefined || actual === null) {
          status = 'not-set'
          icon = '⚠'
          className = 'status-warn'
        } else if (actual !== expected) {
          status = 'error'
          icon = '✗'
          className = 'status-error'
        }
        
        return (
          <div key={key} className="pref-item">
            <span className={`status-icon ${className}`}>{icon}</span>
            <span>
              {key} = {actual !== undefined ? actual : 'NOT SET'}
              {status !== 'ok' && ` (expected: ${expected})`}
            </span>
          </div>
        )
      })}
      
      {hasIssues && (
        <div className="error-box">
          <strong>⚠ ACTION REQUIRED: Preferences are not applied!</strong>
          <p>Firefox must be RESTARTED to apply user.js changes</p>
          <ol>
            <li>Close ALL Firefox windows</li>
            <li>Run: <code>killall firefox</code></li>
            <li>Start Firefox normally</li>
            <li>Verify preferences show ✓ in this panel</li>
          </ol>
        </div>
      )}
    </div>
  )
}

