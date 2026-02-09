import { useState, useEffect } from 'react'
import { generateFullSetupScript, generateProfileFindScript, generateRestartScript, generateRecoveryScript, copyToClipboard } from '../utils/clipboard'
import CopyButton from './CopyButton'
import './ConfigWizard.css'

export default function ConfigWizard({ systemInfo, userJsContent, showToast, onClose }) {
  const [mode, setMode] = useState('loading') // 'loading', 'full', 'demo'
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState(null)
  const [prefsOk, setPrefsOk] = useState(false)
  const [diff, setDiff] = useState([])
  const [diffPreview, setDiffPreview] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  // Detect operational mode on mount
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(() => {
        setMode('full')
        // Auto-detect profile in FULL mode
        return fetch('/api/wizard/profile')
      })
      .then(r => r?.json())
      .then(data => {
        if (data) {
          setProfile(data.profile)
          setPrefsOk(data.prefsExists)
        }
      })
      .catch(() => setMode('demo'))
  }, [])

  // FULL mode wizard functions
  const previewDiff = async () => {
    if (mode !== 'full') return

    try {
      const res = await fetch('/api/wizard/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newContent: userJsContent })
      })
      const data = await res.json()
      setDiff(data.diff)
      setDiffPreview(true)
    } catch (error) {
      showToast('❌ Failed to generate diff preview', 'error', 3000)
    }
  }

  const applyConfig = async () => {
    if (mode !== 'full') return

    setApplying(true)
    try {
      const res = await fetch('/api/wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newContent: userJsContent })
      })

      if (res.ok) {
        setApplied(true)
        showToast('✅ Configuration applied successfully!', 'success', 3000)
      } else {
        const error = await res.json()
        showToast(`❌ ${error.error || 'Failed to apply configuration'}`, 'error', 3000)
      }
    } catch (error) {
      showToast('❌ Failed to apply configuration', 'error', 3000)
    } finally {
      setApplying(false)
    }
  }

  const rollback = async () => {
    if (mode !== 'full') return

    try {
      const res = await fetch('/api/wizard/rollback', { method: 'POST' })
      if (res.ok) {
        showToast('✅ Rolled back to previous configuration', 'success', 3000)
        setApplied(false)
        setDiffPreview(false)
      } else {
        const error = await res.json()
        showToast(`❌ ${error.error || 'Rollback failed'}`, 'error', 3000)
      }
    } catch (error) {
      showToast('❌ Rollback failed', 'error', 3000)
    }
  }

  // DEMO mode: clipboard-based steps
  const steps = [
    {
      id: 1,
      title: '🔍 Find Your Firefox Profile',
      description: 'First, we need to locate your Firefox profile directory.',
      script: generateProfileFindScript(),
      instructions: [
        'Copy the script below',
        'Open a terminal',
        'Paste and run the script',
        'Note the profile path shown'
      ]
    },
    {
      id: 2,
      title: '📝 Apply Configuration',
      description: 'This script will backup your current user.js (if it exists) and apply the new configuration.',
      script: generateFullSetupScript(systemInfo, {}, userJsContent),
      instructions: [
        'Copy the complete setup script',
        'Paste into terminal and run',
        'The script will automatically find your profile, create a backup, and apply changes',
        'Script includes self-healing verification - auto-rolls back if Firefox fails to start'
      ]
    },
    {
      id: 3,
      title: '✅ Verify & Restart',
      description: 'Restart Firefox with automatic verification. If Firefox fails to start, the script will show recovery instructions.',
      script: generateRestartScript(),
      instructions: [
        'Copy the restart script',
        'Run in terminal',
        'Script will verify Firefox starts successfully',
        'If Firefox crashes, recovery instructions will be shown automatically'
      ]
    },
    {
      id: 4,
      title: '🆘 Emergency Recovery',
      description: 'If Firefox won\'t start or is unstable, use this interactive recovery script.',
      script: generateRecoveryScript(),
      instructions: [
        'Copy the recovery script',
        'Run in terminal',
        'Script will list all available backups',
        'Choose option to restore, delete user.js, or start in Safe Mode'
      ]
    }
  ]

  const currentStep = steps.find(s => s.id === step)

  // FULL mode: API-based wizard with diff preview
  if (mode === 'full') {
    return (
      <div className="wizard-overlay" onClick={onClose}>
        <div className="wizard-dialog" onClick={e => e.stopPropagation()}>
          <div className="wizard-header">
            <h2>🧙 Zero-Mistake Configuration Wizard</h2>
            <button className="wizard-close" onClick={onClose}>×</button>
          </div>

          <div className="wizard-content">
            <div className="wizard-info">
              <p><strong>Profile:</strong> {profile || 'Detecting...'}</p>
              <p><strong>prefs.js present:</strong> {prefsOk ? '✅ Yes' : '❌ No'}</p>
            </div>

            {!diffPreview && !applied && (
              <div className="wizard-step">
                <h3>📋 Step 1: Preview Changes</h3>
                <p>Review what will change before applying configuration.</p>

                <div className="wizard-safety-notice">
                  <h4>🛡️ Safety First!</h4>
                  <p>Before applying any configuration, save the emergency recovery script:</p>
                  <CopyButton
                    text={generateEmergencyRecoveryScript()}
                    label="📥 Copy Emergency Recovery Script"
                    showToast={showToast}
                  />
                  <p className="wizard-safety-tip">
                    💡 Save this script to a file (e.g., <code>firefox-recovery.sh</code>) and make it executable with <code>chmod +x firefox-recovery.sh</code>
                  </p>
                </div>

                <button
                  className="wizard-btn-primary"
                  onClick={previewDiff}
                  disabled={!profile}
                >
                  Preview Changes
                </button>
              </div>
            )}

            {diffPreview && !applied && (
              <div className="wizard-step">
                <h3>🔍 Diff Preview</h3>
                <div className="wizard-diff">
                  <pre>
                    {diff.map((part, i) => (
                      <span
                        key={i}
                        style={{
                          color: part.added ? '#22c55e' : part.removed ? '#ef4444' : '#6b7280',
                          backgroundColor: part.added ? '#22c55e20' : part.removed ? '#ef444420' : 'transparent'
                        }}
                      >
                        {part.value}
                      </span>
                    ))}
                  </pre>
                </div>
                <div className="wizard-actions">
                  <button
                    className="wizard-btn-secondary"
                    onClick={() => setDiffPreview(false)}
                  >
                    ← Back
                  </button>
                  <button
                    className="wizard-btn-primary"
                    onClick={applyConfig}
                    disabled={applying}
                  >
                    {applying ? 'Applying...' : '✅ Apply Safely'}
                  </button>
                </div>
              </div>
            )}

            {applied && (
              <div className="wizard-step">
                <h3>✅ Configuration Applied</h3>
                <p>Configuration has been applied with backup created.</p>
                <p className="wizard-warning">⚠️ Restart Firefox to apply changes</p>

                <div className="wizard-recovery-info">
                  <h4>🛡️ Recovery Options (if Firefox won't start):</h4>
                  <ol>
                    <li><strong>Use Rollback button below</strong> - Restores previous config</li>
                    <li><strong>Manual restore:</strong> <code>cp {profile}/user.js.backup.1 {profile}/user.js</code></li>
                    <li><strong>Delete user.js:</strong> <code>rm {profile}/user.js</code></li>
                    <li><strong>Safe Mode:</strong> <code>firefox --safe-mode</code></li>
                  </ol>
                  <p className="wizard-recovery-note">
                    💡 Backups are kept at: <code>{profile}/user.js.backup.1</code> through <code>.backup.5</code>
                  </p>
                </div>

                <div className="wizard-actions">
                  <button
                    className="wizard-btn-secondary"
                    onClick={rollback}
                  >
                    ↩️ Rollback
                  </button>
                  <button
                    className="wizard-btn-primary"
                    onClick={onClose}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // DEMO mode: clipboard-based wizard
  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-dialog" onClick={e => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>🧙 Configuration Wizard (DEMO Mode)</h2>
          <button className="wizard-close" onClick={onClose}>×</button>
        </div>

        <div className="wizard-progress">
          {steps.map(s => (
            <div
              key={s.id}
              className={`wizard-step-indicator ${s.id === step ? 'active' : ''} ${s.id < step ? 'complete' : ''}`}
              onClick={() => setStep(s.id)}
            >
              {s.id < step ? '✓' : s.id}
            </div>
          ))}
        </div>

        <div className="wizard-content">
          <h3>{currentStep.title}</h3>
          <p className="wizard-description">{currentStep.description}</p>

          <div className="wizard-instructions">
            <h4>Instructions:</h4>
            <ol>
              {currentStep.instructions.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ol>
          </div>

          <div className="wizard-script">
            <div className="wizard-script-header">
              <span>📋 Script</span>
              <CopyButton
                text={currentStep.script}
                label="Copy Script"
                showToast={showToast}
                small
              />
            </div>
            <pre><code>{currentStep.script}</code></pre>
          </div>
        </div>

        <div className="wizard-footer">
          <button
            className="wizard-btn-secondary"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            ← Previous
          </button>
          <button
            className="wizard-btn-primary"
            onClick={() => step < steps.length ? setStep(step + 1) : onClose()}
          >
            {step < steps.length ? 'Next →' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}

