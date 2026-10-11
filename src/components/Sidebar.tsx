import { useEffect, useMemo, useRef, useState } from "react";
import { raceStatus } from "../export";
import { visibleRows, type TreeNode } from "../tree";

interface Props {
  nodes: Map<string, TreeNode>;
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  openId: string;
  onOpen: (id: string) => void;
  filter: string;
  setFilter: (f: string) => void;
  matches: ((n: TreeNode) => boolean) | null;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

type CheckState = "all" | "some" | "none";

function checkState(n: TreeNode, selected: Set<number>): CheckState {
  if (!n.raceIds.length) return "none";
  const count = n.raceIds.filter((r) => selected.has(r)).length;
  return count === 0 ? "none" : count === n.raceIds.length ? "all" : "some";
}

export function Sidebar({ nodes, selected, setSelected, openId, onOpen, filter, setFilter, matches, onContextMenu }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root", ...nodes.get("root")!.children]));
  const [focusId, setFocusId] = useState(openId);
  const [anchorId, setAnchorId] = useState(openId);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => visibleRows(nodes, expanded, matches), [nodes, expanded, matches]);
  const indexOf = (id: string) => rows.findIndex((r) => r.id === id);

  // Keep the opened node visible and focused when it is opened from elsewhere (breadcrumb, folder view).
  useEffect(() => {
    setFocusId(openId);
    setExpanded((prev) => {
      let p = nodes.get(openId)?.parent;
      if (!p || prev.has(p)) return prev;
      const next = new Set(prev);
      for (; p; p = nodes.get(p)?.parent) next.add(p);
      return next;
    });
  }, [openId, nodes]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusId]);

  const toggleExpanded = (id: string, value?: boolean) => {
    const next = new Set(expanded);
    if (value ?? !next.has(id)) next.add(id);
    else next.delete(id);
    setExpanded(next);
  };

  const rangeIds = (fromId: string, toId: string) => {
    let a = indexOf(fromId);
    const b = indexOf(toId);
    if (a < 0) a = b;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return rows.slice(lo, hi + 1).flatMap((r) => r.raceIds);
  };

  const toggleNode = (n: TreeNode) => {
    const next = new Set(selected);
    const all = checkState(n, selected) === "all";
    for (const r of n.raceIds) (all ? next.delete(r) : next.add(r));
    setSelected(next);
  };

  const handleClick = (e: React.MouseEvent, n: TreeNode) => {
    listRef.current?.focus();
    setFocusId(n.id);
    if (e.shiftKey) {
      const ids = rangeIds(anchorId, n.id);
      setSelected(new Set(e.ctrlKey || e.metaKey ? [...selected, ...ids] : ids));
      return;
    }
    setAnchorId(n.id);
    if (e.ctrlKey || e.metaKey) {
      toggleNode(n);
      return;
    }
    setSelected(new Set(n.raceIds));
    onOpen(n.id);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const i = Math.max(0, indexOf(focusId));
    const cur = rows[i];
    const ctrl = e.ctrlKey || e.metaKey;
    const moveTo = (j: number) => {
      const target = rows[Math.min(rows.length - 1, Math.max(0, j))];
      if (!target) return;
      setFocusId(target.id);
      if (e.shiftKey) {
        setSelected(new Set(rangeIds(anchorId, target.id)));
      } else if (!ctrl) {
        setAnchorId(target.id);
        setSelected(new Set(target.raceIds));
        onOpen(target.id);
      }
    };
    switch (e.key) {
      case "ArrowDown":
        moveTo(i + 1);
        break;
      case "ArrowUp":
        moveTo(i - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(rows.length - 1);
        break;
      case "ArrowRight":
        if (cur.children.length && !expanded.has(cur.id)) toggleExpanded(cur.id, true);
        else if (cur.children.length) moveTo(i + 1);
        break;
      case "ArrowLeft":
        if (cur.children.length && expanded.has(cur.id)) toggleExpanded(cur.id, false);
        else if (cur.parent) moveTo(indexOf(cur.parent));
        break;
      case " ":
        toggleNode(cur);
        setAnchorId(cur.id);
        break;
      case "Enter":
        onOpen(cur.id);
        break;
      case "a":
      case "A":
        if (!ctrl) return;
        setSelected(new Set(nodes.get("root")!.raceIds));
        break;
      case "Escape":
        setSelected(new Set());
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <input
          type="search"
          placeholder="Filter races or athletes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter races or athletes"
        />
      </div>
      <div
        className="tree"
        role="tree"
        aria-multiselectable="true"
        tabIndex={0}
        ref={listRef}
        onKeyDown={handleKey}
      >
        {rows.map((n) => {
          const state = checkState(n, selected);
          const isFolder = n.kind !== "race";
          const isOpen = expanded.has(n.id) || !!matches;
          const status = n.race ? raceStatus(n.race) : null;
          return (
            <div
              key={n.id}
              data-id={n.id}
              role="treeitem"
              aria-selected={state === "all"}
              aria-expanded={isFolder ? isOpen : undefined}
              className={[
                "tree-row",
                state === "all" ? "selected" : "",
                state === "some" ? "partial" : "",
                n.id === openId ? "open" : "",
                n.id === focusId ? "focused" : "",
              ].join(" ")}
              style={{ paddingLeft: 6 + n.depth * 18 }}
              onClick={(e) => handleClick(e, n)}
              onDoubleClick={() => isFolder && !matches && toggleExpanded(n.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (state !== "all") {
                  setSelected(new Set(n.raceIds));
                  setAnchorId(n.id);
                }
                setFocusId(n.id);
                onContextMenu(e, n.id);
              }}
              title={n.race?.name ?? n.label}
            >
              <span
                className={`chevron ${isFolder ? (isOpen ? "down" : "right") : "none"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isFolder && !matches) toggleExpanded(n.id);
                }}
              />
              <input
                type="checkbox"
                className="tree-check"
                checked={state === "all"}
                ref={(el) => {
                  if (el) el.indeterminate = state === "some";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setAnchorId(n.id);
                  setFocusId(n.id);
                  toggleNode(n);
                }}
                onChange={() => {}}
                tabIndex={-1}
                aria-label={`Select ${n.label}`}
              />
              <span className={`icon ${isFolder ? (isOpen ? "folder-open" : "folder") : `race ${status}`}`} />
              <span className="tree-label">{n.label}</span>
              {isFolder && <span className="tree-count">{n.raceIds.length}</span>}
            </div>
          );
        })}
        {rows.length === 0 && <div className="tree-empty">No races match “{filter}”.</div>}
      </div>
      <div className="sidebar-hint">
        Click to open · Ctrl+click to toggle · Shift+click for a range · Ctrl+A selects all
      </div>
    </aside>
  );
}
