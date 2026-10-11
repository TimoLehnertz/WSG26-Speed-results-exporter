// Tree model for the explorer sidebar. Node ids: "root", "s:<seasonId>", "r:<raceId>".

import type { Dataset, Race, Season } from "./types";

export type NodeKind = "root" | "season" | "race";

export interface TreeNode {
  id: string;
  kind: NodeKind;
  label: string;
  depth: number;
  parent: string | null;
  children: string[];
  /** Race ids contained in (or equal to) this node. */
  raceIds: number[];
  season?: Season;
  race?: Race;
}

export function seasonLabel(s: Season): string {
  const gender = s.gender === "w" ? "Women" : s.gender === "m" ? "Men" : "";
  return [s.category, gender, s.trackRoad].filter(Boolean).join(" ");
}

export function buildTree(data: Dataset): Map<string, TreeNode> {
  const nodes = new Map<string, TreeNode>();
  const root: TreeNode = {
    id: "root",
    kind: "root",
    label: "WSG 2026 Speed",
    depth: 0,
    parent: null,
    children: [],
    raceIds: [],
  };
  nodes.set(root.id, root);
  for (const season of data.seasons) {
    const sid = `s:${season.id}`;
    const sNode: TreeNode = {
      id: sid,
      kind: "season",
      label: seasonLabel(season),
      depth: 1,
      parent: root.id,
      children: [],
      raceIds: [],
      season,
    };
    nodes.set(sid, sNode);
    root.children.push(sid);
    for (const race of season.races) {
      const rid = `r:${race.id}`;
      nodes.set(rid, {
        id: rid,
        kind: "race",
        label: race.title,
        depth: 2,
        parent: sid,
        children: [],
        raceIds: [race.id],
        season,
        race,
      });
      sNode.children.push(rid);
      sNode.raceIds.push(race.id);
      root.raceIds.push(race.id);
    }
  }
  return nodes;
}

/** Depth-first list of rows currently visible (respecting collapsed folders and the filter). */
export function visibleRows(
  nodes: Map<string, TreeNode>,
  expanded: Set<string>,
  matches: ((n: TreeNode) => boolean) | null,
): TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (id: string) => {
    const n = nodes.get(id)!;
    if (matches && n.kind === "race" && !matches(n)) return;
    if (matches && n.kind !== "race" && !n.raceIds.some((r) => matches(nodes.get(`r:${r}`)!))) return;
    out.push(n);
    if (n.children.length && (expanded.has(id) || matches)) n.children.forEach(visit);
  };
  visit("root");
  return out;
}
