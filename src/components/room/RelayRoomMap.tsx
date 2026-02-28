import { useEffect, useMemo, useRef, useState } from "react";

type RoomBoss = {
  id: string;
  name: string | null;
};

type RoomEmployee = {
  id: string;
  name: string | null;
  status: "online" | "offline" | "banned";
  online: boolean;
  banned: boolean;
  health: {
    overall: "healthy" | "degraded" | "unhealthy";
  };
};

type SceneObject = {
  id: string;
  type: string | "lobster";
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  interactive?: boolean;
  employeeId?: string;
  noteCount?: number;
  selected?: boolean;
};

type RelayRoomMapProps = {
  boss: RoomBoss | null;
  employees: RoomEmployee[];
  memoCounts: Record<string, number>;
  selectedEmployeeId: string | null;
  onSelectEmployee: (employeeId: string) => void;
};

const MAP_CONFIG = {
  width: 4200,
  height: 4200,
  backgroundAsset: "/room-assets/grass_background_2.png",
};

const ROOM_SIZE_W = 700;
const ROOM_SIZE_H = 500;
const CENTER_X = MAP_CONFIG.width / 2;
const CENTER_Y = MAP_CONFIG.height / 2;
const DOOR_HALF_GAP = 50;

type DoorDirection = "north" | "south" | "west" | "east";
type EdgeDirection = "top" | "bottom" | "left" | "right";

type RoomLayout = {
  id: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  doors: DoorDirection[];
};

const ROOM_VARIANTS: Array<{ item: string; size: [number, number] }> = [
  { item: "/room-assets/wagon.webp", size: [128, 128] },
  { item: "/room-assets/shrub.png", size: [64, 64] },
  { item: "/room-assets/field_maple.webp", size: [128, 128] },
  { item: "/room-assets/clothes-rack.png", size: [64, 64] },
  { item: "/room-assets/cow_skull.png", size: [48, 48] },
  { item: "/room-assets/haunted_stump.png", size: [64, 64] },
  { item: "/room-assets/tiki_torch.webp", size: [32, 64] },
  { item: "/room-assets/chestnut_fungi_stool.png", size: [48, 48] },
  { item: "/room-assets/laptop.png", size: [32, 32] },
];

function roomBounds(room: RoomLayout) {
  return {
    left: room.centerX - room.width / 2,
    right: room.centerX + room.width / 2,
    top: room.centerY - room.height / 2,
    bottom: room.centerY + room.height / 2,
  };
}

function toDoor(edge: EdgeDirection): DoorDirection {
  if (edge === "top") return "north";
  if (edge === "bottom") return "south";
  if (edge === "left") return "west";
  return "east";
}

function oppositeDoor(edge: EdgeDirection): DoorDirection {
  if (edge === "top") return "south";
  if (edge === "bottom") return "north";
  if (edge === "left") return "east";
  return "west";
}

function findAdjacentRoom(room: RoomLayout, allRooms: RoomLayout[], edge: EdgeDirection) {
  const a = roomBounds(room);
  return allRooms.find((other) => {
    if (other.id === room.id) return false;
    const b = roomBounds(other);
    if (edge === "top") {
      return b.bottom === a.top && Math.max(a.left, b.left) < Math.min(a.right, b.right);
    }
    if (edge === "bottom") {
      return b.top === a.bottom && Math.max(a.left, b.left) < Math.min(a.right, b.right);
    }
    if (edge === "left") {
      return b.right === a.left && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
    }
    return b.left === a.right && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
  });
}

function shouldRenderEdge(room: RoomLayout, edge: EdgeDirection, neighbor: RoomLayout | undefined) {
  if (!neighbor) return true;
  if (edge === "bottom") return room.centerY < neighbor.centerY;
  if (edge === "right") return room.centerX < neighbor.centerX;
  return false;
}

function hasDoorOnEdge(room: RoomLayout, edge: EdgeDirection) {
  return room.doors.includes(toDoor(edge));
}

function shouldSkipForDoor(centerX: number, centerY: number, pointX: number, pointY: number, edge: EdgeDirection) {
  if (edge === "top" || edge === "bottom") {
    return Math.abs(pointX - centerX) < DOOR_HALF_GAP;
  }
  return Math.abs(pointY - centerY) < DOOR_HALF_GAP;
}

function generateStoneRoomWalls(room: RoomLayout, allRooms: RoomLayout[]) {
  const objects: SceneObject[] = [];
  const rockAsset = "/room-assets/iron_rock.png";
  const wallStep = 28;
  const displaySize = 48;
  const bounds = roomBounds(room);
  let idCounter = 0;

  const pushHorizontal = (edge: "top" | "bottom", y: number) => {
    const neighbor = findAdjacentRoom(room, allRooms, edge);
    if (!shouldRenderEdge(room, edge, neighbor)) return;
    const hasDoor =
      hasDoorOnEdge(room, edge) ||
      (neighbor ? neighbor.doors.includes(oppositeDoor(edge)) : false);
    for (let x = bounds.left; x <= bounds.right; x += wallStep) {
      if (hasDoor && shouldSkipForDoor(room.centerX, room.centerY, x, y, edge)) continue;
      objects.push({
        id: `${room.id}_wall_${edge}_${idCounter++}`,
        type: rockAsset,
        x,
        y,
        width: displaySize,
        height: displaySize,
        z: y + displaySize,
      });
    }
  };

  const pushVertical = (edge: "left" | "right", x: number) => {
    const neighbor = findAdjacentRoom(room, allRooms, edge);
    if (!shouldRenderEdge(room, edge, neighbor)) return;
    const hasDoor =
      hasDoorOnEdge(room, edge) ||
      (neighbor ? neighbor.doors.includes(oppositeDoor(edge)) : false);
    for (let y = bounds.top; y <= bounds.bottom; y += wallStep) {
      if (y === bounds.top || y > bounds.bottom - wallStep) continue;
      if (hasDoor && shouldSkipForDoor(room.centerX, room.centerY, x, y, edge)) continue;
      objects.push({
        id: `${room.id}_wall_${edge}_${idCounter++}`,
        type: rockAsset,
        x,
        y,
        width: displaySize,
        height: displaySize,
        z: y + displaySize,
      });
    }
  };

  pushHorizontal("top", bounds.top);
  pushHorizontal("bottom", bounds.bottom);
  pushVertical("left", bounds.left);
  pushVertical("right", bounds.right);
  return objects;
}

function getDoorTowardsCenter(cx: number, cy: number): DoorDirection[] {
  const dx = cx - CENTER_X;
  const dy = cy - CENTER_Y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return [dx > 0 ? "west" : "east"];
  }
  return [dy > 0 ? "north" : "south"];
}

function createRoomInterior(
  cx: number,
  cy: number,
  prefix: string,
  employeeId: string | null,
  noteCount: number,
  selected: boolean,
  variantIndex: number,
) {
  const variant = ROOM_VARIANTS[variantIndex % ROOM_VARIANTS.length];
  const [vw, vh] = variant.size;
  const isInteractiveDesk = employeeId !== null;

  const objects: SceneObject[] = [
    {
      id: `${prefix}_desk`,
      type: "/room-assets/crafting_table.webp",
      x: cx - 64,
      y: cy - 50,
      width: 128,
      height: 128,
      z: cy + 78,
      interactive: isInteractiveDesk,
      employeeId: employeeId ?? undefined,
      noteCount,
      selected,
    },
    {
      id: `${prefix}_shelf`,
      type: "/room-assets/woodsign.png",
      x: cx - 200,
      y: cy - 150,
      width: 96,
      height: 96,
      z: cy - 54,
    },
    {
      id: `${prefix}_book1`,
      type: "/room-assets/tier1_book.webp",
      x: cx - 180,
      y: cy - 140,
      width: 24,
      height: 24,
      z: cy - 116,
    },
    {
      id: `${prefix}_book2`,
      type: "/room-assets/tier2_book.webp",
      x: cx - 150,
      y: cy - 140,
      width: 24,
      height: 24,
      z: cy - 116,
    },
    {
      id: `${prefix}_book3`,
      type: "/room-assets/tier3_book.webp",
      x: cx - 120,
      y: cy - 150,
      width: 32,
      height: 32,
      z: cy - 118,
    },
    {
      id: `${prefix}_lobster`,
      type: "lobster",
      x: cx + 150,
      y: cy + 50,
      width: 64,
      height: 64,
      z: cy + 114,
    },
    {
      id: `${prefix}_variant`,
      type: variant.item,
      x: cx + 130,
      y: cy - 170,
      width: vw,
      height: vh,
      z: cy - 170 + vh,
    },
  ];
  return objects;
}

function createEmployeeRoomCenters(count: number) {
  const centers: Array<{ x: number; y: number }> = [];
  if (count <= 0) return centers;

  const marginX = ROOM_SIZE_W / 2 + 30;
  const marginY = ROOM_SIZE_H / 2 + 30;
  const maxGridX = Math.floor((MAP_CONFIG.width / 2 - marginX) / ROOM_SIZE_W);
  const maxGridY = Math.floor((MAP_CONFIG.height / 2 - marginY) / ROOM_SIZE_H);

  let ring = 1;
  while (centers.length < count) {
    const layerCells: Array<{ gx: number; gy: number }> = [];
    for (let gy = -ring; gy <= ring; gy += 1) {
      for (let gx = -ring; gx <= ring; gx += 1) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
        layerCells.push({ gx, gy });
      }
    }
    layerCells.sort((a, b) => {
      const da = Math.abs(a.gx) + Math.abs(a.gy);
      const db = Math.abs(b.gx) + Math.abs(b.gy);
      return da - db;
    });

    let appended = false;
    for (const cell of layerCells) {
      if (centers.length >= count) break;
      if (Math.abs(cell.gx) > maxGridX || Math.abs(cell.gy) > maxGridY) continue;
      centers.push({
        x: CENTER_X + cell.gx * ROOM_SIZE_W,
        y: CENTER_Y + cell.gy * ROOM_SIZE_H,
      });
      appended = true;
    }

    if (!appended && ring > Math.max(maxGridX, maxGridY) + 2) {
      break;
    }
    ring += 1;
  }

  if (centers.length < count) {
    let fallbackIndex = 0;
    while (centers.length < count) {
      const rawX = CENTER_X + ((fallbackIndex % 2 === 0 ? 1 : -1) * (ROOM_SIZE_W + 120) * (fallbackIndex + 1));
      const rawY = CENTER_Y + ((fallbackIndex % 3 === 0 ? 1 : -1) * (ROOM_SIZE_H + 80) * Math.max(1, Math.floor(fallbackIndex / 2)));
      const x = Math.max(marginX, Math.min(MAP_CONFIG.width - marginX, rawX));
      const y = Math.max(marginY, Math.min(MAP_CONFIG.height - marginY, rawY));
      centers.push({ x, y });
      fallbackIndex += 1;
    }
  }

  return centers;
}

function clampPosition(x: number, y: number, viewportW: number, viewportH: number) {
  const minX = Math.min(0, viewportW - MAP_CONFIG.width);
  const minY = Math.min(0, viewportH - MAP_CONFIG.height);
  const maxX = 0;
  const maxY = 0;
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  };
}

function RelayRoomMap({
  boss,
  employees,
  memoCounts,
  selectedEmployeeId,
  onSelectEmployee,
}: RelayRoomMapProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ startClientX: 0, startClientY: 0, startX: 0, startY: 0 });
  const [viewport, setViewport] = useState({ width: 960, height: 620 });
  const [position, setPosition] = useState(() =>
    clampPosition(
      -MAP_CONFIG.width / 2 + 960 / 2,
      -MAP_CONFIG.height / 2 + 620 / 2,
      960,
      620,
    ),
  );
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(360, Math.floor(entry.contentRect.width));
      const height = Math.max(420, Math.floor(entry.contentRect.height));
      setViewport({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPosition((prev) => clampPosition(prev.x, prev.y, viewport.width, viewport.height));
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - dragRef.current.startClientX;
      const dy = event.clientY - dragRef.current.startClientY;
      setPosition(
        clampPosition(
          dragRef.current.startX + dx,
          dragRef.current.startY + dy,
          viewport.width,
          viewport.height,
        ),
      );
    };
    const onMouseUp = () => setIsDragging(false);
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 0) return;
      const touch = event.touches[0];
      const dx = touch.clientX - dragRef.current.startClientX;
      const dy = touch.clientY - dragRef.current.startClientY;
      setPosition(
        clampPosition(
          dragRef.current.startX + dx,
          dragRef.current.startY + dy,
          viewport.width,
          viewport.height,
        ),
      );
    };
    const onTouchEnd = () => setIsDragging(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isDragging, viewport.height, viewport.width]);

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = {
      startClientX: clientX,
      startClientY: clientY,
      startX: position.x,
      startY: position.y,
    };
    setIsDragging(true);
  };

  const sceneObjects = useMemo(() => {
    const objects: SceneObject[] = [];

    const roomLayouts: RoomLayout[] = [
      {
        id: "boss_center",
        centerX: CENTER_X,
        centerY: CENTER_Y,
        width: ROOM_SIZE_W,
        height: ROOM_SIZE_H,
        doors: ["north", "south", "west", "east"],
      },
    ];

    const centers = createEmployeeRoomCenters(employees.length);
    employees.forEach((employee, index) => {
      const center = centers[index];
      roomLayouts.push({
        id: `employee_${employee.id}`,
        centerX: center.x,
        centerY: center.y,
        width: ROOM_SIZE_W,
        height: ROOM_SIZE_H,
        doors: getDoorTowardsCenter(center.x, center.y),
      });
    });

    roomLayouts.forEach((room) => {
      objects.push(...generateStoneRoomWalls(room, roomLayouts));
    });

    objects.push(...createRoomInterior(CENTER_X, CENTER_Y, "boss_room", null, 0, false, 0));
    objects.push(
      {
        id: "boss_sign",
        type: "/room-assets/competition_board.png",
        x: CENTER_X - 64,
        y: CENTER_Y - 110,
        width: 128,
        height: 128,
        z: CENTER_Y + 18,
      },
      {
        id: "boss_mailbox",
        type: "/room-assets/mailbox.png",
        x: CENTER_X - 160,
        y: CENTER_Y + 10,
        width: 32,
        height: 64,
        z: CENTER_Y + 74,
      },
    );

    employees.forEach((employee, index) => {
      const center = centers[index];
      const roomPrefix = `employee_${employee.id}`;
      objects.push(
        ...createRoomInterior(
          center.x,
          center.y,
          roomPrefix,
          employee.id,
          memoCounts[employee.id] ?? 0,
          selectedEmployeeId === employee.id,
          index + 1,
        ),
      );
      objects.push({
        id: `${roomPrefix}_status_flag`,
        type: "/room-assets/flag.png",
        x: center.x - 300,
        y: center.y - 200,
        width: 48,
        height: 64,
        z: center.y - 136,
      });
    });

    return objects.sort((a, b) => a.z - b.z);
  }, [employees, memoCounts, selectedEmployeeId]);

  const roomLabel = boss?.name || "OpenClaw";

  return (
    <div className="game-wrapper room-game-wrapper">
      <div className="ui-overlay">
        <div className="ui-panel pixel-border">
          Coordinates: {Math.round(-position.x)}, {Math.round(-position.y)}
        </div>
        <div className="ui-panel pixel-border">
          {roomLabel} HQ + {employees.length} Mimiclaw rooms
        </div>
      </div>

      <div
        className="game-viewport room-viewport"
        ref={viewportRef}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-interactive='desk']")) return;
          startDrag(event.clientX, event.clientY);
        }}
        onTouchStart={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-interactive='desk']")) return;
          if (event.touches.length === 0) return;
          const touch = event.touches[0];
          startDrag(touch.clientX, touch.clientY);
        }}
      >
        <div className="world-map-container" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
          <div
            className="world-map-plane room-world-plane"
            style={{
              width: `${MAP_CONFIG.width}px`,
              height: `${MAP_CONFIG.height}px`,
              backgroundImage: `url(${MAP_CONFIG.backgroundAsset})`,
              backgroundSize: "128px 128px",
              cursor: isDragging ? "grabbing" : "grab",
            }}
          >
            {sceneObjects.map((obj) => {
              if (obj.type === "lobster") {
                return (
                  <div
                    key={obj.id}
                    className="lobster-character lobster-bounce"
                    style={{
                      left: `${obj.x}px`,
                      top: `${obj.y}px`,
                      width: `${obj.width}px`,
                      height: `${obj.height}px`,
                      pointerEvents: "none",
                    }}
                  >
                    <div className="pixel-lobster" />
                  </div>
                );
              }

              if (obj.interactive && obj.employeeId) {
                return (
                  <button
                    key={obj.id}
                    type="button"
                    data-interactive="desk"
                    className={`desk-hitbox ${obj.selected ? "selected" : ""}`}
                    style={{
                      left: `${obj.x}px`,
                      top: `${obj.y}px`,
                      width: `${obj.width}px`,
                      height: `${obj.height}px`,
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEmployee(obj.employeeId as string);
                    }}
                    title="Open meeting notes"
                  >
                    <img
                      src={obj.type}
                      alt={obj.id}
                      className="map-object desk-object"
                      style={{ width: `${obj.width}px`, height: `${obj.height}px` }}
                    />
                    <span className="desk-note-badge">{obj.noteCount ?? 0}</span>
                  </button>
                );
              }

              return (
                <img
                  key={obj.id}
                  src={obj.type}
                  alt={obj.id}
                  className="map-object room-object"
                  style={{
                    position: "absolute",
                    left: `${obj.x}px`,
                    top: `${obj.y}px`,
                    width: `${obj.width}px`,
                    height: `${obj.height}px`,
                    imageRendering: "pixelated",
                    pointerEvents: "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RelayRoomMap;
