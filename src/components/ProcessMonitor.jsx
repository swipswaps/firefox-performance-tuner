import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
} from "@mui/material";

const TYPE_LABELS = {
  main: "🦊 Main",
  "active-tab": "📄 Active Tab",
  "idle-tab": "💤 Idle Content",
  tab: "📄 Tab",
  socket: "🔌 Socket",
  rdd: "🎬 RDD",
  utility: "🔧 Utility",
  forkserver: "🔀 Fork",
  crashhelper: "🛟 Crash",
  content: "📦 Content",
};

const TYPE_TOOLTIPS = {
  main: "Main browser process (UI and chrome)",
  "active-tab": "Active content process (rendering visible tab or high CPU activity)",
  "idle-tab": "Idle content process (preloaded for performance or suspended tab)",
  socket: "Network socket process",
  rdd: "Remote Data Decoder (media decoding)",
  utility: "Utility process (various background tasks)",
  forkserver: "Fork server (process spawning)",
  crashhelper: "Crash reporter process",
};

const STATE_LABELS = {
  S: "Sleeping",
  R: "Running",
  D: "Disk Wait",
  Z: "Zombie",
  T: "Stopped",
  t: "Traced",
  X: "Dead",
};

function fmtBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function fmtUptime(sec) {
  if (sec >= 86400)
    return (
      Math.floor(sec / 86400) + "d " + Math.floor((sec % 86400) / 3600) + "h"
    );
  if (sec >= 3600)
    return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m";
  if (sec >= 60) return Math.floor(sec / 60) + "m " + (sec % 60) + "s";
  return sec + "s";
}

const COLUMNS = [
  { key: "pid", label: "PID", width: "72px", align: "left" },
  { key: "type", label: "Type", width: "90px", align: "left" },
  { key: "cpu", label: "CPU %", width: "80px", align: "right" },
  { key: "mem", label: "MEM %", width: "80px", align: "right" },
  { key: "rss", label: "RSS", width: "80px", align: "right" },
  { key: "threads", label: "Threads", width: "72px", align: "right" },
  { key: "uptimeSec", label: "Uptime", width: "80px", align: "right" },
];

function SortArrow({ column, sortKey, sortDir }) {
  if (column !== sortKey)
    return <span className="sort-arrow sort-inactive">⇅</span>;
  return <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>;
}

function DetailPanel({ p }) {
  const d = p.detail || {};
  const stateChar = (p.stat || "")[0] || "?";
  const stateLabel = STATE_LABELS[stateChar] || stateChar;

  return (
    <div className="proc-detail">
      <div className="proc-detail-grid">
        <div className="detail-section">
          <h4>⚙️ Process</h4>
          <dl>
            <dt>PID</dt>
            <dd>{p.pid}</dd>
            <dt>Type</dt>
            <dd>{TYPE_LABELS[p.type] || p.type}</dd>
            <dt>State</dt>
            <dd>
              {stateLabel} ({p.stat})
            </dd>
            <dt>Threads</dt>
            <dd>{p.threads}</dd>
            <dt>Uptime</dt>
            <dd>{fmtUptime(p.uptimeSec)}</dd>
            <dt>OOM Score</dt>
            <dd
              className={
                d.oomScore > 500
                  ? "val-high"
                  : d.oomScore > 200
                    ? "val-med"
                    : ""
              }
            >
              {d.oomScore}
            </dd>
            <dt>FDs Open</dt>
            <dd>{d.fdCount}</dd>
          </dl>
        </div>
        <div className="detail-section">
          <h4>🧠 Memory</h4>
          <dl>
            <dt>RSS</dt>
            <dd>{fmtBytes(p.rss * 1024)}</dd>
            <dt>PSS</dt>
            <dd>{fmtBytes((d.pssKb || 0) * 1024)}</dd>
            <dt>VM Size</dt>
            <dd>{fmtBytes((d.vmSizeKb || 0) * 1024)}</dd>
            <dt>VM Peak</dt>
            <dd>{fmtBytes((d.vmPeakKb || 0) * 1024)}</dd>
            <dt>Shared Clean</dt>
            <dd>{fmtBytes((d.sharedCleanKb || 0) * 1024)}</dd>
            <dt>Private Clean</dt>
            <dd>{fmtBytes((d.privateCleanKb || 0) * 1024)}</dd>
            <dt>Private Dirty</dt>
            <dd>{fmtBytes((d.privateDirtyKb || 0) * 1024)}</dd>
          </dl>
        </div>
        <div className="detail-section">
          <h4>💾 I/O</h4>
          <dl>
            <dt>Read</dt>
            <dd>{fmtBytes(d.ioReadBytes || 0)}</dd>
            <dt>Written</dt>
            <dd>{fmtBytes(d.ioWriteBytes || 0)}</dd>
            <dt>Read Syscalls</dt>
            <dd>{(d.ioSyscallsR || 0).toLocaleString()}</dd>
            <dt>Write Syscalls</dt>
            <dd>{(d.ioSyscallsW || 0).toLocaleString()}</dd>
          </dl>
        </div>
        <div className="detail-section">
          <h4>📊 Scheduling</h4>
          <dl>
            <dt>Vol. Ctx Switches</dt>
            <dd>{(d.voluntaryCtxSwitches || 0).toLocaleString()}</dd>
            <dt>Invol. Ctx Switches</dt>
            <dd>{(d.nonvoluntaryCtxSwitches || 0).toLocaleString()}</dd>
            <dt>Cgroup</dt>
            <dd className="detail-mono">{d.cgroup || "—"}</dd>
          </dl>
        </div>
      </div>
      {d.envVars && d.envVars.length > 0 && (
        <div className="detail-section detail-env">
          <h4>🌐 Environment</h4>
          <div className="env-list">
            {d.envVars.map((v, i) => (
              <code key={i}>{v}</code>
            ))}
          </div>
        </div>
      )}
      <div className="detail-section detail-cmd">
        <h4>🖥️ Command</h4>
        <code className="detail-mono">{p.args}</code>
      </div>
    </div>
  );
}

export default function ProcessMonitor({ processes }) {
  const [sortKey, setSortKey] = useState("cpu");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedPid, setExpandedPid] = useState(null);
  const [extensionProcesses, setExtensionProcesses] = useState(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  // Check if Firefox extension bridge is available and fetch process data
  useEffect(() => {
    const checkBridge = () => {
      if (window.firefoxProcessBridge?.isAvailable()) {
        setBridgeAvailable(true);
        fetchProcessData();
      }
    };

    const fetchProcessData = async () => {
      if (window.firefoxProcessBridge) {
        const data = await window.firefoxProcessBridge.getProcesses();
        setExtensionProcesses(data);
      }
    };

    // Listen for bridge ready event
    window.addEventListener('firefoxProcessBridgeReady', checkBridge);

    // Check immediately in case bridge already loaded
    checkBridge();

    // Poll for process data every 2 seconds if bridge available
    const interval = setInterval(() => {
      if (bridgeAvailable) {
        fetchProcessData();
      }
    }, 2000);

    return () => {
      window.removeEventListener('firefoxProcessBridgeReady', checkBridge);
      clearInterval(interval);
    };
  }, [bridgeAvailable]);

  const handleSort = useCallback(
    (key) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "type" || key === "pid" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  // Use extension processes if available, otherwise use backend processes
  const activeProcesses = extensionProcesses || processes || [];

  // Group processes by classification
  const grouped = useMemo(() => {
    const groups = {
      main: [],
      "active-content": [],
      "idle-content": [],
      system: [],
    };

    activeProcesses.forEach((p) => {
      const classification = p.classification || "system";
      if (groups[classification]) {
        groups[classification].push(p);
      } else {
        groups.system.push(p);
      }
    });

    // Sort each group
    const dir = sortDir === "asc" ? 1 : -1;
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        let av = a[sortKey],
          bv = b[sortKey];
        if (sortKey === "type") {
          av = TYPE_LABELS[av] || av;
          bv = TYPE_LABELS[bv] || bv;
          return dir * av.localeCompare(bv);
        }
        if (typeof av === "number" && typeof bv === "number")
          return dir * (av - bv);
        return dir * String(av).localeCompare(String(bv));
      });
    });

    return groups;
  }, [activeProcesses, sortKey, sortDir]);

  // Flatten for totals
  const sorted = useMemo(() => {
    return [
      ...grouped.main,
      ...grouped["active-content"],
      ...grouped["idle-content"],
      ...grouped.system,
    ];
  }, [grouped]);

  const totalCpu = sorted.reduce((s, p) => s + p.cpu, 0).toFixed(1);
  const totalRss = Math.round(sorted.reduce((s, p) => s + p.rss, 0) / 1024);
  const totalThreads = sorted.reduce((s, p) => s + (p.threads || 0), 0);

  if (sorted.length === 0) {
    return (
      <div className="section">
        <div className="section-title">🔍 Firefox Processes</div>

        <div className="info-box">
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>📦 Install Browser Extension for Live Process Data:</strong>
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            To see Firefox process data on GitHub Pages, install the companion extension:
          </p>
          <ol style={{ margin: "0 0 8px 0", paddingLeft: "20px" }}>
            <li>Download: <a href="https://github.com/swipswaps/firefox-performance-tuner/raw/master/extension.xpi" target="_blank" rel="noopener">extension.xpi</a></li>
            <li>Open Firefox: <code>about:addons</code></li>
            <li>Click gear icon → "Install Add-on From File"</li>
            <li>Select downloaded <code>extension.xpi</code></li>
            <li>Refresh this page</li>
          </ol>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Or run locally for full features:</strong>
          </p>
          <ol style={{ margin: "0 0 8px 0", paddingLeft: "20px" }}>
            <li><code>git clone https://github.com/swipswaps/firefox-performance-tuner.git</code></li>
            <li><code>cd firefox-performance-tuner && npm install</code></li>
            <li><code>npm start</code></li>
          </ol>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Or use Firefox's built-in tools:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            <li>Task Manager: <kbd>Shift+Esc</kbd></li>
            <li>Process List: <code>about:processes</code></li>
            <li>Memory Details: <code>about:memory</code></li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-title">🔍 Firefox Processes</div>

      {/* Info box explaining Firefox's multi-process architecture */}
      <div className="info-box" style={{ marginBottom: "16px", fontSize: "0.9em" }}>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>ℹ️ About Firefox Processes:</strong>
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          Firefox uses a <strong>multi-process architecture</strong> (E10S/Fission) for security and performance.
          Not all content processes correspond to visible tabs:
        </p>
        <ul style={{ margin: "0 0 8px 0", paddingLeft: "20px" }}>
          <li><strong>Active Content:</strong> Rendering visible tabs or high CPU activity</li>
          <li><strong>Idle Content:</strong> Preloaded processes (ready for new tabs) or suspended tabs (hibernated to save memory)</li>
          <li><strong>System Processes:</strong> GPU, media decoding, networking, utilities</li>
        </ul>
        <p style={{ margin: 0, fontSize: "0.85em", color: "#888" }}>
          💡 Tip: Use Firefox's built-in Task Manager (<kbd>Shift+Esc</kbd>) to see tab-to-process mapping with URLs.
        </p>
      </div>

      <div className="proc-summary">
        <span className="proc-stat">{sorted.length} processes</span>
        <span className="proc-stat">
          CPU:{" "}
          <strong className={totalCpu > 50 ? "val-high" : ""}>
            {totalCpu}%
          </strong>
        </span>
        <span className="proc-stat">
          RAM: <strong>{totalRss} MB</strong>
        </span>
        <span className="proc-stat">
          Threads: <strong>{totalThreads}</strong>
        </span>
      </div>
      <TableContainer component={Paper} sx={{ maxHeight: 600, mt: 2 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableCell
                  key={col.key}
                  align={col.align || "left"}
                  sx={{
                    width: col.width,
                    cursor: "pointer",
                    fontWeight: "bold",
                    userSelect: "text",
                  }}
                  onClick={() => handleSort(col.key)}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}{" "}
                  <SortArrow
                    column={col.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Main Process Group */}
            {grouped.main.length > 0 && (
              <>
                <TableRow>
                  <TableCell colSpan={7} sx={{ fontWeight: "bold", bgcolor: "#2a2a2a", color: "#e0e0e0", py: 1 }}>
                    🦊 Main Process ({grouped.main.length})
                  </TableCell>
                </TableRow>
                {grouped.main.map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <TableRow
                      key={p.pid}
                      hover
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      sx={{ cursor: "pointer", bgcolor: isExpanded ? "action.selected" : "inherit" }}
                    >
                      <TableCell>{p.pid}</TableCell>
                      <TableCell>{TYPE_LABELS[p.type] || p.type}</TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.cpu > 20 ? "error.main" : p.cpu > 5 ? "warning.main" : "inherit" }}>
                          {p.cpu.toFixed(1)}
                        </Box>
                        <Box sx={{ width: `${Math.min(p.cpu, 100)}%`, height: 4, bgcolor: "primary.main", mt: 0.5, borderRadius: 1 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.mem > 10 ? "error.main" : p.mem > 5 ? "warning.main" : "inherit" }}>
                          {p.mem.toFixed(1)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{Math.round(p.rss / 1024)} MB</TableCell>
                      <TableCell align="right">{p.threads || "—"}</TableCell>
                      <TableCell align="right">{fmtUptime(p.uptimeSec || 0)}</TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}

            {/* Active Content Processes Group */}
            {grouped["active-content"].length > 0 && (
              <>
                <TableRow>
                  <TableCell colSpan={7} sx={{ fontWeight: "bold", bgcolor: "#1a3a1a", color: "#90ee90", py: 1 }}>
                    📄 Active Content Processes ({grouped["active-content"].length})
                  </TableCell>
                </TableRow>
                {grouped["active-content"].map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <TableRow
                      key={p.pid}
                      hover
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      sx={{ cursor: "pointer", bgcolor: isExpanded ? "action.selected" : "inherit" }}
                    >
                      <TableCell>{p.pid}</TableCell>
                      <TableCell>{TYPE_LABELS[p.type] || p.type}</TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.cpu > 20 ? "error.main" : p.cpu > 5 ? "warning.main" : "inherit" }}>
                          {p.cpu.toFixed(1)}
                        </Box>
                        <Box sx={{ width: `${Math.min(p.cpu, 100)}%`, height: 4, bgcolor: "primary.main", mt: 0.5, borderRadius: 1 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.mem > 10 ? "error.main" : p.mem > 5 ? "warning.main" : "inherit" }}>
                          {p.mem.toFixed(1)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{Math.round(p.rss / 1024)} MB</TableCell>
                      <TableCell align="right">{p.threads || "—"}</TableCell>
                      <TableCell align="right">{fmtUptime(p.uptimeSec || 0)}</TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}

            {/* Idle Content Processes Group */}
            {grouped["idle-content"].length > 0 && (
              <>
                <TableRow>
                  <TableCell colSpan={7} sx={{ fontWeight: "bold", bgcolor: "#3a2a1a", color: "#ffcc80", py: 1 }}>
                    💤 Idle Content Processes ({grouped["idle-content"].length}) - Preloaded or Suspended
                  </TableCell>
                </TableRow>
                {grouped["idle-content"].map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <TableRow
                      key={p.pid}
                      hover
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      sx={{ cursor: "pointer", bgcolor: isExpanded ? "action.selected" : "inherit" }}
                    >
                      <TableCell>{p.pid}</TableCell>
                      <TableCell>{TYPE_LABELS[p.type] || p.type}</TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.cpu > 20 ? "error.main" : p.cpu > 5 ? "warning.main" : "inherit" }}>
                          {p.cpu.toFixed(1)}
                        </Box>
                        <Box sx={{ width: `${Math.min(p.cpu, 100)}%`, height: 4, bgcolor: "primary.main", mt: 0.5, borderRadius: 1 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.mem > 10 ? "error.main" : p.mem > 5 ? "warning.main" : "inherit" }}>
                          {p.mem.toFixed(1)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{Math.round(p.rss / 1024)} MB</TableCell>
                      <TableCell align="right">{p.threads || "—"}</TableCell>
                      <TableCell align="right">{fmtUptime(p.uptimeSec || 0)}</TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}

            {/* System Processes Group */}
            {grouped.system.length > 0 && (
              <>
                <TableRow>
                  <TableCell colSpan={7} sx={{ fontWeight: "bold", bgcolor: "#1a2a3a", color: "#90caf9", py: 1 }}>
                    🔧 System Processes ({grouped.system.length})
                  </TableCell>
                </TableRow>
                {grouped.system.map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <TableRow
                      key={p.pid}
                      hover
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      sx={{ cursor: "pointer", bgcolor: isExpanded ? "action.selected" : "inherit" }}
                    >
                      <TableCell>{p.pid}</TableCell>
                      <TableCell>{TYPE_LABELS[p.type] || p.type}</TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.cpu > 20 ? "error.main" : p.cpu > 5 ? "warning.main" : "inherit" }}>
                          {p.cpu.toFixed(1)}
                        </Box>
                        <Box sx={{ width: `${Math.min(p.cpu, 100)}%`, height: 4, bgcolor: "primary.main", mt: 0.5, borderRadius: 1 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ color: p.mem > 10 ? "error.main" : p.mem > 5 ? "warning.main" : "inherit" }}>
                          {p.mem.toFixed(1)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{Math.round(p.rss / 1024)} MB</TableCell>
                      <TableCell align="right">{p.threads || "—"}</TableCell>
                      <TableCell align="right">{fmtUptime(p.uptimeSec || 0)}</TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {expandedPid && sorted.find((p) => p.pid === expandedPid) && (
        <DetailPanel p={sorted.find((p) => p.pid === expandedPid)} />
      )}
    </div>
  );
}
