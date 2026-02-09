import { useMemo } from 'react'

const TYPE_LABELS = {
  main: '🦊 Main',
  tab: '📄 Tab',
  socket: '🔌 Socket',
  rdd: '🎬 RDD',
  utility: '🔧 Utility',
  forkserver: '🔀 Fork',
  crashhelper: '🛟 Crash',
  content: '📦 Content',
}

export default function ProcessMonitor({ processes }) {
  const sorted = useMemo(() => {
    return (processes || []).slice().sort((a, b) => b.cpu - a.cpu)
  }, [processes])

  const totalCpu = sorted.reduce((s, p) => s + p.cpu, 0).toFixed(1)
  const totalRss = Math.round(sorted.reduce((s, p) => s + p.rss, 0) / 1024)

  if (sorted.length === 0) {
    return (
      <div className="section">
        <div className="section-title">🔍 Firefox Processes</div>
        <p style={{ color: '#888' }}>Firefox not running</p>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="section-title">🔍 Firefox Processes</div>
      <div className="proc-summary">
        <span className="proc-stat">{sorted.length} processes</span>
        <span className="proc-stat">CPU: <strong className={totalCpu > 50 ? 'val-high' : ''}>{totalCpu}%</strong></span>
        <span className="proc-stat">RAM: <strong>{totalRss} MB</strong></span>
      </div>
      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead>
            <tr>
              <th style={{width:'70px'}}>PID</th>
              <th style={{width:'80px'}}>Type</th>
              <th style={{width:'80px'}}>CPU %</th>
              <th style={{width:'80px'}}>MEM %</th>
              <th style={{width:'80px'}}>RSS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.pid}>
                <td className="proc-pid">{p.pid}</td>
                <td className="proc-type">{TYPE_LABELS[p.type] || p.type}</td>
                <td className={`proc-num ${p.cpu > 20 ? 'val-high' : p.cpu > 5 ? 'val-med' : ''}`}>
                  {p.cpu.toFixed(1)}
                  <div className="proc-bar" style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                </td>
                <td className={`proc-num ${p.mem > 10 ? 'val-high' : p.mem > 5 ? 'val-med' : ''}`}>
                  {p.mem.toFixed(1)}
                </td>
                <td className="proc-num">{Math.round(p.rss / 1024)} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

