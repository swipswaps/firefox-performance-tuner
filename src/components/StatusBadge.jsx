export default function StatusBadge({ isMonitoring, refreshInterval }) {
  return (
    <div
      className={`status-badge ${isMonitoring ? "status-badge-active" : "status-badge-paused"}`}
    >
      <span className={`status-dot ${isMonitoring ? "dot-pulse" : ""}`} />
      <span>{isMonitoring ? `Live · ${refreshInterval}s` : "Paused"}</span>
    </div>
  );
}
