import { useMemo, useState } from "react";
import { finalRanking, raceStatus } from "../export";
import type { Race, ResultRow, Round, Season } from "../types";
import { seasonLabel } from "../tree";
import { Flag, StatusBadge } from "./common";

interface Props {
  season: Season;
  race: Race;
  highlight: string;
  onExport: () => void;
}

/** "Qualification - Heat 3" -> ["Qualification", "Heat 3"] */
function splitRoundName(name: string): [string, string] {
  const i = name.indexOf(" - ");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 3)];
}

function matchesRow(r: ResultRow, q: string) {
  return !!q && (r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || r.bib === q);
}

function ResultsTable({ round, highlight, showProgress }: { round: Round; highlight: string; showProgress?: boolean }) {
  const hasSanctions = round.results.some((r) => r.sanction);
  const hasQualified = round.results.some((r) => r.qualified);
  const hasScore = round.results.some((r) => r.score);
  const hasProgress = showProgress && round.results.some((r) => r.progression);
  if (!round.results.length) return <div className="no-results">No results yet</div>;
  return (
    <table className="results">
      <thead>
        <tr>
          <th className="num">Pl.</th>
          <th className="num">Bib</th>
          <th>Name</th>
          <th>Country</th>
          {hasScore && <th className="num">{round.scoreLabel}</th>}
          {hasSanctions && <th>Sanction</th>}
          {hasQualified && <th />}
          {hasProgress && <th>Reached</th>}
        </tr>
      </thead>
      <tbody>
        {round.results.map((r, i) => (
          <tr
            key={`${r.bib}-${i}`}
            className={[
              round.isFinalRanking && r.place && r.place <= 3 ? `medal-${r.place}` : "",
              matchesRow(r, highlight) ? "hit" : "",
            ].join(" ")}
          >
            <td className="num place">
              {round.isFinalRanking && r.place && r.place <= 3 ? <span className={`medal m${r.place}`}>{r.place}</span> : r.place ?? "–"}
            </td>
            <td className="num muted">{r.bib}</td>
            <td className="name">{r.name}</td>
            <td className="country">
              <Flag code={r.countryCode} title={r.country} />
              {r.country}
            </td>
            {hasScore && <td className="num score">{r.score.replace(/^00:/, "")}</td>}
            {hasSanctions && <td>{r.sanction && <span className={`sanction ${/^DQ|DNS|DNF/.test(r.sanction) ? "bad" : ""}`}>{r.sanction}</span>}</td>}
            {hasQualified && <td>{r.qualified && <span className="qualified">{r.qualified}</span>}</td>}
            {hasProgress && <td className="muted">{r.progression}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RaceView({ season, race, highlight, onExport }: Props) {
  const q = highlight.trim().toLowerCase();
  const ranking = finalRanking(race);
  const status = raceStatus(race);
  const phases = useMemo(() => {
    const map = new Map<string, Round[]>();
    for (const r of race.rounds) {
      if (r.isFinalRanking) continue;
      const [phase] = splitRoundName(r.name);
      if (!map.has(phase)) map.set(phase, []);
      map.get(phase)!.push(r);
    }
    return [...map.entries()];
  }, [race]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  return (
    <div className="race-view">
      <header className="view-header">
        <div>
          <div className="eyebrow">{seasonLabel(season)}</div>
          <h1>{race.title}</h1>
          <div className="meta">
            <StatusBadge status={status} />
            {race.publishedAt && <span>Published {race.publishedAt}</span>}
            {ranking && <span>{ranking.results.length} skaters</span>}
            <a href={`https://worldskatespeed.vensport.com/divisions/${race.id}`} target="_blank" rel="noreferrer">
              View on Vensport ↗
            </a>
          </div>
        </div>
        <button className="btn primary" onClick={onExport} disabled={!ranking} title={ranking ? "" : "No final ranking available yet"}>
          Export this race…
        </button>
      </header>

      {ranking ? (
        <section className="card">
          <h2>Final ranking</h2>
          <ResultsTable round={ranking} highlight={q} showProgress />
        </section>
      ) : (
        <div className="notice">
          No final ranking has been published for this race yet{status === "live" ? " – the rounds below show the results so far." : "."}
        </div>
      )}

      {phases.map(([phase, rounds]) => {
        const isCollapsed = collapsed.has(phase);
        const filled = rounds.filter((r) => r.results.length).length;
        return (
          <section key={phase} className="phase">
            <h2
              className="phase-title"
              onClick={() => {
                const next = new Set(collapsed);
                if (isCollapsed) next.delete(phase);
                else next.add(phase);
                setCollapsed(next);
              }}
            >
              <span className={`chevron ${isCollapsed ? "right" : "down"}`} />
              {phase}
              <span className="phase-count">
                {rounds.length} {rounds.length === 1 ? "heat" : "heats"}
                {filled < rounds.length ? ` · ${filled} with results` : ""}
              </span>
            </h2>
            {!isCollapsed && (
              <div className="heats">
                {rounds.map((r) => (
                  <div key={r.name} className="card heat">
                    <h3>{splitRoundName(r.name)[1] || r.name}</h3>
                    <ResultsTable round={r} highlight={q} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
