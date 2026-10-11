import { finalRanking, raceStatus } from "../export";
import { seasonLabel, type TreeNode } from "../tree";
import type { Dataset, Race, Season } from "../types";
import { Flag, StatusBadge } from "./common";

interface Props {
  data: Dataset;
  node: TreeNode;
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  onOpen: (id: string) => void;
  onExport: (raceIds: number[]) => void;
}

function Podium({ race }: { race: Race }) {
  const ranking = finalRanking(race);
  if (!ranking) return <span className="muted">–</span>;
  return (
    <span className="podium">
      {ranking.results
        .filter((r) => r.place && r.place <= 3)
        .slice(0, 3)
        .map((r) => (
          <span key={r.bib} className="podium-entry" title={`${r.place}. ${r.name} (${r.country})`}>
            <span className={`medal m${r.place}`}>{r.place}</span>
            <Flag code={r.countryCode} title={r.country} />
            {r.name}
          </span>
        ))}
    </span>
  );
}

function RaceTable({ season, selected, setSelected, onOpen }: { season: Season } & Omit<Props, "data" | "node" | "onExport">) {
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  return (
    <table className="details">
      <thead>
        <tr>
          <th className="check" />
          <th>Race</th>
          <th>Status</th>
          <th>Podium</th>
        </tr>
      </thead>
      <tbody>
        {season.races.map((race) => (
          <tr key={race.id} className={selected.has(race.id) ? "selected" : ""} onClick={() => onOpen(`r:${race.id}`)}>
            <td className="check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected.has(race.id)} onChange={() => toggle(race.id)} aria-label={`Select ${race.title}`} />
            </td>
            <td className="race-name">
              <span className={`icon race ${raceStatus(race)}`} />
              {race.title}
            </td>
            <td>
              <StatusBadge status={raceStatus(race)} />
            </td>
            <td>
              <Podium race={race} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FolderView({ data, node, selected, setSelected, onOpen, onExport }: Props) {
  const seasons = node.kind === "season" ? [node.season!] : data.seasons;
  const races = seasons.flatMap((s) => s.races);
  const official = races.filter((r) => raceStatus(r) === "official").length;
  const live = races.filter((r) => raceStatus(r) === "live").length;

  return (
    <div className="folder-view">
      <header className="view-header">
        <div>
          <div className="eyebrow">{node.kind === "root" ? "Competition" : "Category"}</div>
          <h1>{node.kind === "root" ? data.competition : node.label}</h1>
          <div className="meta">
            <span>{races.length} races</span>
            <span>{official} with final ranking</span>
            {live > 0 && <span>{live} in progress</span>}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => onExport(races.map((r) => r.id))}
          disabled={official === 0}
        >
          Export all {node.kind === "root" ? "" : "in folder "}…
        </button>
      </header>
      {seasons.map((s) => (
        <section key={s.id} className="card">
          {node.kind === "root" && (
            <h2 className="link" onClick={() => onOpen(`s:${s.id}`)}>
              {seasonLabel(s)}
            </h2>
          )}
          <RaceTable season={s} selected={selected} setSelected={setSelected} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
}
