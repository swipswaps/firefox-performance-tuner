import { useState, useEffect } from 'react'
import './UserJsEditor.css'

function UserJsEditor() {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [filePath, setFilePath] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Load user.js content
  const loadUserJs = async () => {
    try {
      const response = await fetch('/api/user-js')
      const data = await response.json()
      setContent(data.content || '')
      setOriginalContent(data.content || '')
      setFilePath(data.path || '')
      setIsModified(false)
    } catch (error) {
      console.error('Failed to load user.js:', error)
      setMessage('❌ Failed to load user.js')
    }
  }

  // Save user.js content
  const saveUserJs = async () => {
    setIsSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/user-js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      const result = await response.json()
      setMessage(`✅ ${result.message}`)
      setOriginalContent(content)
      setIsModified(false)
    } catch (error) {
      console.error('Failed to save user.js:', error)
      setMessage('❌ Failed to save user.js')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle content change
  const handleChange = (e) => {
    const newContent = e.target.value
    setContent(newContent)
    setIsModified(newContent !== originalContent)
  }

  // Reset to original
  const handleReset = () => {
    setContent(originalContent)
    setIsModified(false)
    setMessage('')
  }

  // Load on mount
  useEffect(() => {
    loadUserJs()
  }, [])

  return (
    <div className="user-js-editor">
      <div className="editor-header">
        <h2>📝 user.js Editor</h2>
        <div className="editor-info">
          <span className="file-path">{filePath || 'Loading...'}</span>
          {isModified && <span className="modified-indicator">● Modified</span>}
        </div>
      </div>

      <div className="editor-controls">
        <button onClick={loadUserJs} disabled={isSaving}>
          🔄 Reload
        </button>
        <button 
          onClick={saveUserJs} 
          disabled={!isModified || isSaving}
          className="save-button"
        >
          {isSaving ? '💾 Saving...' : '💾 Save'}
        </button>
        <button 
          onClick={handleReset} 
          disabled={!isModified || isSaving}
        >
          ↩️ Reset
        </button>
      </div>

      {message && (
        <div className={`editor-message ${message.startsWith('✅') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      <textarea
        className="user-js-textarea"
        value={content}
        onChange={handleChange}
        placeholder="// user.js content will appear here&#10;// Edit and save to apply changes&#10;// Remember to restart Firefox after saving!"
        spellCheck={false}
      />

      <div className="editor-footer">
        <p>
          ⚠️ <strong>Important:</strong> Changes to user.js require Firefox restart to take effect.
          Close all Firefox windows and restart the browser after saving.
        </p>
      </div>
    </div>
  )
}

export default UserJsEditor

