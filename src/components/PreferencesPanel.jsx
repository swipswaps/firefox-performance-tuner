import { useState } from "react";

export default function PreferencesPanel({ preferences, categories, onApply }) {
  const [filter, setFilter] = useState("");
  const [showOnly, setShowOnly] = useState("all"); // all | issues | ok

  const flatPrefs = {};
  for (const cat of Object.values(categories || {})) {
    for (const [key, val] of Object.entries(cat)) {
      flatPrefs[key] = val.expected;
    }
  }

  const issueCount = Object.keys(flatPrefs).filter(
    (k) => preferences[k] !== flatPrefs[k],
  ).length;
  const okCount = Object.keys(flatPrefs).length - issueCount;
  const categoryEntries = Object.entries(categories || {});

  if (categoryEntries.length === 0) {
    return (
      <div className="section">
        <div className="section-title">⚙️ Preferences</div>
        <p style={{ color: "#888" }}>Loading preference categories...</p>
      </div>
    );
  }

  const filterLower = filter.toLowerCase();

  return (
    <div>
      <div className="pref-toolbar">
        <input
          type="text"
          className="pref-search"
          placeholder="Filter preferences..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="pref-filters">
          <button
            className={`filter-btn ${showOnly === "all" ? "filter-active" : ""}`}
            onClick={() => setShowOnly("all")}
          >
            All ({Object.keys(flatPrefs).length})
          </button>
          <button
            className={`filter-btn filter-btn-warn ${showOnly === "issues" ? "filter-active" : ""}`}
            onClick={() => setShowOnly("issues")}
          >
            Issues ({issueCount})
          </button>
          <button
            className={`filter-btn filter-btn-ok ${showOnly === "ok" ? "filter-active" : ""}`}
            onClick={() => setShowOnly("ok")}
          >
            OK ({okCount})
          </button>
        </div>
      </div>

      {categoryEntries.map(([catName, prefs]) => {
        const filteredEntries = Object.entries(prefs).filter(([key, val]) => {
          if (
            filterLower &&
            !key.toLowerCase().includes(filterLower) &&
            !val.description.toLowerCase().includes(filterLower)
          )
            return false;
          const actual = preferences[key];
          const isOk =
            actual !== undefined && actual !== null && actual === val.expected;
          if (showOnly === "issues" && isOk) return false;
          if (showOnly === "ok" && !isOk) return false;
          return true;
        });

        if (filteredEntries.length === 0) return null;

        return (
          <div
            key={catName}
            className="section"
            style={{ marginBottom: "12px" }}
          >
            <div className="section-title">{catName}</div>
            {filteredEntries.map(([key, val]) => {
              const expected = val.expected;
              const actual = preferences[key];
              const isNotSet = actual === undefined || actual === null;
              const isOk = !isNotSet && actual === expected;

              return (
                <div
                  key={key}
                  className={`pref-row ${isOk ? "pref-ok" : isNotSet ? "pref-warn" : "pref-error"}`}
                >
                  <div className="pref-main">
                    <span
                      className={`pref-status ${isOk ? "status-ok" : isNotSet ? "status-warn" : "status-error"}`}
                    >
                      {isOk ? "✓" : isNotSet ? "—" : "✗"}
                    </span>
                    <div className="pref-details">
                      <div className="pref-key">{key}</div>
                      <div className="pref-desc">{val.description}</div>
                    </div>
                    <div className="pref-values">
                      <span className="pref-actual">
                        {isNotSet ? "not set" : actual}
                      </span>
                      {!isOk && (
                        <span className="pref-expected">
                          expected: {expected}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {issueCount > 0 && (
        <div className="pref-action-box">
          <div className="pref-action-text">
            <strong>
              ⚠ {issueCount} preference{issueCount > 1 ? "s" : ""} differ from
              recommended values
            </strong>
            <p>
              Click "Apply" to write optimized values to user.js, then restart
              Firefox.
            </p>
          </div>
          {onApply && (
            <button className="btn-apply" onClick={onApply}>
              Apply All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
