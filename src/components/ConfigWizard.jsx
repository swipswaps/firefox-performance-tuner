import { useState, useEffect } from "react";
import {
  generateFullSetupScript,
  generateProfileFindScript,
  generateRestartScript,
  generateRecoveryScript,
  generateEmergencyRecoveryScript,
} from "../utils/clipboard";
import CopyButton from "./CopyButton";
import "./ConfigWizard.css";

export default function ConfigWizard({
  systemInfo,
  userJsContent,
  showToast,
  onClose,
}) {
  const [mode, setMode] = useState("loading"); // 'loading', 'full', 'demo'
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);
  const [prefsOk, setPrefsOk] = useState(false);
  const [diff, setDiff] = useState([]);
  const [diffPreview, setDiffPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Detect operational mode on mount
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(() => {
        setMode("full");
        // Auto-detect profile in FULL mode
        return fetch("/api/wizard/profile");
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data) {
          setProfile(data.profile);
          setPrefsOk(data.prefsExists);
        }
      })
      .catch(() => setMode("demo"));
  }, []);

  // FULL mode wizard functions
  const previewDiff = async () => {
    if (mode !== "full") return;

    try {
      const res = await fetch("/api/wizard/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newContent: userJsContent }),
      });
      const data = await res.json();
      setDiff(data.diff);
      setDiffPreview(true);
    } catch (_error) {
      showToast("❌ Failed to generate diff preview", "error", 3000);
    }
  };

  const applyConfig = async () => {
    if (mode !== "full") return;

    setApplying(true);
    try {
      const res = await fetch("/api/wizard/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newContent: userJsContent }),
      });

      if (res.ok) {
        setApplied(true);
        showToast("✅ Configuration applied successfully!", "success", 3000);
      } else {
        const error = await res.json();
        showToast(
          `❌ ${error.error || "Failed to apply configuration"}`,
          "error",
          3000,
        );
      }
    } catch (_error) {
      showToast("❌ Failed to apply configuration", "error", 3000);
    } finally {
      setApplying(false);
    }
  };

  const rollback = async () => {
    if (mode !== "full") return;

    try {
      const res = await fetch("/api/wizard/rollback", { method: "POST" });
      if (res.ok) {
        showToast("✅ Rolled back to previous configuration", "success", 3000);
        setApplied(false);
        setDiffPreview(false);
      } else {
        const error = await res.json();
        showToast(`❌ ${error.error || "Rollback failed"}`, "error", 3000);
      }
    } catch (_error) {
      showToast("❌ Rollback failed", "error", 3000);
    }
  };

  // DEMO mode: clipboard-based steps
  const steps = [
    {
      id: 1,
      title: "🔍 Step 1: Verify Your Firefox Profile",
      description:
        "This script checks that your Firefox profile exists and is ready for configuration. It detects normal, Flatpak, and Snap installs automatically. Run it first to confirm everything looks right.",
      script: generateProfileFindScript(),
      instructions: [
        "Copy the script below and paste it into a terminal",
        "It will print your Firefox profile path (e.g. ~/.mozilla/firefox/abc123.default)",
        'If it says "Firefox is running", close Firefox first',
        'If it says "prefs.js not found", the profile may be invalid — try launching Firefox once first',
      ],
    },
    {
      id: 2,
      title: "📝 Step 2: Apply Configuration",
      description:
        "This all-in-one script does everything: finds your profile, creates a rotating backup of your existing user.js (keeps last 5), writes the new configuration, and verifies Firefox starts correctly. If Firefox crashes after applying, it automatically rolls back.",
      script: generateFullSetupScript(systemInfo, {}, userJsContent),
      instructions: [
        "Close Firefox completely before running",
        "Copy the script and paste it into a terminal",
        "The script will show exactly what it's doing at each step",
        "If anything goes wrong, your original config is preserved in the backup",
      ],
    },
    {
      id: 3,
      title: "✅ Step 3: Verify & Restart",
      description:
        "Only needed if Step 2 didn't restart Firefox automatically. This script closes Firefox, restarts it, and watches for crashes. If Firefox fails to start, it shows exactly what to do.",
      script: generateRestartScript(),
      instructions: [
        "Copy and run in terminal",
        'Wait for "Firefox started successfully" confirmation',
        'If you see "EMERGENCY RECOVERY" instructions, follow them — your backup is safe',
      ],
    },
    {
      id: 4,
      title: "🆘 Emergency Recovery (if needed)",
      description:
        "Use this only if Firefox won't start or behaves badly after applying configuration. It lists all your backups and lets you restore any of them, delete user.js entirely, or start Firefox in Safe Mode.",
      script: generateRecoveryScript(),
      instructions: [
        "Copy and run in terminal — it's interactive and will guide you",
        "Option 1: Restore from most recent backup (recommended)",
        "Option 2: View backup contents before restoring",
        "Option 3: Delete user.js entirely (Firefox uses built-in defaults)",
        "Option 4: Start Firefox in Safe Mode for troubleshooting",
      ],
    },
  ];

  const currentStep = steps.find((s) => s.id === step);

  // FULL mode: API-based wizard with diff preview
  if (mode === "full") {
    return (
      <div className="wizard-overlay" onClick={onClose}>
        <div className="wizard-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="wizard-header">
            <h2>🧙 Zero-Mistake Configuration Wizard</h2>
            <button className="wizard-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="wizard-content">
            <div className="wizard-info">
              <p>
                <strong>Profile:</strong> {profile || "Detecting..."}
              </p>
              <p>
                <strong>prefs.js present:</strong>{" "}
                {prefsOk ? "✅ Yes" : "❌ No"}
              </p>
            </div>

            {!diffPreview && !applied && (
              <div className="wizard-step">
                <h3>📋 Step 1: Preview Changes</h3>
                <p>Review what will change before applying configuration.</p>

                <div className="wizard-safety-notice">
                  <h4>🛡️ Safety First!</h4>
                  <p>
                    Before applying any configuration, save the emergency
                    recovery script:
                  </p>
                  <CopyButton
                    text={generateEmergencyRecoveryScript()}
                    label="📥 Copy Emergency Recovery Script"
                    showToast={showToast}
                  />
                  <p className="wizard-safety-tip">
                    💡 Save this script to a file (e.g.,{" "}
                    <code>firefox-recovery.sh</code>) and make it executable
                    with <code>chmod +x firefox-recovery.sh</code>
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
                          color: part.added
                            ? "#22c55e"
                            : part.removed
                              ? "#ef4444"
                              : "#6b7280",
                          backgroundColor: part.added
                            ? "#22c55e20"
                            : part.removed
                              ? "#ef444420"
                              : "transparent",
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
                    {applying ? "Applying..." : "✅ Apply Safely"}
                  </button>
                </div>
              </div>
            )}

            {applied && (
              <div className="wizard-step">
                <h3>✅ Configuration Applied</h3>
                <p>Configuration has been applied with backup created.</p>
                <p className="wizard-warning">
                  ⚠️ Restart Firefox to apply changes
                </p>

                <div className="wizard-recovery-info">
                  <h4>🛡️ Recovery Options (if Firefox won't start):</h4>
                  <ol>
                    <li>
                      <strong>Use Rollback button below</strong> - Restores
                      previous config
                    </li>
                    <li>
                      <strong>Manual restore:</strong>{" "}
                      <code>
                        cp {profile}/user.js.backup.1 {profile}/user.js
                      </code>
                    </li>
                    <li>
                      <strong>Delete user.js:</strong>{" "}
                      <code>rm {profile}/user.js</code>
                    </li>
                    <li>
                      <strong>Safe Mode:</strong>{" "}
                      <code>firefox --safe-mode</code>
                    </li>
                  </ol>
                  <p className="wizard-recovery-note">
                    💡 Backups are kept at:{" "}
                    <code>{profile}/user.js.backup.1</code> through{" "}
                    <code>.backup.5</code>
                  </p>
                </div>

                <div className="wizard-actions">
                  <button className="wizard-btn-secondary" onClick={rollback}>
                    ↩️ Rollback
                  </button>
                  <button className="wizard-btn-primary" onClick={onClose}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // DEMO mode: clipboard-based wizard
  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>🧙 Configuration Wizard</h2>
          <button className="wizard-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="wizard-intro">
          Each step below gives you a self-contained shell script to copy and
          run in your terminal. Scripts auto-detect your Firefox profile, create
          backups, and include safety checks.
          {step === 2 &&
            " Step 2 is the main one — it does everything in a single script."}
          {step === 4 && " Use this only if something went wrong."}
        </p>

        <div className="wizard-progress">
          {steps.map((s) => (
            <div
              key={s.id}
              className={`wizard-step-indicator ${s.id === step ? "active" : ""} ${s.id < step ? "complete" : ""}`}
              onClick={() => setStep(s.id)}
            >
              {s.id < step ? "✓" : s.id}
            </div>
          ))}
        </div>

        <div className="wizard-content">
          <h3>{currentStep.title}</h3>
          <p className="wizard-description">{currentStep.description}</p>

          <div className="wizard-instructions">
            <h4>What to do:</h4>
            <ol>
              {currentStep.instructions.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ol>
          </div>

          <div className="wizard-script">
            <div className="wizard-script-header">
              <span>📋 Script — copy and paste into terminal</span>
              <CopyButton
                text={currentStep.script}
                label="📋 Copy to Clipboard"
                showToast={showToast}
                small
              />
            </div>
            <pre>
              <code>{currentStep.script}</code>
            </pre>
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
            onClick={() =>
              step < steps.length ? setStep(step + 1) : onClose()
            }
          >
            {step < steps.length ? "Next →" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
