import { useCallback, useEffect, useMemo, useState } from "react";
import RelayRoomMap from "./components/room/RelayRoomMap";

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

type CommNode = {
  id: string;
  role: string;
  name: string | null;
  tags: string[];
};

type CommRow = {
  msg_id: string;
  timestamp: number;
  direction: "boss_to_employee" | "employee_to_boss";
  boss: CommNode;
  employee: CommNode;
  from: CommNode;
  to: CommNode;
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

type ViewMode = "dashboard" | "room";
type RoomSelection =
  | {
      mode: "boss";
    }
  | {
      mode: "employee";
      employeeId: string;
    };

const defaultBaseUrl = import.meta.env.VITE_RELAY_BASE_URL ?? "/api";
const defaultAuthKey = import.meta.env.VITE_RELAY_AUTHKEY ?? "";

function App() {
  const [activeView, setActiveView] = useState<ViewMode>("dashboard");
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
  const [roomSelection, setRoomSelection] = useState<RoomSelection | null>(null);

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

      const [workforceRes, commRes] = await Promise.all([fetch(workforceUrl), fetch(commUrl)]);
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
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadData();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadData]);

  const bossNode = workforce?.bosses?.[0] ?? null;
  const employees = workforce?.employees ?? [];
  const tagRows = useMemo(() => {
    if (!workforce) return [];
    return Object.entries(workforce.employees_by_tag).sort((a, b) => b[1].count - a[1].count);
  }, [workforce]);

  const conversationsByEmployee = useMemo(() => {
    const map = new Map<string, CommRow[]>();
    for (const row of communications?.rows ?? []) {
      const key = row.employee.id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(row);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => a.timestamp - b.timestamp);
    }
    return map;
  }, [communications?.rows]);

  const memoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [employeeId, rows] of conversationsByEmployee.entries()) {
      counts[employeeId] = rows.length;
    }
    return counts;
  }, [conversationsByEmployee]);

  useEffect(() => {
    if (!roomSelection || roomSelection.mode !== "employee") return;
    if (!employees.some((item) => item.id === roomSelection.employeeId)) {
      setRoomSelection(null);
    }
  }, [employees, roomSelection]);

  const selectedEmployeeId = roomSelection?.mode === "employee" ? roomSelection.employeeId : null;

  const selectedEmployee = useMemo(
    () => employees.find((item) => item.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const selectedConversation = useMemo(() => {
    if (!roomSelection) return [];
    if (roomSelection.mode === "boss") {
      return communications?.rows ?? [];
    }

    const rows = conversationsByEmployee.get(roomSelection.employeeId) ?? [];
    return rows;
  }, [communications?.rows, conversationsByEmployee, roomSelection]);

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

        <section className="panel tab-panel">
          <div className="tab-switch" role="tablist" aria-label="Admin views">
            <button
              className={`tab-button ${activeView === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveView("dashboard")}
              role="tab"
              aria-selected={activeView === "dashboard"}
            >
              Dashboard
            </button>
            <button
              className={`tab-button ${activeView === "room" ? "active" : ""}`}
              onClick={() => setActiveView("room")}
              role="tab"
              aria-selected={activeView === "room"}
            >
              Room
            </button>
          </div>
        </section>

        {activeView === "dashboard" ? (
          <>
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
          </>
        ) : (
          <section className="room-shell">
            <div className="panel room-canvas-panel">
              <h2>Workforce Office Room</h2>
              <p className="room-hint">
                Drag to pan the map. Click boss building/lobster for all records, or click any worker-room object for that employee.
              </p>
              {error && <div className="panel error-panel room-error">{error}</div>}
              <RelayRoomMap
                boss={bossNode}
                employees={employees}
                memoCounts={memoCounts}
                selectedEmployeeId={selectedEmployeeId}
                selectedBoss={roomSelection?.mode === "boss"}
                onSelectEmployee={(employeeId) => setRoomSelection({ mode: "employee", employeeId })}
                onSelectBoss={() => setRoomSelection({ mode: "boss" })}
              />
            </div>
            <aside className="panel room-conversation-panel">
              <h2>Meeting Notes</h2>
              {roomSelection?.mode === "boss" ? (
                <>
                  <div className="conversation-meta">
                    <strong>{bossNode?.name || "Boss"}</strong>
                    <span>{bossNode?.id ?? "boss-unassigned"}</span>
                    <span>Employees: {employees.length}</span>
                    <span>Records: {selectedConversation.length}</span>
                  </div>
                  <div className="conversation-list">
                    {selectedConversation.length === 0 ? (
                      <p className="empty-text">No boss communication records found.</p>
                    ) : (
                      selectedConversation.map((row, idx) => (
                        <article className="conversation-item" key={`${row.msg_id}-${row.timestamp}-${idx}`}>
                          <header>
                            <span>{row.direction}</span>
                            <time>{formatTime(row.timestamp)}</time>
                          </header>
                          <p>
                            <b>Employee:</b> {row.employee.name || row.employee.id}
                          </p>
                          <p>
                            <b>From:</b> {row.from.name || row.from.id}
                          </p>
                          <p>
                            <b>To:</b> {row.to.name || row.to.id}
                          </p>
                          <p>
                            <b>Delivery:</b> {row.delivery.status}
                            {row.delivery.reason ? ` (${row.delivery.reason})` : ""}
                          </p>
                          <pre>{safePretty(row.payload)}</pre>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : selectedEmployee ? (
                <>
                  <div className="conversation-meta">
                    <strong>{selectedEmployee.name || selectedEmployee.id}</strong>
                    <span>{selectedEmployee.id}</span>
                    <span>
                      Status: {selectedEmployee.status} / Health: {selectedEmployee.health.overall}
                    </span>
                    <div className="conversation-tags">
                      {selectedEmployee.tags.length === 0 ? (
                        <span className="tag mute">no-tags</span>
                      ) : (
                        selectedEmployee.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                    <span>Records: {selectedConversation.length}</span>
                  </div>
                  <div className="conversation-list">
                    {selectedConversation.length === 0 ? (
                      <p className="empty-text">No boss conversation records for this employee.</p>
                    ) : (
                      selectedConversation.map((row, idx) => (
                        <article className="conversation-item" key={`${row.msg_id}-${row.timestamp}-${idx}`}>
                          <header>
                            <span>{row.direction}</span>
                            <time>{formatTime(row.timestamp)}</time>
                          </header>
                          <p>
                            <b>From:</b> {row.from.name || row.from.id}
                          </p>
                          <p>
                            <b>To:</b> {row.to.name || row.to.id}
                          </p>
                          <p>
                            <b>Delivery:</b> {row.delivery.status}
                            {row.delivery.reason ? ` (${row.delivery.reason})` : ""}
                          </p>
                          <pre>{safePretty(row.payload)}</pre>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="empty-text">
                  Select boss building/lobster for all records, or click any worker-room object.
                </p>
              )}
            </aside>
          </section>
        )}
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
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function safePretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

export default App;
