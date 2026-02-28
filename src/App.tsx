import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

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

const defaultBaseUrl = import.meta.env.VITE_RELAY_BASE_URL ?? "/api";
const defaultAuthKey = import.meta.env.VITE_RELAY_AUTHKEY ?? "";

const labelStyle = new TextStyle({
  fill: "#f5dadd",
  fontFamily: "Courier New, monospace",
  fontSize: 12,
  fontWeight: "bold",
});

const subStyle = new TextStyle({
  fill: "#dfbcc1",
  fontFamily: "Courier New, monospace",
  fontSize: 10,
});

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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedEmployeeId) return;
    if (!employees.some((item) => item.id === selectedEmployeeId)) {
      setSelectedEmployeeId(null);
    }
  }, [employees, selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => item.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const selectedConversation = useMemo(() => {
    if (!selectedEmployeeId) return [];
    const rows = conversationsByEmployee.get(selectedEmployeeId) ?? [];
    if (!bossNode) return rows;
    return rows.filter((row) => row.boss.id === bossNode.id);
  }, [bossNode, conversationsByEmployee, selectedEmployeeId]);

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
                          <span className={`delivery ${row.delivery.status}`}>{row.delivery.status}</span>
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
                Boss office stays in center. Employee offices surround it by live connection state.
                Click the meeting memo in an employee room to inspect all boss/employee records.
              </p>
              {error && <div className="panel error-panel room-error">{error}</div>}
              <WorkforceRoom
                boss={bossNode}
                employees={employees}
                conversationsByEmployee={conversationsByEmployee}
                selectedEmployeeId={selectedEmployeeId}
                onSelectEmployee={setSelectedEmployeeId}
              />
            </div>
            <aside className="panel room-conversation-panel">
              <h2>Meeting Notes</h2>
              {selectedEmployee ? (
                <>
                  <div className="conversation-meta">
                    <strong>{selectedEmployee.name || selectedEmployee.id}</strong>
                    <span>{selectedEmployee.id}</span>
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
                <p className="empty-text">Select an employee memo from the room scene.</p>
              )}
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}

function WorkforceRoom({
  boss,
  employees,
  conversationsByEmployee,
  selectedEmployeeId,
  onSelectEmployee,
}: {
  boss: WorkforceNode | null;
  employees: WorkforceNode[];
  conversationsByEmployee: Map<string, CommRow[]>;
  selectedEmployeeId: string | null;
  onSelectEmployee: (employeeId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);

  const drawScene = useCallback(() => {
    const app = appRef.current;
    const host = hostRef.current;
    if (!app || !host) return;

    const width = Math.max(420, host.clientWidth);
    const height = 560;
    app.renderer.resize(width, height);
    app.stage.removeChildren();

    const background = new Graphics();
    background.beginFill(0x12090d);
    background.drawRect(0, 0, width, height);
    background.endFill();
    app.stage.addChild(background);

    const tile = new Graphics();
    tile.lineStyle(1, 0x2c1117, 0.8);
    const tileStep = 24;
    for (let x = 0; x <= width; x += tileStep) {
      tile.moveTo(x, 0);
      tile.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += tileStep) {
      tile.moveTo(0, y);
      tile.lineTo(width, y);
    }
    app.stage.addChild(tile);

    const centerX = width / 2;
    const centerY = height / 2;

    drawOffice({
      stage: app.stage,
      x: centerX,
      y: centerY,
      width: 240,
      height: 180,
      label: boss?.name || "OpenClaw Boss",
      subtitle: boss?.id || "boss-office",
      fill: 0x3f0f17,
      stroke: 0xcf5f73,
      selected: false,
      noteCount: 0,
      onMemoClick: undefined,
    });
    addLobster(app.stage, centerX + 80, centerY + 62, 3);

    const ringCapacity = 10;
    const baseRadius = Math.min(width, height) * 0.34;
    employees.forEach((employee, index) => {
      const ring = Math.floor(index / ringCapacity);
      const inRing = index % ringCapacity;
      const ringCount = Math.min(ringCapacity, employees.length - ring * ringCapacity);
      const angle = (Math.PI * 2 * inRing) / ringCount - Math.PI / 2;
      const radius = baseRadius + ring * 130;
      const officeX = centerX + Math.cos(angle) * radius;
      const officeY = centerY + Math.sin(angle) * radius;
      const isSelected = selectedEmployeeId === employee.id;
      const tone = employeeTone(employee);
      const noteCount = conversationsByEmployee.get(employee.id)?.length ?? 0;

      drawOffice({
        stage: app.stage,
        x: officeX,
        y: officeY,
        width: 150,
        height: 108,
        label: employee.name || employee.id.slice(0, 12),
        subtitle: employee.status,
        fill: tone.fill,
        stroke: isSelected ? 0xf8b4bf : tone.stroke,
        selected: isSelected,
        noteCount,
        onMemoClick: () => onSelectEmployee(employee.id),
      });

      addLobster(app.stage, officeX + 45, officeY + 35, 2);
    });
  }, [boss, conversationsByEmployee, employees, onSelectEmployee, selectedEmployeeId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application({
      width: Math.max(420, host.clientWidth),
      height: 560,
      antialias: false,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    appRef.current = app;
    host.innerHTML = "";
    host.appendChild(app.view as HTMLCanvasElement);

    drawScene();
    const onResize = () => drawScene();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      app.destroy(true, { children: true });
      appRef.current = null;
      host.innerHTML = "";
    };
  }, [drawScene]);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  return <div className="room-canvas" ref={hostRef} />;
}

function drawOffice({
  stage,
  x,
  y,
  width,
  height,
  label,
  subtitle,
  fill,
  stroke,
  selected,
  noteCount,
  onMemoClick,
}: {
  stage: Container;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  subtitle: string;
  fill: number;
  stroke: number;
  selected: boolean;
  noteCount: number;
  onMemoClick?: () => void;
}) {
  const office = new Container();
  office.position.set(x, y);

  const body = new Graphics();
  body.lineStyle(selected ? 4 : 2, stroke, 1);
  body.beginFill(fill, 0.98);
  body.drawRoundedRect(-width / 2, -height / 2, width, height, 10);
  body.endFill();
  office.addChild(body);

  const inner = new Graphics();
  inner.beginFill(0x1a080d, 0.4);
  inner.drawRoundedRect(-width / 2 + 10, -height / 2 + 34, width - 20, height - 44, 8);
  inner.endFill();
  office.addChild(inner);

  const title = new Text(truncate(label, 18), labelStyle);
  title.anchor.set(0.5, 0);
  title.position.set(0, -height / 2 + 8);
  office.addChild(title);

  const sub = new Text(subtitle.toUpperCase(), subStyle);
  sub.anchor.set(0.5, 0);
  sub.position.set(0, -height / 2 + 24);
  office.addChild(sub);

  if (onMemoClick) {
    const memo = new Graphics();
    const memoW = 30;
    const memoH = 36;
    memo.lineStyle(2, 0x7b5936, 1);
    memo.beginFill(0xe6d8ac, 1);
    memo.drawRoundedRect(width / 2 - memoW - 8, height / 2 - memoH - 8, memoW, memoH, 3);
    memo.endFill();
    memo.beginFill(0x9e6e44, 1);
    memo.drawRect(width / 2 - memoW - 3, height / 2 - memoH + 1, 5, 5);
    memo.endFill();
    memo.eventMode = "static";
    memo.cursor = "pointer";
    memo.on("pointertap", onMemoClick);
    office.addChild(memo);

    const countText = new Text(String(noteCount), new TextStyle({
      fill: "#3f2a15",
      fontFamily: "Courier New, monospace",
      fontSize: 11,
      fontWeight: "bold",
    }));
    countText.anchor.set(0.5, 0.5);
    countText.position.set(width / 2 - memoW / 2 - 8, height / 2 - 20);
    office.addChild(countText);
  }

  stage.addChild(office);
}

function addLobster(stage: Container, x: number, y: number, scale: number) {
  const pattern = [
    "00111100",
    "01122110",
    "11222211",
    "12233221",
    "12233221",
    "11222211",
    "01122110",
    "10100101",
  ];
  const palette: Record<string, number> = {
    "1": 0xb94236,
    "2": 0xdc6754,
    "3": 0x4d1513,
  };
  const graphic = new Graphics();
  graphic.position.set(x, y);
  for (let row = 0; row < pattern.length; row += 1) {
    const line = pattern[row];
    for (let col = 0; col < line.length; col += 1) {
      const px = line[col];
      if (px === "0") continue;
      graphic.beginFill(palette[px] ?? 0xb94236, 0.95);
      graphic.drawRect(col * scale, row * scale, scale, scale);
      graphic.endFill();
    }
  }
  stage.addChild(graphic);
}

function employeeTone(employee: WorkforceNode) {
  if (employee.banned) {
    return { fill: 0x50151f, stroke: 0xb83f54 };
  }
  if (!employee.online || employee.health.overall === "unhealthy") {
    return { fill: 0x3a1117, stroke: 0xb3454f };
  }
  if (employee.health.overall === "degraded") {
    return { fill: 0x3a2712, stroke: 0xcf9a4d };
  }
  return { fill: 0x153022, stroke: 0x64c498 };
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
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
