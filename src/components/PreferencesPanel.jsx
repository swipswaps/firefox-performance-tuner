export default function PreferencesPanel({ preferences, categories }) {
  // Build flat expected map from categories
  const flatPrefs = {}
  for (const cat of Object.values(categories || {})) {
    for (const [key, val] of Object.entries(cat)) {
      flatPrefs[key] = val.expected
    }
  }

  const hasIssues = Object.keys(flatPrefs).some(key => {
    return preferences[key] !== flatPrefs[key]
  })

  const categoryEntries = Object.entries(categories || {})

  if (categoryEntries.length === 0) {
    return (
      <div className="section">
        <div className="section-title">Preferences</div>
        <p style={{ color: '#888' }}>Loading preference categories...</p>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="section-title">Performance Preferences (X11 + Mesa Optimization)</div>

      {categoryEntries.map(([catName, prefs]) => (
        <div key={catName} style={{ marginBottom: '1rem' }}>
          <div style={{ color: '#fbbf24', fontWeight: 'bold', margin: '10px 0 5px' }}>
            {catName}
          </div>
          {Object.entries(prefs).map(([key, val]) => {
            const expected = val.expected
            const actual = preferences[key]

            let icon = '✓'
            let className = 'status-ok'
            let status = 'ok'

            if (actual === undefined || actual === null) {
              icon = '⚠'
              className = 'status-warn'
              status = 'not-set'
            } else if (actual !== expected) {
              icon = '✗'
              className = 'status-error'
              status = 'error'
            }

            return (
              <div key={key} className="pref-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={`status-icon ${className}`}>{icon}</span>
                  <span>
                    {key} = {actual !== undefined ? actual : 'NOT SET'}
                    {status !== 'ok' && ` (expected: ${expected})`}
                  </span>
                </div>
                <div style={{ color: '#888', fontSize: '0.8rem', marginLeft: '26px' }}>
                  {val.description}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {hasIssues && (
        <div className="error-box">
          <strong>⚠ ACTION REQUIRED: Some preferences differ from expected!</strong>
          <p>Firefox must be RESTARTED to apply user.js changes</p>
          <ol>
            <li>Click "Apply All Optimized Preferences" above</li>
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

