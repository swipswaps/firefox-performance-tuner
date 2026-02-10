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

  // Save user.js content (handles validation + Firefox running errors)
  const saveUserJs = async () => {
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
