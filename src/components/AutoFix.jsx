import { useState, useEffect } from "react";
import "./AutoFix.css";

export default function AutoFix({ preferences, categories, showToast, onFixed }) {
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState(null);
  const [externalPlayers, setExternalPlayers] = useState(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [playingVideo, setPlayingVideo] = useState(false);

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
      `✅ Close Firefox (this page will close too!)\n` +
      `✅ Fix ${issueCount} preference issues\n` +
      `✅ Create automatic backup\n` +
      `✅ Apply optimal settings\n` +
      `✅ Restart Firefox and reopen this page\n\n` +
      `⚠️ Save any work in Firefox NOW!\n` +
      `⚠️ This page will close and reopen automatically.\n\n` +
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
    } catch (_error) {
      showToast("❌ Failed to detect external players", "error", 3000);
      // Set empty result on error so UI shows "no players found" instead of button
      setExternalPlayers({ players: [], count: 0, recommendation: "Install VLC or MPV for better video playback fallback" });
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Auto-detect external players on component mount
  useEffect(() => {
    detectExternalPlayers();
  }, []);

  const playInExternalPlayer = async (player) => {
    if (!videoUrl.trim()) {
      showToast("❌ Please enter a video URL", "error", 3000);
      return;
    }

    setPlayingVideo(true);
    try {
      const response = await fetch("/api/play-in-external-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim(), player }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to launch player");
      }

      showToast(`✅ ${data.player} launched successfully!`, "success", 3000);
      setVideoUrl(""); // Clear input after successful launch
    } catch (error) {
      showToast(`❌ ${error.message}`, "error", 5000);
    } finally {
      setPlayingVideo(false);
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

                <div className="video-url-input-section">
                  <h5>🎥 Play Video in External Player</h5>
                  <p className="input-hint">
                    Right-click video in Firefox → Copy Video URL → Paste below
                  </p>
                  <input
                    type="text"
                    className="video-url-input"
                    placeholder="https://example.com/video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    disabled={playingVideo}
                  />
                  <div className="player-buttons">
                    {externalPlayers.players.map((player, i) => (
                      <button
                        key={i}
                        className="btn-play-external"
                        onClick={() => playInExternalPlayer(player.command)}
                        disabled={playingVideo || !videoUrl.trim()}
                      >
                        {playingVideo ? "🔄 Launching..." : `▶️ Open in ${player.name}`}
                      </button>
                    ))}
                  </div>
                </div>
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

