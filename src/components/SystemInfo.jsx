export default function SystemInfo({ data }) {
  if (!data) {
    return (
      <div className="section">
        <div className="section-title">System Graphics Info</div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="section-title">System Graphics Info</div>
      <div className="metric">
        <span className="metric-label">Display:</span>
        <span className="metric-value">{data.display || '<not set>'}</span>
      </div>
      <div className="metric">
        <span className="metric-label">Session:</span>
        <span className="metric-value">{data.session || '<not set>'}</span>
      </div>
      <div className="metric">
        <span className="metric-label">OpenGL Renderer:</span>
        <span className="metric-value">{data.renderer || '<not available>'}</span>
      </div>
      <div className="metric">
        <span className="metric-label">OpenGL Version:</span>
        <span className="metric-value">{data.version || '<not available>'}</span>
      </div>
      <div className="metric">
        <span className="metric-label">VA-API:</span>
        <span className="metric-value">{data.vaapi || '<not available>'}</span>
      </div>
    </div>
  )
}

