// Conversion of scraped races into the roller-results.com import format.
// Format reference: https://www.roller-results.com/tools/import-project.php
// and the preset sheet https://www.roller-results.com/tools/import-preset.xlsx

import * as XLSX from "xlsx";
import type { Race, ResultRow, Round, Season } from "./types";

/** Column order of the roller-results import preset (import-preset.xlsx). */
export const RR_COLUMNS = [
  "distance",
  "isRelay",
  "gender",
  "category",
  "youtubeLink",
  "trackRoad",
  "startNumber",
  "firstName",
  "lastName",
  "fullName",
  "country",
  "club",
  "team",
  "place",
  "points",
  "remark",
  "time",
  "disqualificationTechnical",
  "disqualificationSportsFault",
  "falseStart",
  "didNotStart",
  "round",
  "laps",
  "DRIVlicence",
] as const;

export type RRColumn = (typeof RR_COLUMNS)[number];
export type RRRow = Partial<Record<RRColumn, string | number>>;

/** Race level fields the user can adjust before exporting. */
export interface RaceExportSettings {
  distance: string;
  category: string;
  gender: string;
  trackRoad: string;
  isRelay: string;
  round: string;
}

export interface RaceRef {
  season: Season;
  race: Race;
}

export function finalRanking(race: Race): Round | undefined {
  return race.rounds.find((r) => r.isFinalRanking && r.results.length > 0);
}

export function raceStatus(race: Race): "official" | "live" | "empty" {
  if (finalRanking(race)) return "official";
  if (race.rounds.some((r) => r.results.length > 0)) return "live";
  return "empty";
}

/** "10.000m Elimination" -> "10000m Elimination", "1.000m Sprint" -> "1000m Sprint" */
export function normalizeDistance(title: string): string {
  let d = title.replace(/(\d)[.,](\d{3})/g, "$1$2").replace(/\s+/g, " ").trim();
  if (/relay/i.test(d) && !/\d/.test(d)) d = "Relay";
  return d;
}

export function defaultSettings({ season, race }: RaceRef): RaceExportSettings {
  return {
    distance: normalizeDistance(race.title),
    category: season.category,
    gender: season.gender,
    trackRoad: season.trackRoad,
    isRelay: /relay/i.test(race.title) ? "1" : "0",
    round: "Final",
  };
}

/**
 * Brings times into a format roller-results accepts (mm:ss.uuu / hh:mm:ss.uuu).
 * Returns "" for missing or zero times (Vensport shows 00:00.000 for DNF/DNS).
 */
export function normalizeTime(raw: string): string {
  const t = raw.trim().replace(",", ".");
  const m = t.match(/^(?:(\d{1,2}):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m || !/[:.]/.test(t)) return "";
  const parts = [m[1], m[2], m[3]].filter((p) => p !== undefined).map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h, min, s] = parts;
  const ms = (m[4] ?? "0").padEnd(3, "0");
  if (h === 0 && min === 0 && s === 0 && Number(ms) === 0) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p2(h)}:${p2(min)}:${p2(s)}.${ms}` : `${p2(min)}:${p2(s)}.${ms}`;
}

function sanctionFlags(sanction: string) {
  const codes = sanction.toUpperCase().split(/[\s,/]+/).filter(Boolean);
  const has = (re: RegExp) => codes.some((c) => re.test(c));
  return {
    disqualificationTechnical: has(/^DQ-?TF$/) ? "1" : "0",
    disqualificationSportsFault: has(/^DQ/) && !has(/^DQ-?TF$/) ? "1" : "0",
    falseStart: has(/^FS\d*$|^FALSE/) ? "1" : "0",
    didNotStart: has(/^DNS$/) ? "1" : "0",
  };
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: fullName.trim(), lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Rows of one race in roller-results format. */
export function raceToRows(ref: RaceRef, settings: RaceExportSettings): RRRow[] {
  const ranking = finalRanking(ref.race);
  if (!ranking) return [];
  const isPoints = /point/i.test(ranking.scoreLabel);
  const isTime = /time/i.test(ranking.scoreLabel);
  // roller-results requires a numeric place: unplaced skaters (e.g. disqualified) go to the back.
  let nextPlace = Math.max(0, ...ranking.results.map((r) => r.place ?? 0)) + 1;
  return ranking.results.map((r: ResultRow) => {
    const place = r.place ?? nextPlace++;
    const row: RRRow = {
      distance: settings.distance,
      isRelay: settings.isRelay,
      gender: settings.gender,
      category: settings.category,
      trackRoad: settings.trackRoad,
      startNumber: r.bib,
      fullName: r.name,
      country: r.country,
      place,
      remark: r.sanction,
      round: settings.round,
      ...sanctionFlags(r.sanction),
    };
    if (isPoints && /^\d+$/.test(r.score)) row.points = Number(r.score);
    if (isTime) {
      const time = normalizeTime(r.score);
      if (time) row.time = time;
    }
    return row;
  });
}

function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadXlsx(rows: RRRow[], filename: string) {
  // Every value except place/points is written as text: roller-results validates
  // e.g. time, startNumber and the 0/1 flags as strings.
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...RR_COLUMNS] });
  sheet["!cols"] = RR_COLUMNS.map((c) => ({ wch: c === "fullName" || c === "distance" ? 26 : Math.max(8, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "results");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(out, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export function downloadJson(rows: RRRow[], filename: string) {
  download(JSON.stringify(rows, null, 2), filename, "application/json");
}
