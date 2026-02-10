import { useState, useCallback } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./ServerStatus.css";

const REPO_URL = "https://github.com/swipswaps/firefox-performance-tuner";
const REPO_RAW =
  "https://raw.githubusercontent.com/swipswaps/firefox-performance-tuner/main/scripts/setup.sh";

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

function getOneLiner(platform) {
  if (platform === "windows") {
    return `git clone ${REPO_URL}.git; cd firefox-performance-tuner; npm install; npm start`;
  }
  return `git clone ${REPO_URL}.git && cd firefox-performance-tuner && npm install && npm start`;
}

function getManualSteps(platform, isGitHubPages) {
  if (isGitHubPages) {
    const common = [
      `git clone ${REPO_URL}.git`,
      "cd firefox-performance-tuner",
      "npm install",
      "npm start",
      "Open http://localhost:3000 in your browser",
    ];
    if (platform === "windows") {
      return {
        platform: "Windows",
        steps: [
          "Install Node.js 18+ from nodejs.org",
          "Install Git from git-scm.com",
          "Open PowerShell and run:",
          ...common,
        ],
      };
    }
    if (platform === "macos") {
      return {
        platform: "macOS",
        steps: [
          "Install Node.js 18+: brew install node (or download from nodejs.org)",
          "Open Terminal and run:",
          ...common,
        ],
      };
    }
    return {
      platform: "Linux",
      steps: [
        "Install Node.js 18+: sudo dnf install nodejs (Fedora) or sudo apt install nodejs npm (Debian/Ubuntu)",
        "Open terminal and run:",
        ...common,
      ],
    };
  }
  // Localhost — already have the repo
  return {
    platform: platform === "windows" ? "Windows" : platform === "macos" ? "macOS" : "Linux",
    steps: [
      "Open a terminal in the project folder",
      "npm install (if not done already)",
      "npm start",
      "Refresh this page",
    ],
  };
}

export default function ServerStatus({ apiMode, onRetry, showToast }) {
  const [expanded, setExpanded] = useState(true);
  const [checking, setChecking] = useState(false);

  const platform = getPlatform();
  const isGitHubPages = window.location.hostname.includes("github.io");
  const oneLiner = getOneLiner(platform);
  const instructions = getManualSteps(platform, isGitHubPages);

  const handleRetry = useCallback(async () => {
    setChecking(true);
    await onRetry?.();
    setChecking(false);
  }, [onRetry]);

  const handleCopy = useCallback(
    async (e) => {
      e.stopPropagation();
      await copyToClipboard(oneLiner, showToast);
    },
    [oneLiner, showToast],
  );

  if (apiMode === "checking") return null;
  if (apiMode === "full") return null;

  return (
    <div className={`server-status server-status-${apiMode}`}>
      <div className="server-status-header" onClick={() => setExpanded(!expanded)}>
        <span className="server-status-icon">{apiMode === "demo" ? "📺" : "⚠️"}</span>
        <span className="server-status-text">
          {apiMode === "demo"
            ? "Demo Mode — Run locally for full features"
            : "Backend Not Connected"}
        </span>
        <span className="server-status-expand">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="server-status-details">
          {isGitHubPages && (
            <div className="server-status-notice">
              <p>
                <strong>🌐 You&apos;re viewing this on GitHub Pages</strong>
              </p>
              <p>
                This is a <em>frontend-only</em> demo. To apply Firefox optimizations, run the app
                locally on your Linux machine.
              </p>
            </div>
          )}

          {!isGitHubPages && apiMode === "disconnected" && (
            <p className="server-status-error">
              Cannot connect to backend on port 3001. Start the server to enable all features.
            </p>
          )}

          <div className="server-status-quick">
            <h4>🎯 Quick Setup (one command)</h4>
            <p>
              Open {platform === "windows" ? "PowerShell" : "Terminal"} and paste:
            </p>
            <div className="server-status-oneliner">
              <code>{oneLiner}</code>
              <button className="server-status-copy" onClick={handleCopy} title="Copy to clipboard">
                📋
              </button>
            </div>
            <p className="server-status-script-info">
              This will: clone repo → install dependencies → start backend + frontend
            </p>
          </div>

          <details className="server-status-manual">
            <summary>📝 Or follow manual steps ({instructions.platform})</summary>
            <ol>
              {instructions.steps.map((step, i) => (
                <li key={i}>
                  {step.includes("git") || step.includes("npm") || step.includes("curl") || step.includes("dnf") || step.includes("apt") || step.includes("brew") ? (
                    <code>{step}</code>
                  ) : (
                    step
                  )}
                </li>
              ))}
            </ol>
          </details>

          <div className="server-status-actions">
            {!isGitHubPages && (
              <button
                className="server-status-retry"
                onClick={handleRetry}
                disabled={checking}
              >
                {checking ? "🔄 Checking..." : "🔁 Test Connection"}
              </button>
            )}
            <a href={REPO_RAW} download className="server-status-download">
              📥 Download Setup Script
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="server-status-github">
              📚 GitHub Repository
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

