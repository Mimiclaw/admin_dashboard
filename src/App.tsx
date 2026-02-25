import { useCallback, useEffect, useMemo, useState } from "react";

type NodeHealth = {
  overall: "healthy" | "degraded" | "unhealthy";
  reasons: string[];
  status: string;
  online: boolean;
  heartbeat: {
    last_seen_at: number | null;
    age_ms: number | null;
    stale: boolean;
    stale_threshold_ms: number;
  };
  self_report: {
    valid: boolean | null;
    last_report_at: number | null;
    age_ms: number | null;
    stale: boolean;
    stale_threshold_ms: number;
  };
  connection: {
    last_connected_at: number | null;
    last_disconnected_at: number | null;
    websocket_open: boolean;
  };
};

type WorkforceNode = {
  id: string;
  role: "boss" | "employee";
  name: string | null;
  tags: string[];
  status: "online" | "offline" | "banned";
  online: boolean;
  banned: boolean;
  created_at: number;
  last_seen: number;
  health: NodeHealth;
  meta: Record<string, unknown> | null;
};

type WorkforceResponse = {
  summary: {
    total_nodes: number;
    boss_count: number;
    employee_count: number;
    online_count: number;
    offline_count: number;
    banned_count: number;
    health: {
      healthy: number;
      degraded: number;
      unhealthy: number;
    };
    filtered_by_tag: string | null;
  };
  bosses: WorkforceNode[];
  employees: WorkforceNode[];
  employees_by_tag: Record<
    string,
    {
      count: number;
      employee_ids: string[];
      employees: WorkforceNode[];
    }
  >;
  timestamp: number;
};

type CommRow = {
  msg_id: string;
  timestamp: number;
  direction: "boss_to_employee" | "employee_to_boss";
  boss: {
    id: string;
    role: string;
    name: string | null;
    tags: string[];
  };
  employee: {
    id: string;
    role: string;
    name: string | null;
    tags: string[];
  };
  from: {
    id: string;
    role: string;
    name: string | null;
    tags: string[];
  };
  to: {
    id: string;
    role: string;
    name: string | null;
    tags: string[];
  };
  delivery: {
    status: "delivered" | "failed" | "unknown";
    reason: string | null;
  };
  payload: unknown;
};

type CommsResponse = {
  total: number;
  offset: number;
  limit: number;
  filters: {
    boss_id: string | null;
    employee_id: string | null;
    tag: string | null;
    since: number | null;
    until: number | null;
  };
  rows: CommRow[];
  timestamp: number;
};

const defaultBaseUrl = import.meta.env.VITE_RELAY_BASE_URL ?? "/api";
const defaultAuthKey = import.meta.env.VITE_RELAY_AUTHKEY ?? "";

function App() {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [authKey, setAuthKey] = useState(defaultAuthKey);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [workforceTag, setWorkforceTag] = useState("");
  const [commTag, setCommTag] = useState("");
  const [commBossId, setCommBossId] = useState("");
  const [commEmployeeId, setCommEmployeeId] = useState("");
  const [commSince, setCommSince] = useState("");
  const [commUntil, setCommUntil] = useState("");
  const [commLimit, setCommLimit] = useState("100");
  const [commOffset, setCommOffset] = useState("0");

  const [workforce, setWorkforce] = useState<WorkforceResponse | null>(null);
  const [communications, setCommunications] = useState<CommsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeUrl = useCallback(
    (path: string, query: Record<string, string | null | undefined>) => {
      const normalizedBase = (baseUrl || "/api").trim();
      const absoluteBase =
        normalizedBase.startsWith("http://") || normalizedBase.startsWith("https://")
          ? normalizedBase
          : new URL(
              normalizedBase.startsWith("/") ? normalizedBase : `/${normalizedBase}`,
              window.location.origin,
            ).toString();
      const baseWithSlash = absoluteBase.endsWith("/") ? absoluteBase : `${absoluteBase}/`;
      const relativePath = path.startsWith("/") ? path.slice(1) : path;
      const url = new URL(relativePath, baseWithSlash);
      if (authKey.trim()) {
        url.searchParams.set("authkey", authKey.trim());
      }
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, value);
        }
      });
      return url.toString();
    },
    [authKey, baseUrl],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const workforceUrl = makeUrl("/admin/workforce", {
        tag: workforceTag.trim() || undefined,
      });
      const commUrl = makeUrl("/admin/communications", {
        tag: commTag.trim() || undefined,
        boss_id: commBossId.trim() || undefined,
        employee_id: commEmployeeId.trim() || undefined,
        since: commSince.trim() || undefined,
        until: commUntil.trim() || undefined,
        limit: commLimit.trim() || undefined,
        offset: commOffset.trim() || undefined,
      });

      const [workforceRes, commRes] = await Promise.all([
        fetch(workforceUrl),
        fetch(commUrl),
      ]);
      if (!workforceRes.ok) {
        throw new Error(`Workforce request failed: ${workforceRes.status}`);
      }
      if (!commRes.ok) {
        throw new Error(`Communications request failed: ${commRes.status}`);
      }

      const [workforceData, commData] = (await Promise.all([
        workforceRes.json(),
        commRes.json(),
      ])) as [WorkforceResponse, CommsResponse];

      setWorkforce(workforceData);
      setCommunications(commData);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    commBossId,
    commEmployeeId,
    commLimit,
    commOffset,
    commSince,
    commTag,
    commUntil,
    makeUrl,
    workforceTag,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadData();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadData]);

  const tagRows = useMemo(() => {
    if (!workforce) {
      return [];
    }
    return Object.entries(workforce.employees_by_tag).sort((a, b) => b[1].count - a[1].count);
  }, [workforce]);

  return (
    <div className="admin-app">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="layout">
        <header className="panel hero-panel">
          <div className="brand">
            <img src="/logo.png" alt="Mimiclaw logo" className="brand-logo" />
            <div>
              <h1>Mimiclaw Relay Admin</h1>
              <p>Dark red command surface for workforce and communications control.</p>
            </div>
          </div>
          <div className="hero-actions">
            <button className="button ghost" onClick={() => void loadData()} disabled={loading}>
              {loading ? "Loading..." : "Refresh Now"}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              <span>Auto 15s</span>
            </label>
          </div>
        </header>

        <section className="panel form-panel">
          <h2>Connection Settings</h2>
          <div className="form-grid">
            <label>
              Relay Base URL
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
            <label>
              Auth Key
              <input value={authKey} onChange={(e) => setAuthKey(e.target.value)} />
            </label>
            <label>
              Workforce Tag Filter
              <input
                value={workforceTag}
                onChange={(e) => setWorkforceTag(e.target.value)}
                placeholder="e.g. research"
              />
            </label>
            <label>
              Communication Tag
              <input
                value={commTag}
                onChange={(e) => setCommTag(e.target.value)}
                placeholder="e.g. solidity"
              />
            </label>
            <label>
              Boss ID
              <input
                value={commBossId}
                onChange={(e) => setCommBossId(e.target.value)}
                placeholder="boss-..."
              />
            </label>
            <label>
              Employee ID
              <input
                value={commEmployeeId}
                onChange={(e) => setCommEmployeeId(e.target.value)}
                placeholder="employee-..."
              />
            </label>
            <label>
              Since (ms)
              <input value={commSince} onChange={(e) => setCommSince(e.target.value)} />
            </label>
            <label>
              Until (ms)
              <input value={commUntil} onChange={(e) => setCommUntil(e.target.value)} />
            </label>
            <label>
              Limit
              <input value={commLimit} onChange={(e) => setCommLimit(e.target.value)} />
            </label>
            <label>
              Offset
              <input value={commOffset} onChange={(e) => setCommOffset(e.target.value)} />
            </label>
          </div>
        </section>

        {error && <div className="panel error-panel">{error}</div>}

        <section className="summary-grid">
          <article className="panel metric">
            <span>Total Nodes</span>
            <strong>{workforce?.summary.total_nodes ?? "-"}</strong>
          </article>
          <article className="panel metric">
            <span>Bosses</span>
            <strong>{workforce?.summary.boss_count ?? "-"}</strong>
          </article>
          <article className="panel metric">
            <span>Employees</span>
            <strong>{workforce?.summary.employee_count ?? "-"}</strong>
          </article>
          <article className="panel metric">
            <span>Healthy/Degraded/Unhealthy</span>
            <strong>
              {workforce
                ? `${workforce.summary.health.healthy}/${workforce.summary.health.degraded}/${workforce.summary.health.unhealthy}`
                : "-"}
            </strong>
          </article>
          <article className="panel metric">
            <span>Communication Rows</span>
            <strong>{communications?.total ?? "-"}</strong>
          </article>
          <article className="panel metric">
            <span>Last Updated</span>
            <strong>{lastUpdated ? formatTime(lastUpdated) : "-"}</strong>
          </article>
        </section>

        <section className="split">
          <div className="panel">
            <h2>Boss List</h2>
            <div className="node-list">
              {workforce?.bosses.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Employee List</h2>
            <div className="node-list">
              {workforce?.employees.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Employees By Tag</h2>
          <div className="tag-grid">
            {tagRows.map(([tag, data]) => (
              <article key={tag} className="tag-card">
                <header>
                  <h3>{tag}</h3>
                  <span>{data.count}</span>
                </header>
                <p>{data.employee_ids.join(", ")}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Boss / Employee Communications</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Direction</th>
                  <th>Boss</th>
                  <th>Employee</th>
                  <th>Delivery</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {communications?.rows.map((row) => (
                  <tr key={`${row.msg_id}-${row.timestamp}-${row.to.id}`}>
                    <td>{formatTime(row.timestamp)}</td>
                    <td>{row.direction}</td>
                    <td>{row.boss.name || row.boss.id}</td>
                    <td>{row.employee.name || row.employee.id}</td>
                    <td>
                      <span className={`delivery ${row.delivery.status}`}>
                        {row.delivery.status}
                      </span>
                    </td>
                    <td>
                      <code>{safeStringify(row.payload)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: WorkforceNode }) {
  return (
    <article className="node-card">
      <header>
        <div>
          <h3>{node.name || node.id}</h3>
          <p>{node.id}</p>
        </div>
        <span className={`status ${node.health.overall}`}>{node.health.overall}</span>
      </header>
      <div className="tags">
        {node.tags.length === 0 && <span className="tag mute">no-tags</span>}
        {node.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{node.status}</dd>
        </div>
        <div>
          <dt>Last Seen</dt>
          <dd>{formatTime(node.last_seen)}</dd>
        </div>
        <div>
          <dt>Heartbeat</dt>
          <dd>{node.health.heartbeat.stale ? "stale" : "ok"}</dd>
        </div>
        <div>
          <dt>Self Report</dt>
          <dd>{node.health.self_report.valid === null ? "missing" : String(node.health.self_report.valid)}</dd>
        </div>
      </dl>
    </article>
  );
}

function formatTime(ts: number | null) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleString();
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export default App;
