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
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Dataset, Race, ResultRow, Round, Season } from "../src/types.ts";

const BASE = "https://worldskatespeed.vensport.com";
/**
 * Extra division ids to start crawling from, in case a season is not (yet)
 * linked from the home page. Any division of a season is enough: its siblings
 * are discovered from the navigation.
 */
const EXTRA_SEED_DIVISIONS: number[] = [];

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "public/data/results.json";

async function fetchHtml(path: string): Promise<CheerioAPI> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        headers: { "User-Agent": "WSG26-results-exporter (+github.com/TimoLehnertz/WSG26-Speed-results-exporter)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return load(await res.text());
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
}

function parseSeasonMeta(name: string, firstRaceName: string) {
  const n = ` ${name.toUpperCase()} `;
  const r = firstRaceName.toUpperCase();
  let category = "";
  if (/ (JR|JUNIOR|JUN) /.test(n) || r.startsWith("JUNIOR")) category = "Junior";
  else if (/ (SR|SENIOR|SEN) /.test(n) || r.startsWith("SENIOR")) category = "Senior";
  else if (/ (MASTER|MASTERS) /.test(n)) category = "Masters";
  else if (/ (YOUTH) /.test(n)) category = "Youth";
  else category = "Senior";
  let gender: Season["gender"] = "";
  if (/ (WOMEN|LADIES|FEMALE|W) /.test(n) || / WOMEN /.test(` ${r} `)) gender = "w";
  else if (/ (MEN|MALE|M) /.test(n) || / MEN /.test(` ${r} `)) gender = "m";
  const trackRoad: Season["trackRoad"] = / (ROAD|MARATHON) /.test(n) ? "Road" : "Track";
  return { category, gender, trackRoad };
}

/** Strip the "junior Women " prefix from a division name. */
function raceTitle(name: string) {
  return clean(name.replace(/^(junior|senior|youth|masters?|open)\s+(women|men|ladies|mixed)\s+/i, ""));
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
      results.push({
        place,
        bib: cell("race-number"),
        name,
        country: flagAlt || titleCase(cell("club")),
        countryCode: code,
        score: cell("score"),
        sanction: cell("sanction"),
        qualified: cell("qualified"),
        progression: cell("progression"),
      });
    });
    rounds.push({ name, isFinalRanking: /final rankings?/i.test(name), scoreLabel, results });
  });
  return rounds;
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
  const home = await fetchHtml("/");
  const seeds = new Set<number>(EXTRA_SEED_DIVISIONS);
  home("a[href^='/divisions/']").each((_, a) => {
    const id = parseInt(home(a).attr("href")!.split("/")[2], 10);
    if (id) seeds.add(id);
  });

  const seasons: Season[] = [];
  const seen = new Set<number>();

  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    const seedPage = await fetchHtml(`/divisions/${seed}`);
    const seasonId = parseInt(seedPage("body").attr("data-season-id") ?? "0", 10);
    const seasonName = clean(seedPage("h1").first().contents().first().text()) || `Season ${seasonId}`;
    const nav = parseNav(seedPage);
    if (!nav.some((n) => n.id === seed)) nav.push({ id: seed, name: clean(seedPage("h3").first().text()), published: true, publishedAt: null });

    const races: Race[] = [];
    for (const entry of nav) {
      seen.add(entry.id);
      const $ = entry.id === seed ? seedPage : await fetchHtml(`/divisions/${entry.id}`);
      races.push({
        id: entry.id,
        name: entry.name,
        title: raceTitle(entry.name),
        published: entry.published,
        publishedAt: entry.publishedAt,
        rounds: parseRounds($),
      });
      console.log(`  ${seasonName} / ${entry.name}: ${races.at(-1)!.rounds.length} rounds`);
    }
    seasons.push({ id: seasonId, name: seasonName, ...parseSeasonMeta(seasonName, nav[0]?.name ?? ""), races });
  }

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
