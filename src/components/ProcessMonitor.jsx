import { useMemo, useState, useCallback, useEffect } from "react";

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
  const [browserMemory, setBrowserMemory] = useState(null);

  // Get real browser memory data from Performance API
  useEffect(() => {
    const updateMemory = () => {
      if (performance.memory) {
        setBrowserMemory({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Group processes by classification
  const grouped = useMemo(() => {
    const groups = {
      main: [],
      "active-content": [],
      "idle-content": [],
      system: [],
    };

    (processes || []).forEach((p) => {
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
  }, [processes, sortKey, sortDir]);

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
    // Demo mode: Show browser's own memory usage from Performance API
    return (
      <div className="section">
        <div className="section-title">🔍 Firefox Processes (Demo Mode)</div>

        {browserMemory && (
          <div className="info-box" style={{ marginBottom: "16px" }}>
            <p style={{ margin: "0 0 8px 0" }}>
              <strong>📊 Current Tab Memory (Performance API):</strong>
            </p>
            <div className="proc-summary">
              <span className="proc-stat">
                JS Heap Used: <strong>{fmtBytes(browserMemory.usedJSHeapSize)}</strong>
              </span>
              <span className="proc-stat">
                JS Heap Total: <strong>{fmtBytes(browserMemory.totalJSHeapSize)}</strong>
              </span>
              <span className="proc-stat">
                JS Heap Limit: <strong>{fmtBytes(browserMemory.jsHeapSizeLimit)}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="info-box">
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>ℹ️ Demo Mode Limitations:</strong>
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            This GitHub Pages deployment cannot access Firefox process data (requires backend server).
            The Performance API above shows <strong>real memory usage</strong> for this tab only.
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>To see full Firefox process monitoring:</strong>
          </p>
          <ol style={{ margin: "0 0 8px 0", paddingLeft: "20px" }}>
            <li>Clone the repo: <code>git clone https://github.com/swipswaps/firefox-performance-tuner.git</code></li>
            <li>Install: <code>npm install</code></li>
            <li>Run: <code>npm start</code></li>
          </ol>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Or use Firefox's built-in tools:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            <li>Task Manager: Press <kbd>Shift+Esc</kbd> to see all processes with tab URLs</li>
            <li>about:processes: Type <code>about:processes</code> in address bar for detailed process view</li>
            <li>about:memory: Type <code>about:memory</code> for memory breakdown</li>
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
      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    textAlign: col.align,
                    cursor: "pointer",
                    userSelect: "none",
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
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Main Process Group */}
            {grouped.main.length > 0 && (
              <>
                <tr className="proc-group-header">
                  <td colSpan={7} style={{ fontWeight: "bold", background: "#f0f0f0", padding: "8px" }}>
                    🦊 Main Process ({grouped.main.length})
                  </td>
                </tr>
                {grouped.main.map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <tr
                      key={p.pid}
                      className={`proc-row ${isExpanded ? "proc-row-expanded" : ""}`}
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="proc-pid" style={{ width: "72px" }}>{p.pid}</td>
                      <td className="proc-type" style={{ width: "90px" }}>{TYPE_LABELS[p.type] || p.type}</td>
                      <td className={`proc-num ${p.cpu > 20 ? "val-high" : p.cpu > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.cpu.toFixed(1)}
                        <div className="proc-bar" style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                      </td>
                      <td className={`proc-num ${p.mem > 10 ? "val-high" : p.mem > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.mem.toFixed(1)}
                      </td>
                      <td className="proc-num" style={{ width: "80px" }}>{Math.round(p.rss / 1024)} MB</td>
                      <td className="proc-num" style={{ width: "72px" }}>{p.threads || "—"}</td>
                      <td className="proc-num" style={{ width: "80px" }}>{fmtUptime(p.uptimeSec || 0)}</td>
                    </tr>
                  );
                })}
              </>
            )}

            {/* Active Content Processes Group */}
            {grouped["active-content"].length > 0 && (
              <>
                <tr className="proc-group-header">
                  <td colSpan={7} style={{ fontWeight: "bold", background: "#e8f5e9", padding: "8px" }}>
                    📄 Active Content Processes ({grouped["active-content"].length})
                  </td>
                </tr>
                {grouped["active-content"].map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <tr
                      key={p.pid}
                      className={`proc-row ${isExpanded ? "proc-row-expanded" : ""}`}
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="proc-pid" style={{ width: "72px" }}>{p.pid}</td>
                      <td className="proc-type" style={{ width: "90px" }}>{TYPE_LABELS[p.type] || p.type}</td>
                      <td className={`proc-num ${p.cpu > 20 ? "val-high" : p.cpu > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.cpu.toFixed(1)}
                        <div className="proc-bar" style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                      </td>
                      <td className={`proc-num ${p.mem > 10 ? "val-high" : p.mem > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.mem.toFixed(1)}
                      </td>
                      <td className="proc-num" style={{ width: "80px" }}>{Math.round(p.rss / 1024)} MB</td>
                      <td className="proc-num" style={{ width: "72px" }}>{p.threads || "—"}</td>
                      <td className="proc-num" style={{ width: "80px" }}>{fmtUptime(p.uptimeSec || 0)}</td>
                    </tr>
                  );
                })}
              </>
            )}

            {/* Idle Content Processes Group */}
            {grouped["idle-content"].length > 0 && (
              <>
                <tr className="proc-group-header">
                  <td colSpan={7} style={{ fontWeight: "bold", background: "#fff3e0", padding: "8px" }}>
                    💤 Idle Content Processes ({grouped["idle-content"].length}) - Preloaded or Suspended
                  </td>
                </tr>
                {grouped["idle-content"].map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <tr
                      key={p.pid}
                      className={`proc-row ${isExpanded ? "proc-row-expanded" : ""}`}
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="proc-pid" style={{ width: "72px" }}>{p.pid}</td>
                      <td className="proc-type" style={{ width: "90px" }}>{TYPE_LABELS[p.type] || p.type}</td>
                      <td className={`proc-num ${p.cpu > 20 ? "val-high" : p.cpu > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.cpu.toFixed(1)}
                        <div className="proc-bar" style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                      </td>
                      <td className={`proc-num ${p.mem > 10 ? "val-high" : p.mem > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.mem.toFixed(1)}
                      </td>
                      <td className="proc-num" style={{ width: "80px" }}>{Math.round(p.rss / 1024)} MB</td>
                      <td className="proc-num" style={{ width: "72px" }}>{p.threads || "—"}</td>
                      <td className="proc-num" style={{ width: "80px" }}>{fmtUptime(p.uptimeSec || 0)}</td>
                    </tr>
                  );
                })}
              </>
            )}

            {/* System Processes Group */}
            {grouped.system.length > 0 && (
              <>
                <tr className="proc-group-header">
                  <td colSpan={7} style={{ fontWeight: "bold", background: "#e3f2fd", padding: "8px" }}>
                    🔧 System Processes ({grouped.system.length})
                  </td>
                </tr>
                {grouped.system.map((p) => {
                  const isExpanded = expandedPid === p.pid;
                  return (
                    <tr
                      key={p.pid}
                      className={`proc-row ${isExpanded ? "proc-row-expanded" : ""}`}
                      onClick={() => setExpandedPid(isExpanded ? null : p.pid)}
                      title={TYPE_TOOLTIPS[p.type] || "Click for details"}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="proc-pid" style={{ width: "72px" }}>{p.pid}</td>
                      <td className="proc-type" style={{ width: "90px" }}>{TYPE_LABELS[p.type] || p.type}</td>
                      <td className={`proc-num ${p.cpu > 20 ? "val-high" : p.cpu > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.cpu.toFixed(1)}
                        <div className="proc-bar" style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                      </td>
                      <td className={`proc-num ${p.mem > 10 ? "val-high" : p.mem > 5 ? "val-med" : ""}`} style={{ width: "80px" }}>
                        {p.mem.toFixed(1)}
                      </td>
                      <td className="proc-num" style={{ width: "80px" }}>{Math.round(p.rss / 1024)} MB</td>
                      <td className="proc-num" style={{ width: "72px" }}>{p.threads || "—"}</td>
                      <td className="proc-num" style={{ width: "80px" }}>{fmtUptime(p.uptimeSec || 0)}</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
      {expandedPid && sorted.find((p) => p.pid === expandedPid) && (
        <DetailPanel p={sorted.find((p) => p.pid === expandedPid)} />
      )}
    </div>
  );
}
