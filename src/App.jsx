import { useState, useEffect, useCallback } from "react";
import {
  Tabs,
  Tab,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  AppBar,
  Toolbar as MuiToolbar,
  IconButton,
  Fade,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SettingsIcon from "@mui/icons-material/Settings";
import SystemInfo from "./components/SystemInfo";
import PreferencesPanel from "./components/PreferencesPanel";
import ProcessMonitor from "./components/ProcessMonitor";
import LogViewer from "./components/LogViewer";
import UserJsEditor from "./components/UserJsEditor";
import AutoFix from "./components/AutoFix";
import TelemetryBlocker from "./components/TelemetryBlocker";
import ToastContainer, { showToast } from "./components/Toast";
import StatusBadge from "./components/StatusBadge";
import CopyButton from "./components/CopyButton";
import ServerStatus from "./components/ServerStatus";
import { generatePreferenceScript } from "./utils/clipboard";
import "./App.css";

const TABS = [
  { id: "overview", label: "📊 Overview", icon: "📊" },
  { id: "prefs", label: "⚙️ Preferences", icon: "⚙️" },
  { id: "editor", label: "📝 Editor", icon: "📝" },
  { id: "monitor", label: "🔍 Monitor", icon: "🔍" },
];

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [systemInfo, setSystemInfo] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [prefCategories, setPrefCategories] = useState({});
  const [processes, setProcesses] = useState([]);
  const [logs, setLogs] = useState([]);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const [apiMode, setApiMode] = useState("checking"); // 'full' | 'demo' | 'disconnected' | 'checking'

  const fetchData = useCallback(async (url, setter, label) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      setter(data);
    } catch (error) {
      console.error(`Failed to fetch ${label}:`, error);
    }
  }, []);

  const checkApiMode = useCallback(async () => {
    // Detect if we're on GitHub Pages (static demo — no API)
    if (window.location.hostname.includes("github.io")) {
      setApiMode("demo");
      return "demo";
    }
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setApiMode(data.mode || "full");
        return data.mode || "full";
      }
      setApiMode("disconnected");
      return "disconnected";
    } catch {
      setApiMode("disconnected");
      return "disconnected";
    }
  }, []);

  const fetchAll = useCallback(async () => {
    const mode = await checkApiMode();
    if (mode === "full") {
      await Promise.all([
        fetchData("/api/system-info", setSystemInfo, "system info"),
        fetchData("/api/preferences", setPreferences, "preferences"),
        fetchData("/api/pref-categories", setPrefCategories, "categories"),
        fetchData("/api/processes", setProcesses, "processes"),
        fetchData("/api/logs", setLogs, "logs"),
      ]);
    }
    setLoading(false);
  }, [fetchData, checkApiMode]);

  const getCriticalPrefs = () => {
    const flat = {};
    for (const cat of Object.values(prefCategories)) {
      for (const [key, val] of Object.entries(cat)) {
        flat[key] = val.expected;
      }
    }
    return flat;
  };

  const applyPreferences = async () => {
    try {
      const response = await fetch("/api/apply-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: getCriticalPrefs() }),
      });
      const result = await response.json();
      showToast(result.message, "success");
      fetchData("/api/preferences", setPreferences, "preferences");
    } catch (_error) {
      showToast("Failed to apply preferences", "error");
    }
    setConfirmAction(null);
  };

  const runBenchmark = async () => {
    setBenchLoading(true);
    try {
      const response = await fetch("/api/benchmark");
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      setBenchmark(data);
      showToast(
        `Benchmark complete — score: ${data.score}/100`,
        data.score >= 70 ? "success" : "warning",
      );
    } catch (_error) {
      showToast("Benchmark failed", "error");
    }
    setBenchLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (isMonitoring) {
      const interval = setInterval(() => {
        fetchData("/api/system-info", setSystemInfo, "system info");
        fetchData("/api/preferences", setPreferences, "preferences");
        fetchData("/api/processes", setProcesses, "processes");
        fetchData("/api/logs", setLogs, "logs");
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [isMonitoring, refreshInterval, fetchData]);

  const prefIssueCount = Object.keys(getCriticalPrefs()).filter((key) => {
    const expected = getCriticalPrefs()[key];
    return preferences[key] !== expected;
  }).length;

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 2,
        }}
      >
        <CircularProgress size={60} thickness={4} />
        <Typography variant="body1" color="text.secondary">
          Loading Firefox Performance Tuner...
        </Typography>
      </Box>
    );
  }

  return (
    <div className="container">
      <ToastContainer />

      <Dialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            backgroundImage: "none",
          },
        }}
      >
        {confirmAction && (
          <>
            <DialogTitle>{confirmAction.title}</DialogTitle>
            <DialogContent>
              <DialogContentText>{confirmAction.message}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmAction(null)} color="inherit">
                Cancel
              </Button>
              <Button
                onClick={confirmAction.onConfirm}
                variant="contained"
                color="primary"
                autoFocus
              >
                {confirmAction.confirmLabel || "Confirm"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <header className="header">
        <div className="header-top">
          <h1>🦊 Firefox Performance Tuner</h1>
          <StatusBadge
            isMonitoring={isMonitoring}
            refreshInterval={refreshInterval}
          />
        </div>
        <p className="header-subtitle">
          Real-time monitoring and optimization for Firefox on X11 + Mesa
        </p>
      </header>

      <ServerStatus apiMode={apiMode} onRetry={checkApiMode} showToast={showToast} />

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "#252525",
        }}
      >
        {TABS.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {tab.label}
                {tab.id === "prefs" && prefIssueCount > 0 && (
                  <Chip label={prefIssueCount} color="error" size="small" />
                )}
              </Box>
            }
            sx={{
              textTransform: "none",
              fontSize: "0.95rem",
              fontWeight: 500,
            }}
          />
        ))}
      </Tabs>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: 1.5,
          bgcolor: "#252525",
          borderLeft: 1,
          borderRight: 1,
          borderColor: "#333",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant={isMonitoring ? "contained" : "outlined"}
            color={isMonitoring ? "success" : "primary"}
            startIcon={isMonitoring ? <PauseIcon /> : <PlayArrowIcon />}
            onClick={() => {
              setIsMonitoring(!isMonitoring);
              showToast(
                isMonitoring ? "Monitoring paused" : "Monitoring started",
                "info",
                2000,
              );
            }}
          >
            {isMonitoring ? "Pause" : "Monitor"}
          </Button>
          <select
            className="interval-select"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            style={{
              padding: "8px 12px",
              background: "#333",
              color: "#e0e0e0",
              border: "1px solid #555",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <option value={1}>1s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="contained"
            color="warning"
            startIcon={<SettingsIcon />}
            onClick={() =>
              setConfirmAction({
                title: "Apply All Optimized Preferences?",
                message:
                  "This will write all recommended values to user.js. A backup will be created. Firefox must be restarted to apply changes.",
                confirmLabel: "Apply",
                onConfirm: applyPreferences,
              })
            }
          >
            Apply All Preferences
          </Button>
          <IconButton color="primary" onClick={fetchAll} size="large">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <main className="tab-content">
        {activeTab === "overview" && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2.5,
              }}
            >
              <SystemInfo data={systemInfo} />
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Quick Status
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 1.5,
                      mt: 1.5,
                    }}
                  >
                    <Card
                      sx={{
                        textAlign: "center",
                        bgcolor:
                          prefIssueCount === 0
                            ? "rgba(74, 222, 128, 0.1)"
                            : "rgba(251, 191, 36, 0.1)",
                        borderColor:
                          prefIssueCount === 0 ? "success.main" : "warning.main",
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <CardContent>
                        <Typography
                          variant="h3"
                          sx={{
                            color:
                              prefIssueCount === 0
                                ? "success.main"
                                : "warning.main",
                          }}
                        >
                          {prefIssueCount}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Pref Issues
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card
                      sx={{
                        textAlign: "center",
                        bgcolor: "rgba(74, 158, 255, 0.1)",
                        borderColor: "primary.main",
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <CardContent>
                        <Typography variant="h3" color="primary.main">
                          {processes.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Processes
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card
                      sx={{
                        textAlign: "center",
                        bgcolor:
                          logs.length === 0
                            ? "rgba(74, 222, 128, 0.1)"
                            : "rgba(251, 191, 36, 0.1)",
                        borderColor:
                          logs.length === 0 ? "success.main" : "warning.main",
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <CardContent>
                        <Typography
                          variant="h3"
                          sx={{
                            color:
                              logs.length === 0
                                ? "success.main"
                                : "warning.main",
                          }}
                        >
                          {logs.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          GPU Delays
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>
                </CardContent>
              </Card>
            </Box>

            <AutoFix
              preferences={preferences}
              categories={prefCategories}
              showToast={showToast}
              onFixed={fetchAll}
            />

            <TelemetryBlocker />

            <div className="section" style={{ marginTop: "16px" }}>
              <div className="section-title">🧪 Performance Benchmark</div>
              <p
                style={{
                  color: "#888",
                  marginBottom: "12px",
                  fontSize: "0.9rem",
                }}
              >
                Detect your system capabilities and get tailored Firefox
                optimization recommendations.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn-apply"
                  onClick={runBenchmark}
                  disabled={benchLoading}
                >
                  {benchLoading ? "⏳ Running..." : "🚀 Run Benchmark"}
                </button>
                {Object.keys(prefCategories).length > 0 && (
                  <CopyButton
                    text={generatePreferenceScript(getCriticalPrefs())}
                    label="📦 Export Configuration"
                    showToast={showToast}
                  />
                )}
              </div>

              {benchmark && (
                <div className="bench-results">
                  <div
                    className="summary-cards"
                    style={{ marginBottom: "16px" }}
                  >
                    <div
                      className={`summary-card ${benchmark.score >= 70 ? "card-ok" : benchmark.score >= 40 ? "card-warn" : "card-error"}`}
                    >
                      <div className="card-number">{benchmark.score}</div>
                      <div className="card-label">Score / 100</div>
                    </div>
                    <div className="summary-card card-info">
                      <div className="card-number">
                        {benchmark.system?.cpuCores || "?"}
                      </div>
                      <div className="card-label">CPU Cores</div>
                    </div>
                    <div className="summary-card card-info">
                      <div className="card-number">
                        {benchmark.system?.ramGb || "?"}
                      </div>
                      <div className="card-label">RAM (GB)</div>
                    </div>
                  </div>

                  <div className="bench-hw">
                    <div className="metric">
                      <span className="metric-label">GPU Renderer</span>
                      <span className="metric-value">
                        {benchmark.gpu?.renderer}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">OpenGL</span>
                      <span className="metric-value">
                        {benchmark.gpu?.glVersion}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">GPU Device</span>
                      <span className="metric-value">
                        {benchmark.gpu?.device}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">VA-API</span>
                      <span className="metric-value">
                        {benchmark.gpu?.vaapi}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">CPU</span>
                      <span className="metric-value">
                        {benchmark.system?.cpuModel}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Software Render</span>
                      <span
                        className={`metric-value ${benchmark.gpu?.isSoftwareRenderer ? "val-high" : "status-ok"}`}
                      >
                        {benchmark.gpu?.isSoftwareRenderer ? "YES ⚠" : "No ✓"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: "16px" }}>
                    <h4 style={{ color: "#4a9eff", marginBottom: "8px" }}>
                      Recommendations
                    </h4>
                    {benchmark.recommendations?.map((rec, i) => (
                      <div
                        key={i}
                        className={`bench-rec bench-rec-${rec.severity}`}
                      >
                        <span className="bench-rec-icon">
                          {rec.severity === "critical"
                            ? "🔴"
                            : rec.severity === "warning"
                              ? "🟡"
                              : rec.severity === "ok"
                                ? "🟢"
                                : "ℹ️"}
                        </span>
                        <div>
                          <strong>{rec.title}</strong>
                          <p
                            style={{
                              color: "#aaa",
                              margin: "4px 0 0",
                              fontSize: "0.85rem",
                            }}
                          >
                            {rec.detail}
                          </p>
                          {rec.prefs?.length > 0 && (
                            <div className="bench-rec-prefs">
                              {rec.prefs.map((p, j) => (
                                <code key={j}>{p}</code>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "prefs" && (
          <PreferencesPanel
            preferences={preferences}
            categories={prefCategories}
            onApply={() =>
              setConfirmAction({
                title: "Apply All Optimized Preferences?",
                message:
                  "This will write all recommended values to user.js. A backup will be created. Firefox must be restarted to apply changes.",
                confirmLabel: "Apply",
                onConfirm: applyPreferences,
              })
            }
          />
        )}

        {activeTab === "editor" && (
          <UserJsEditor
            showToast={showToast}
            systemInfo={systemInfo}
            apiMode={apiMode}
          />
        )}

        {activeTab === "monitor" && (
          <>
            <ProcessMonitor processes={processes} />
            <LogViewer logs={logs} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
