/**
 * Scrapes the World Skate Games 2026 speed results from Vensport and writes
 * public/data/results.json for the static web app.
 *
 * Vensport does not send CORS headers, so the browser can't fetch it directly;
 * this script runs in GitHub Actions before each deploy instead.
 *
 * Usage: npm run scrape [-- --out path/to/results.json]
 */
import { load, type CheerioAPI } from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Dataset, Race, ResultRow, Round, Season } from "../src/types.ts";

const BASE = "https://worldskatespeed.vensport.com";
/**
 * Extra division ids to start crawling from, in case a season is not (yet)
 * linked from the home page. Any division of a season is enough: its siblings
 * are discovered from the navigation.
 */
const EXTRA_SEED_DIVISIONS: number[] = [
  162078, // JR WOMEN TRACK
  162093, // JR MEN TRACK
  162108, // SR WOMEN TRACK
  162118, // SR MEN TRACK
  162225, // marathon
];

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "public/data/results.json";
/**
 * Previous results used as a fallback: races that are already complete are
 * not fetched again, and races that fail to load keep their previous data.
 * Defaults to the output file itself.
 */
const prevArg = process.argv.indexOf("--previous");
const PREVIOUS = prevArg > -1 ? process.argv[prevArg + 1] : OUT;

/** Vensport rate-limits (HTTP 429), so requests are spaced out. */
const REQUEST_GAP_MS = 1500;
let lastRequest = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(path: string): Promise<CheerioAPI> {
  for (let attempt = 1; ; attempt++) {
    await sleep(Math.max(0, lastRequest + REQUEST_GAP_MS - Date.now()));
    lastRequest = Date.now();
    let retryAfterMs = 0;
    try {
      const res = await fetch(BASE + path, {
        headers: { "User-Agent": "WSG26-results-exporter (+github.com/TimoLehnertz/WSG26-Speed-results-exporter)" },
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        retryAfterMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 0;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return load(await res.text());
    } catch (e) {
      if (attempt >= 6) throw e;
      const wait = Math.max(retryAfterMs, 2000 * 2 ** attempt);
      console.warn(`  ${(e as Error).message}, retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

async function loadPrevious(): Promise<{ seasons: Season[]; races: Map<number, Race> }> {
  const races = new Map<number, Race>();
  let seasons: Season[] = [];
  try {
    seasons = (JSON.parse(await readFile(PREVIOUS, "utf8")) as Dataset).seasons;
    for (const s of seasons) for (const r of s.races) races.set(r.id, r);
    console.log(`Loaded ${races.size} races from ${PREVIOUS}`);
  } catch {
    console.log(`No previous results at ${PREVIOUS}`);
  }
  return { seasons, races };
}

/** A race that is published with a final ranking and unchanged since the previous scrape. */
function isUnchanged(prev: Race | undefined, entry: NavEntry): prev is Race {
  return (
    !!prev &&
    prev.published &&
    entry.published &&
    prev.publishedAt === entry.publishedAt &&
    prev.rounds.some((r) => r.isFinalRanking && !r.derived && r.results.length > 0)
  );
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
}

function parseSeasonMeta(name: string, firstRaceName: string) {
  const n = ` ${name.toUpperCase()} `;
  const r = firstRaceName.toUpperCase();
  let category = "";
  const trackRoad: Season["trackRoad"] = / (ROAD|MARATHON) /.test(n) ? "Road" : "Track";
  // Mixed seasons (the marathon): category and gender are set per race.
  if (/ OPEN /.test(n)) return { category: "Open", gender: "" as Season["gender"], trackRoad };
  if (/ (JR|JUNIOR|JUN) /.test(n) || r.startsWith("JUNIOR")) category = "Junior";
  else if (/ (SR|SENIOR|SEN) /.test(n) || r.startsWith("SENIOR")) category = "Senior";
  else if (/ (MASTER|MASTERS) /.test(n)) category = "Masters";
  else if (/ (YOUTH) /.test(n)) category = "Youth";
  else category = "Senior";
  let gender: Season["gender"] = "";
  if (/ (WOMEN|LADIES|FEMALE|W) /.test(n) || / WOMEN /.test(` ${r} `)) gender = "w";
  else if (/ (MEN|MALE|M) /.test(n) || / MEN /.test(` ${r} `)) gender = "m";
  return { category, gender, trackRoad };
}

const RACE_PREFIX = /^(junior|senior|youth|pro|masters?(?:\s*\d+\+?)?|open)\s+(women|men|ladies|mixed)\s+/i;

const tidy = (t: string) => (t === t.toUpperCase() ? titleCase(t) : t);

/**
 * Title, distance, category and gender of a race. Normally the season names the
 * category and gender ("SR MEN TRACK"), so the title drops them: "senior Men
 * 1.000m Sprint" -> "1.000m Sprint". In mixed seasons like the marathon they
 * differ per race, so the title keeps them: "Master 30 Women Marathon".
 */
function raceInfo(name: string, seasonHasGender: boolean): Pick<Race, "title" | "distance" | "category" | "gender"> {
  const full = clean(name);
  const m = full.match(RACE_PREFIX);
  const rest = tidy(clean(full.replace(RACE_PREFIX, "")));
  if (!m || seasonHasGender) return { title: rest };
  const level = titleCase(m[1]).replace(/\s+/g, " ");
  return {
    title: `${level} ${titleCase(m[2])} ${rest}`,
    distance: rest,
    category: /^pro$/i.test(level) ? "Senior" : level,
    gender: /^(women|ladies)$/i.test(m[2]) ? "w" : /^men$/i.test(m[2]) ? "m" : "",
  };
}

function parseRounds($: CheerioAPI): Round[] {
  const rounds: Round[] = [];
  $(".race-competitions-with-rounds-card").each((_, card) => {
    const c = $(card);
    const name = clean(c.find(".small-bottom b").first().text());
    const table = c.find("table.race-standings-table").first();
    if (!name || !table.length) return;
    const scoreLabel = clean(table.find("th.race-col-score").text()) || "Time";
    const results: ResultRow[] = [];
    table.find("tbody tr").each((_, tr) => {
      const row = $(tr);
      const cell = (cls: string) => clean(row.find(`td.race-col-${cls}`).text());
      const flag = row.find("td.race-col-name img").first();
      const flagAlt = clean(flag.attr("alt") ?? "").replace(/\s+flag$/i, "");
      const code = (flag.attr("src") ?? "").match(/\/([a-z]{2})\.png/i)?.[1]?.toLowerCase() ?? "";
      const placeText = cell("placement");
      const place = /^\d+$/.test(placeText) ? parseInt(placeText, 10) : null;
      const name = cell("name");
      if (!name && !cell("race-number")) return;
      // Without a flag the club column holds the country, or a team in the marathon.
      const club = titleCase(cell("club"));
      const isTeam = !flagAlt && /\bteam\b/i.test(club);
      results.push({
        place,
        bib: cell("race-number"),
        name,
        country: flagAlt || (isTeam ? "" : club),
        countryCode: code,
        ...(isTeam ? { team: club } : {}),
        score: cell("score"),
        sanction: cell("sanction"),
        qualified: cell("qualified"),
        progression: cell("progression"),
      });
    });
    rounds.push({ name, isFinalRanking: /final rankings?/i.test(name), scoreLabel, results });
  });
  const derived = deriveRanking(rounds);
  if (derived) rounds.unshift(derived);
  return rounds;
}

function seconds(score: string): number {
  const m = score.trim().match(/^(?:(\d+):)?(\d+)(?:\.(\d+))?$/);
  if (!m) return Infinity;
  const v = parseInt(m[1] ?? "0", 10) * 60 + parseInt(m[2], 10) + parseFloat(`0.${m[3] ?? "0"}`);
  return v > 0 ? v : Infinity;
}

/**
 * Builds a final ranking from the heats when Vensport has none, the way Vensport
 * ranks sprint races: the final by place, then the skaters eliminated in each
 * earlier round by time (by place for points rounds). Only done once a final has
 * results, so races that are still running don't get a ranking.
 */
function deriveRanking(rounds: Round[]): Round | null {
  if (rounds.some((r) => r.isFinalRanking && r.results.length)) return null;
  const stages: { name: string; heats: Round[] }[] = [];
  for (const r of rounds) {
    if (!r.results.length) continue;
    const name = r.name.split(" - ")[0];
    if (stages.at(-1)?.name !== name) stages.push({ name, heats: [] });
    stages.at(-1)!.heats.push(r);
  }
  if (!stages.length || !/final/i.test(stages[0].name)) return null;
  const seen = new Set<string>();
  const results: ResultRow[] = [];
  stages.forEach(({ name, heats }, i) => {
    const byPlace = i === 0 || heats.some((h) => /point/i.test(h.scoreLabel));
    const rows = heats.flatMap((h) => h.results).filter((r) => !seen.has(r.bib || r.name));
    rows.sort(
      (a, b) =>
        Number(a.place === null) - Number(b.place === null) ||
        (byPlace ? (a.place ?? 0) - (b.place ?? 0) : 0) ||
        seconds(a.score) - seconds(b.score),
    );
    for (const r of rows) {
      seen.add(r.bib || r.name);
      results.push({ ...r, qualified: "", progression: name });
    }
  });
  let place = 0;
  for (const r of results) r.place = r.place === null ? null : ++place;
  return { name: "Final Rankings", isFinalRanking: true, derived: true, scoreLabel: stages[0].heats[0].scoreLabel, results };
}

interface NavEntry {
  id: number;
  name: string;
  published: boolean;
  publishedAt: string | null;
}

function parseNav($: CheerioAPI): NavEntry[] {
  const entries: NavEntry[] = [];
  $("#secondary-nav a[href^='/divisions/']").each((_, a) => {
    const el = $(a);
    const id = parseInt(el.attr("href")!.split("/")[2], 10);
    if (!id) return;
    const publishedAt = clean(el.find("small").text()) || null;
    entries.push({
      id,
      name: clean(el.find("p").first().text()),
      published: !el.hasClass("unpublished"),
      publishedAt,
    });
  });
  return entries;
}

async function main() {
  const { seasons: previousSeasons, races: previous } = await loadPrevious();
  const seeds = new Set<number>();
  try {
    const home = await fetchHtml("/");
    home("a[href^='/divisions/']").each((_, a) => {
      const id = parseInt(home(a).attr("href")!.split("/")[2], 10);
      if (id) seeds.add(id);
    });
  } catch (e) {
    console.warn(`Home page failed: ${(e as Error).message}`);
  }
  for (const id of EXTRA_SEED_DIVISIONS) seeds.add(id);

  const seasons: Season[] = [];
  const seen = new Set<number>();
  let failures = 0;

  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    let seedPage: CheerioAPI;
    try {
      seedPage = await fetchHtml(`/divisions/${seed}`);
    } catch (e) {
      console.warn(`Season of division ${seed} failed: ${(e as Error).message}`);
      failures++;
      continue;
    }
    const seasonId = parseInt(seedPage("body").attr("data-season-id") ?? "0", 10);
    const seasonName = clean(seedPage("h1").first().contents().first().text()) || `Season ${seasonId}`;
    const nav = parseNav(seedPage);
    if (!nav.some((n) => n.id === seed)) nav.push({ id: seed, name: clean(seedPage("h3").first().text()), published: true, publishedAt: null });

    const seasonMeta = parseSeasonMeta(seasonName, nav[0]?.name ?? "");
    const seasonHasGender = / (WOMEN|LADIES|FEMALE|MEN|MALE) /.test(` ${seasonName.toUpperCase()} `);
    const races: Race[] = [];
    for (const entry of nav) {
      seen.add(entry.id);
      const prev = previous.get(entry.id);
      if (entry.id !== seed && isUnchanged(prev, entry)) {
        races.push({ ...prev, name: entry.name, ...raceInfo(entry.name, seasonHasGender) });
        console.log(`  ${seasonName} / ${entry.name}: unchanged`);
        continue;
      }
      let rounds: Round[];
      try {
        rounds = parseRounds(entry.id === seed ? seedPage : await fetchHtml(`/divisions/${entry.id}`));
      } catch (e) {
        failures++;
        console.warn(`  ${seasonName} / ${entry.name}: ${(e as Error).message}${prev ? ", keeping previous data" : ""}`);
        if (prev) races.push(prev);
        continue;
      }
      races.push({
        id: entry.id,
        name: entry.name,
        ...raceInfo(entry.name, seasonHasGender),
        published: entry.published,
        publishedAt: entry.publishedAt,
        rounds,
      });
      console.log(`  ${seasonName} / ${entry.name}: ${rounds.length} rounds`);
    }
    seasons.push({ id: seasonId, name: seasonName, ...seasonMeta, races });
  }

  // Keep seasons that could not be loaded this time.
  for (const s of previousSeasons) {
    if (!seasons.some((n) => n.id === s.id) && !s.races.some((r) => seen.has(r.id))) {
      console.warn(`Keeping previous data for ${s.name}`);
      seasons.push(s);
    }
  }
  if (seasons.length === 0) throw new Error("No seasons could be loaded");
  if (failures) console.warn(`${failures} page(s) failed to load`);

  const data: Dataset = {
    competition: "World Skate Games 2026 Asunción – Speed",
    source: BASE,
    scrapedAt: new Date().toISOString(),
    seasons,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  const raceCount = seasons.reduce((n, s) => n + s.races.length, 0);
  console.log(`Wrote ${OUT}: ${seasons.length} seasons, ${raceCount} races`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
