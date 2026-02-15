import { useState } from "react";
import "./AutoFix.css";

export default function AutoFix({ preferences, categories, showToast, onFixed }) {
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState(null);
  const [externalPlayers, setExternalPlayers] = useState(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Calculate issue count
  const flatPrefs = {};
  for (const cat of Object.values(categories || {})) {
    for (const [key, val] of Object.entries(cat)) {
      flatPrefs[key] = val.expected;
    }
  }

  const issueCount = Object.keys(flatPrefs).filter(
    (k) => preferences[k] !== flatPrefs[k],
  ).length;

  const handleAutoFix = async () => {
    if (fixing) return;

    const confirmed = window.confirm(
      `Auto-fix will:\n\n` +
      `✅ Automatically close Firefox (if running)\n` +
      `✅ Fix ${issueCount} preference issues\n` +
      `✅ Create automatic backup\n` +
      `✅ Apply optimal settings for video playback and tab suspension\n` +
      `✅ Restart Firefox automatically\n\n` +
      `⚠️ Save any work in Firefox before continuing!\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    setFixing(true);
    setResult(null);

    try {
      const response = await fetch("/api/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Auto-fix failed");
      }

      setResult(data);
      showToast(`✅ Fixed ${data.issuesFixed} issues!`, "success", 5000);
      
      // Refresh preferences after fix
      if (onFixed) {
        setTimeout(onFixed, 1000);
      }
    } catch (error) {
      showToast(`❌ ${error.message}`, "error", 5000);
      setResult({ error: error.message });
    } finally {
      setFixing(false);
    }
  };

  const detectExternalPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const response = await fetch("/api/external-players");
      const data = await response.json();
      setExternalPlayers(data);
    } catch (error) {
      showToast("❌ Failed to detect external players", "error", 3000);
    } finally {
      setLoadingPlayers(false);
    }
  };

  return (
    <div className="auto-fix-panel">
      <div className="auto-fix-header">
        <h3>🔧 Automatic Problem Detection & Fixing</h3>
        <p>Detect and fix Firefox performance issues automatically</p>
      </div>

      <div className="auto-fix-status">
        {issueCount > 0 ? (
          <div className="status-warning">
            <span className="status-icon">⚠️</span>
            <div className="status-text">
              <strong>{issueCount} Issues Detected</strong>
              <p>Preferences not optimized for video playback and tab suspension</p>
            </div>
          </div>
        ) : (
          <div className="status-ok">
            <span className="status-icon">✅</span>
            <div className="status-text">
              <strong>All Preferences Optimal</strong>
              <p>No issues detected — Firefox is fully optimized</p>
            </div>
          </div>
        )}
      </div>

      {issueCount > 0 && (
        <div className="auto-fix-actions">
          <button
            className="btn-auto-fix"
            onClick={handleAutoFix}
            disabled={fixing}
          >
            {fixing ? "🔄 Fixing..." : "🔧 Fix All Issues Automatically"}
          </button>
          <p className="auto-fix-hint">
            ⚡ One-click fix for video buffering, tab suspension, and performance
          </p>
        </div>
      )}

      {result && result.success && (
        <div className="auto-fix-result success">
          <h4>✅ Auto-Fix Complete!</h4>
          <p><strong>Fixed {result.issuesFixed} issues</strong></p>
          <p>Backup created: <code>{result.backupPath}</code></p>
          <div className="next-steps">
            <h5>Next Steps:</h5>
            <ol>
              {result.nextSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="external-players-section">
        <h4>🎬 External Video Player Fallback</h4>
        <p>For videos that stutter in Firefox, use an external player</p>
        
        {!externalPlayers && (
          <button
            className="btn-detect-players"
            onClick={detectExternalPlayers}
            disabled={loadingPlayers}
          >
            {loadingPlayers ? "🔍 Detecting..." : "🔍 Detect Installed Players"}
          </button>
        )}

        {externalPlayers && (
          <div className="players-result">
            {externalPlayers.count > 0 ? (
              <div className="players-found">
                <p className="players-count">✅ Found {externalPlayers.count} player(s):</p>
                <ul>
                  {externalPlayers.players.map((player, i) => (
                    <li key={i}>
                      <strong>{player.name}</strong> (<code>{player.command}</code>)
                    </li>
                  ))}
                </ul>
                <p className="players-tip">💡 {externalPlayers.recommendation}</p>
              </div>
            ) : (
              <div className="players-none">
                <p>❌ No external players found</p>
                <p className="players-tip">💡 {externalPlayers.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

