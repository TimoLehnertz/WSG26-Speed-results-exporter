import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportDialog } from "./components/ExportDialog";
import { FolderView } from "./components/FolderView";
import { RaceView } from "./components/RaceView";
import { Sidebar } from "./components/Sidebar";
import type { RaceRef } from "./export";
import { buildTree, type TreeNode } from "./tree";
import type { Dataset } from "./types";

interface Props {
  data: Dataset;
}

function readHash(nodes: Map<string, TreeNode>) {
  const id = decodeURIComponent(location.hash.slice(1));
  return nodes.has(id) ? id : "root";
}

export function App({ data }: Props) {
  const nodes = useMemo(() => buildTree(data), [data]);
  const raceRefs = useMemo(() => {
    const m = new Map<number, RaceRef>();
    for (const season of data.seasons) for (const race of season.races) m.set(race.id, { season, race });
    return m;
  }, [data]);

  const [openId, setOpenId] = useState(() => readHash(nodes));
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [exportIds, setExportIds] = useState<number[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const open = useCallback((id: string) => {
    setOpenId(id);
    history.replaceState(null, "", id === "root" ? location.pathname : `#${id}`);
  }, []);

  useEffect(() => {
    const onHash = () => setOpenId(readHash(nodes));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [nodes]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const q = filter.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return (n: TreeNode) =>
      !!n.race &&
      (n.race.name.toLowerCase().includes(q) ||
        n.label.toLowerCase().includes(q) ||
        n.race.rounds.some((r) => r.results.some((x) => x.name.toLowerCase().includes(q) || x.country.toLowerCase().includes(q))));
  }, [q]);

  const node = nodes.get(openId)!;
  const breadcrumb: TreeNode[] = [];
  for (let n: TreeNode | undefined = node; n; n = n.parent ? nodes.get(n.parent) : undefined) breadcrumb.unshift(n);

  const exportRefs = exportIds?.map((id) => raceRefs.get(id)!).filter(Boolean) ?? [];
  const selectedCount = selected.size;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <div className="brand-title">WSG 2026 Speed Results</div>
            <div className="brand-sub">
              Data from{" "}
              <a href={data.source} target="_blank" rel="noreferrer">
                Vensport
              </a>{" "}
              · updated {new Date(data.scrapedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <nav className="breadcrumb" aria-label="Location">
          {breadcrumb.map((n, i) => (
            <span key={n.id}>
              {i > 0 && <span className="sep">›</span>}
              <button className="crumb" onClick={() => open(n.id)}>
                {n.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="selection-bar">
          <span className="muted">
            {selectedCount} {selectedCount === 1 ? "race" : "races"} selected
          </span>
          {selectedCount > 0 && (
            <button className="btn" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          )}
          <button className="btn" onClick={() => setSelected(new Set(nodes.get("root")!.raceIds))}>
            Select all
          </button>
          <button className="btn primary" disabled={!selectedCount} onClick={() => setExportIds([...selected])}>
            Export selected…
          </button>
        </div>
      </header>

      <div className="workspace">
        <Sidebar
          nodes={nodes}
          selected={selected}
          setSelected={setSelected}
          openId={openId}
          onOpen={open}
          filter={filter}
          setFilter={setFilter}
          matches={matches}
          onContextMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
        />
        <main className="content">
          {node.kind === "race" ? (
            <RaceView season={node.season!} race={node.race!} highlight={filter} onExport={() => setExportIds([node.race!.id])} />
          ) : (
            <FolderView
              data={data}
              node={node}
              selected={selected}
              setSelected={setSelected}
              onOpen={open}
              onExport={setExportIds}
            />
          )}
        </main>
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              open(menu.id);
              setMenu(null);
            }}
          >
            Open
          </button>
          <button
            onClick={() => {
              setExportIds([...selected]);
              setMenu(null);
            }}
          >
            Export selected ({selected.size})…
          </button>
          <button
            onClick={() => {
              setExportIds(nodes.get(menu.id)!.raceIds);
              setMenu(null);
            }}
          >
            Export “{nodes.get(menu.id)!.label}”…
          </button>
        </div>
      )}

      {exportIds && <ExportDialog refs={exportRefs} onClose={() => setExportIds(null)} />}
    </div>
  );
}
