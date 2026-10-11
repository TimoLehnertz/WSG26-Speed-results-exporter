// Data model shared by the scraper (scripts/scrape.ts) and the web app.

export interface ResultRow {
  /** Placement as shown by Vensport, null when not placed. */
  place: number | null;
  /** Bib / start number ("BID" on Vensport). */
  bib: string;
  name: string;
  /** English country name (taken from the flag's alt text, falls back to the country column). */
  country: string;
  /** ISO 3166-1 alpha-2 code from the flag image, lower case. */
  countryCode: string;
  /** Time ("00:18.450") or points ("53"), depending on Round.scoreLabel. */
  score: string;
  /** Sanction codes like "DQ-TF", "DNS", "W1". */
  sanction: string;
  /** "Q" when qualified for the next round. */
  qualified: string;
  /** Furthest round reached (only on the final ranking). */
  progression: string;
}

export interface Round {
  /** e.g. "Final Rankings", "Final - Heat 1", "Qualification - Heat 2" */
  name: string;
  isFinalRanking: boolean;
  /** Header of the score column: "Time" or "Points". */
  scoreLabel: string;
  results: ResultRow[];
}

export interface Race {
  /** Vensport division id */
  id: number;
  /** Full name as on Vensport, e.g. "junior Women 10.000m Elimination" */
  name: string;
  /** Name without category / gender prefix, e.g. "10.000m Elimination" */
  title: string;
  published: boolean;
  publishedAt: string | null;
  rounds: Round[];
}

export interface Season {
  id: number;
  /** e.g. "JR WOMEN TRACK ASU 2026" */
  name: string;
  category: string; // "Junior" | "Senior" | ...
  gender: "w" | "m" | "";
  trackRoad: "Track" | "Road";
  races: Race[];
}

export interface Dataset {
  competition: string;
  source: string;
  scrapedAt: string;
  seasons: Season[];
}
