import { useState, useEffect } from "react";
import "./TelemetryBlocker.css";

export default function TelemetryBlocker() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:3001/api/telemetry/status");
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch telemetry status:", error);
    } finally {
      setLoading(false);
    }
  };

  const blockDNS = async () => {
    if (!confirm("This will modify /etc/hosts and requires sudo password. Continue?")) {
      return;
    }

    try {
      setProcessing(true);
      setResult(null);
      const res = await fetch("http://localhost:3001/api/telemetry/block-dns", {
        method: "POST",
      });
      const data = await res.json();
      setResult(data);
      await fetchStatus(); // Refresh status
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const installPolicy = async () => {
    if (!confirm("This will create /etc/firefox/policies/policies.json and requires sudo password. Continue?")) {
      return;
    }

    try {
      setProcessing(true);
      setResult(null);
      const res = await fetch("http://localhost:3001/api/telemetry/install-policy", {
        method: "POST",
      });
      const data = await res.json();
      setResult(data);
      await fetchStatus(); // Refresh status
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="telemetry-blocker">
        <h2>🛡️ Telemetry Blocking</h2>
        <p className="loading">Loading status...</p>
      </div>
    );
  }

  return (
    <div className="telemetry-blocker">
      <h2>🛡️ Telemetry Blocking</h2>
      
      <div className="info-box">
        <p><strong>Note:</strong> Fedora already disables telemetry by redirecting it to dummy URLs. These options provide additional security layers.</p>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <h3>DNS-Level Blocking</h3>
          <div className={`status-badge ${status?.dnsBlocking ? "active" : "inactive"}`}>
            {status?.dnsBlocking ? "✅ ACTIVE" : "❌ INACTIVE"}
          </div>
          {status?.dnsBlocking && (
            <div className="status-details">
              <p>Blocked domains: {status.dnsBlockedDomains.length}</p>
              <p>Verification: {status.verification.dnsTest || "N/A"}</p>
            </div>
          )}
          <button 
            onClick={blockDNS} 
            disabled={processing || status?.dnsBlocking}
            className="action-button"
          >
            {status?.dnsBlocking ? "Already Enabled" : "Enable DNS Blocking"}
          </button>
          <div className="method-info">
            <strong>Option 1: DNS Blocking</strong>
            <ul>
              <li>Blocks 16 Mozilla telemetry domains</li>
              <li>Modifies /etc/hosts (requires sudo)</li>
              <li>Survives system reboots</li>
              <li>Creates automatic backup</li>
            </ul>
          </div>
        </div>

        <div className="status-card">
          <h3>Enterprise Policy</h3>
          <div className={`status-badge ${status?.enterprisePolicy ? "active" : "inactive"}`}>
            {status?.enterprisePolicy ? "✅ ACTIVE" : "❌ INACTIVE"}
          </div>
          {status?.enterprisePolicy && (
            <div className="status-details">
              <p>Policy path: {status.policyPath}</p>
            </div>
          )}
          <button 
            onClick={installPolicy} 
            disabled={processing || status?.enterprisePolicy}
            className="action-button"
          >
            {status?.enterprisePolicy ? "Already Installed" : "Install Policy"}
          </button>
          <div className="method-info">
            <strong>Option 3: Enterprise Policy</strong>
            <ul>
              <li>System-wide telemetry disable</li>
              <li>Creates /etc/firefox/policies/policies.json</li>
              <li>Applies to all users</li>
              <li>Cannot be overridden by user.js</li>
            </ul>
          </div>
        </div>
      </div>

      {result && (
        <div className={`result-box ${result.error ? "error" : "success"}`}>
          <h3>{result.error ? "❌ Error" : "✅ Success"}</h3>
          <p>{result.message || result.error}</p>
          {result.nextSteps && (
            <div className="next-steps">
              <strong>Next Steps:</strong>
              <ul>
                {result.nextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

