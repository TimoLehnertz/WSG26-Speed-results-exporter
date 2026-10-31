import { useEffect, useState } from "react";
import {
  RR_COLUMNS,
  defaultSettings,
  downloadJson,
  downloadXlsx,
  finalRanking,
  raceToRows,
  type RaceExportSettings,
  type RaceRef,
} from "../export";
import { seasonLabel } from "../tree";

interface Props {
  refs: RaceRef[];
  onClose: () => void;
}

const STORAGE_KEY = "wsg26-export-settings";

function loadOverrides(): Record<number, Partial<RaceExportSettings>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveOverrides(o: Record<number, Partial<RaceExportSettings>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable – settings just won't persist */
  }
}

function slug(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function ExportDialog({ refs, onClose }: Props) {
  const exportable = refs.filter((r) => finalRanking(r.race));
  const skipped = refs.filter((r) => !finalRanking(r.race));
  const [overrides, setOverrides] = useState(loadOverrides);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => saveOverrides(overrides), [overrides]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const settingsFor = (ref: RaceRef): RaceExportSettings => ({ ...defaultSettings(ref), ...overrides[ref.race.id] });
  const update = (ref: RaceRef, patch: Partial<RaceExportSettings>) =>
    setOverrides((o) => ({ ...o, [ref.race.id]: { ...o[ref.race.id], ...patch } }));

  const included = exportable.filter((r) => !excluded.has(r.race.id));
  const rows = included.flatMap((ref) => raceToRows(ref, settingsFor(ref)));

  const baseName =
    included.length === 1
      ? `wsg2026-speed-${slug(included[0].race.name)}`
      : included.length === refs.length && refs.length > 6
        ? "wsg2026-speed-all-results"
        : `wsg2026-speed-${included.length}-races`;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="modal-header">
          <div>
            <h2 id="export-title">Export for roller-results</h2>
            <p className="muted">
              Creates a file for the{" "}
              <a href="https://www.roller-results.com/tools/import-project.php" target="_blank" rel="noreferrer">
                roller-results import tool
              </a>
              . Each race exports its final ranking. Check the race fields below – they decide how roller-results groups the results into races.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {exportable.length > 0 ? (
            <table className="export-table">
              <thead>
                <tr>
                  <th className="check">
                    <input
                      type="checkbox"
                      checked={excluded.size === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = excluded.size > 0 && excluded.size < exportable.length;
                      }}
                      onChange={() => setExcluded(excluded.size ? new Set() : new Set(exportable.map((r) => r.race.id)))}
                      aria-label="Include all"
                    />
                  </th>
                  <th>Race</th>
                  <th>distance</th>
                  <th>category</th>
                  <th>gender</th>
                  <th>trackRoad</th>
                  <th>isRelay</th>
                  <th>round</th>
                  <th className="num">Results</th>
                </tr>
              </thead>
              <tbody>
                {exportable.map((ref) => {
                  const s = settingsFor(ref);
                  const off = excluded.has(ref.race.id);
                  return (
                    <tr key={ref.race.id} className={off ? "excluded" : ""}>
                      <td className="check">
                        <input
                          type="checkbox"
                          checked={!off}
                          onChange={() => {
                            const next = new Set(excluded);
                            if (off) next.delete(ref.race.id);
                            else next.add(ref.race.id);
                            setExcluded(next);
                          }}
                          aria-label={`Include ${ref.race.name}`}
                        />
                      </td>
                      <td>
                        <div className="race-name">
                          {ref.race.title}
                          {finalRanking(ref.race)?.derived && <span className="derived-note small"> · ranking derived from heats</span>}
                        </div>
                        <div className="muted small">{seasonLabel(ref.season)}</div>
                      </td>
                      <td>
                        <input className="w-distance" value={s.distance} onChange={(e) => update(ref, { distance: e.target.value })} />
                      </td>
                      <td>
                        <input className="w-category" value={s.category} onChange={(e) => update(ref, { category: e.target.value })} />
                      </td>
                      <td>
                        <select value={s.gender} onChange={(e) => update(ref, { gender: e.target.value })}>
                          <option value="w">w</option>
                          <option value="m">m</option>
                        </select>
                      </td>
                      <td>
                        <select value={s.trackRoad} onChange={(e) => update(ref, { trackRoad: e.target.value })}>
                          <option>Track</option>
                          <option>Road</option>
                        </select>
                      </td>
                      <td>
                        <select value={s.isRelay} onChange={(e) => update(ref, { isRelay: e.target.value })}>
                          <option value="0">0</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                      <td>
                        <input className="w-round" value={s.round} onChange={(e) => update(ref, { round: e.target.value })} />
                      </td>
                      <td className="num">{finalRanking(ref.race)!.results.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="notice">None of the selected races has a final ranking yet, so there is nothing to export.</div>
          )}

          {skipped.length > 0 && (
            <div className="notice subtle">
              <b>{skipped.length} skipped</b> (no final ranking yet): {skipped.map((r) => `${seasonLabel(r.season)} ${r.race.title}`).join(", ")}
            </div>
          )}

          {Object.keys(overrides).length > 0 && (
            <button className="link-btn" onClick={() => setOverrides({})}>
              Reset edited fields to defaults
            </button>
          )}

          {rows.length > 0 && (
            <div className="preview">
              <button className="link-btn" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? "Hide" : "Show"} file preview ({rows.length} rows)
              </button>
              {showPreview && (
                <div className="preview-scroll">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {RR_COLUMNS.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 200).map((r, i) => (
                        <tr key={i}>
                          {RR_COLUMNS.map((c) => (
                            <td key={c}>{r[c] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 200 && <div className="muted small">… and {rows.length - 200} more rows</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <span className="muted">
            {included.length} {included.length === 1 ? "race" : "races"} · {rows.length} results
          </span>
          <div className="spacer" />
          <button className="btn" onClick={() => downloadJson(rows, `${baseName}.json`)} disabled={!rows.length}>
            Download .json
          </button>
          <button className="btn primary" onClick={() => downloadXlsx(rows, `${baseName}.xlsx`)} disabled={!rows.length}>
            Download .xlsx
          </button>
        </footer>
      </div>
    </div>
  );
}
