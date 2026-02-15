import { useState, useEffect } from "react";
import CopyButton from "./CopyButton";
import ConfigWizard from "./ConfigWizard";
import {
  generateUserJsScript,
  generateRestartScript,
  generateEmergencyRecoveryScript,
} from "../utils/clipboard";
import "./UserJsEditor.css";

function UserJsEditor({ showToast, systemInfo, apiMode }) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // NEW: validation state
  const [isValidating, setIsValidating] = useState(false); // NEW: validation loading

  const notify = showToast || (() => {});
  const isDemoMode = apiMode === "demo" || apiMode === "disconnected";

  // Load user.js content
  const loadUserJs = async () => {
    try {
      const response = await fetch("/api/user-js");
      const data = await response.json();
      setContent(data.content || "");
      setOriginalContent(data.content || "");
      setFilePath(data.path || "");
      setIsModified(false);
    } catch (error) {
      console.error("Failed to load user.js:", error);
      notify("Failed to load user.js", "error");
    }
  };

  // NEW: Validate content without saving (dry-run)
  const validateContent = async (contentToValidate) => {
    setIsValidating(true);
    try {
      const response = await fetch("/api/user-js/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToValidate }),
      });
      const result = await response.json();
      setValidationStatus(result);
      return result;
    } catch (error) {
      console.error("Validation failed:", error);
      setValidationStatus({ valid: false, error: "Validation request failed" });
      return { valid: false, error: "Validation request failed" };
    } finally {
      setIsValidating(false);
    }
  };

  // Save user.js content (handles validation + Firefox running errors)
  const saveUserJs = async () => {
    // Validate first
    const validation = await validateContent(content);
    if (!validation.valid) {
      notify(`❌ Validation failed: ${validation.error}`, "error");
      return;
    }

    if (validation.firefoxRunning) {
      notify("⚠️ Close Firefox before saving changes", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/user-js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify(result.error || "Save failed", "error");
      } else {
        notify(result.message, "success");
        setOriginalContent(content);
        setIsModified(false);
        setValidationStatus(null); // Clear validation after successful save
      }
    } catch (error) {
      console.error("Failed to save user.js:", error);
      notify("Failed to save user.js", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle content change
  const handleChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);
    setIsModified(newContent !== originalContent);
  };

  // Reset to original
  const handleReset = () => {
    setContent(originalContent);
    setIsModified(false);
  };

  // Load on mount
  useEffect(() => {
    loadUserJs();
  }, []);

  return (
    <>
      {showWizard && (
        <ConfigWizard
          systemInfo={systemInfo}
          userJsContent={content}
          showToast={notify}
          onClose={() => setShowWizard(false)}
        />
      )}

      <div className="user-js-editor">
        <div className="editor-header">
          <h2>📝 user.js Editor</h2>
          <div className="editor-info">
            <span className="file-path">{filePath || "Loading..."}</span>
            {isModified && (
              <span className="modified-indicator">● Modified</span>
            )}
          </div>
        </div>

        {isDemoMode && (
          <div className="demo-mode-banner">
            <span>📋 Clipboard Mode</span>
            <p>
              Use the <strong>🧙 Setup Wizard</strong> button to get
              step-by-step scripts you can copy and run in your terminal.
            </p>
          </div>
        )}

        {/* NEW: Safety Status Banner */}
        {!isDemoMode && validationStatus && (
          <div className={`safety-banner ${validationStatus.valid ? 'safe' : 'unsafe'}`}>
            {validationStatus.valid ? (
              <>
                <div className="safety-header">
                  <span className="safety-icon">✅</span>
                  <strong>Safe to Apply</strong>
                </div>
                <div className="safety-details">
                  <p>✓ Syntax validation passed</p>
                  <p>✓ {validationStatus.prefCount} preferences detected</p>
                  {validationStatus.firefoxRunning && (
                    <p className="warning">⚠️ Close Firefox before saving</p>
                  )}
                  {validationStatus.warnings && validationStatus.warnings.length > 0 && (
                    <details>
                      <summary>⚠️ {validationStatus.warnings.length} warnings</summary>
                      <ul>
                        {validationStatus.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="safety-header">
                  <span className="safety-icon">❌</span>
                  <strong>Cannot Apply - Validation Failed</strong>
                </div>
                <div className="safety-details">
                  <p className="error">{validationStatus.error}</p>
                  <p><strong>Fix the error above before saving.</strong></p>
                  <p>💡 Tip: Check for unbalanced quotes, parentheses, or dangerous values.</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* NEW: Safety Guarantee Banner (always visible) */}
        {!isDemoMode && !validationStatus && (
          <div className="safety-guarantee">
            <span className="safety-icon">🛡️</span>
            <strong>Safety Guaranteed:</strong> All changes are validated and backed up.
            Firefox cannot be permanently broken.
            <button
              className="link-button"
              onClick={() => validateContent(content)}
              disabled={isValidating}
            >
              {isValidating ? "Validating..." : "Validate Now"}
            </button>
          </div>
        )}

        <div className="editor-controls">
          <div className="editor-controls-left">
            {!isDemoMode && (
              <>
                <button onClick={loadUserJs} disabled={isSaving}>
                  🔄 Reload
                </button>
                <button
                  onClick={saveUserJs}
                  disabled={!isModified || isSaving}
                  className="save-button"
                >
                  {isSaving ? "💾 Saving..." : "💾 Save"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={!isModified || isSaving}
                >
                  ↩️ Reset
                </button>
              </>
            )}
          </div>
          <div className="editor-controls-right">
            <button
              className="wizard-button"
              onClick={() => setShowWizard(true)}
              title="Step-by-step configuration wizard"
            >
              🧙 Setup Wizard
            </button>
            <CopyButton
              text={generateEmergencyRecoveryScript()}
              label="🚨 Emergency Recovery"
              showToast={notify}
              title="Copy emergency recovery script (save before applying changes)"
            />
            <CopyButton
              text={generateUserJsScript(content, true)}
              label="📋 Copy Setup Script"
              showToast={notify}
            />
            <CopyButton
              text={content}
              label="📋 Copy Content"
              showToast={notify}
            />
          </div>
        </div>

        <textarea
          className="user-js-textarea"
          value={content}
          onChange={handleChange}
          placeholder="// user.js content will appear here&#10;// Edit and save to apply changes&#10;// Remember to restart Firefox after saving!"
          spellCheck={false}
          readOnly={isDemoMode}
        />

        <div className="editor-footer">
          <div className="editor-footer-info">
            <p>
              ⚠️ <strong>Important:</strong> Changes to user.js require Firefox
              restart to take effect.
            </p>
          </div>
          <div className="editor-footer-actions">
            <CopyButton
              text={generateRestartScript()}
              label="📋 Copy Restart Command"
              showToast={notify}
              small
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default UserJsEditor;
