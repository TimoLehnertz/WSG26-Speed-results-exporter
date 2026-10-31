# WSG 2026 Speed results exporter

A static web page that shows the results of the **World Skate Games 2026 (Asunción) speed skating** events from
[worldskatespeed.vensport.com](https://worldskatespeed.vensport.com/) and exports them in the
[roller-results.com import format](https://www.roller-results.com/tools/import-project.php).

## Using it

- **Sidebar:** works like Windows Explorer. Click a race to open it. Use Ctrl+click to add or remove an item, Shift+click
  to select a range, and Ctrl+A to select everything. You can also use the checkboxes. The arrow keys move and expand or
  collapse items, and Space toggles the focused item. Right-click opens a context menu. Selecting a folder selects all
  the races in it.
- **Filter:** matches race names, athlete names and countries. In the open race, matching athletes are highlighted.
- **Export:** use *Export selected…*, *Export this race…* or *Export all…*. The dialog lists the race-level fields
  roller-results uses to group results into races (`distance`, `category`, `gender`, `trackRoad`, `isRelay`, `round`).
  You can edit them before downloading, and your edits are saved in the browser. Download the file as `.xlsx` (the
  column layout of `import-preset.xlsx`) or `.json`. Both formats are accepted by the roller-results import tool.

### Field mapping

| roller-results | Source |
| --- | --- |
| `distance` | Race name without dots in the numbers, e.g. `10000m Elimination` |
| `category` / `gender` / `trackRoad` | Taken from the Vensport season (e.g. *JR WOMEN TRACK*) |
| `startNumber` | Bib (used by roller-results as the athlete alias) |
| `fullName`, `country` | Name, and the English country name from the flag |
| `place` | Final ranking. Unplaced skaters (e.g. DQ) are put after the last placed skater |
| `time` / `points` | Score column (`hh:mm:ss.uuu`). `00:00.000` (DNF/DNS) is left empty |
| `remark` | Sanction code (W1, DQ-TF, DNS, …) |
| `disqualificationTechnical` | `DQ-TF` |
| `disqualificationSportsFault` | Any other `DQ-*` |
| `didNotStart` / `falseStart` | `DNS` / `FS*` |

Only the **final ranking** of each race is exported, because roller-results merges all rows that have the same
distance, category and gender into a single race. Races that don't have a final ranking yet are listed as skipped.

## Development

```bash
npm install
npm run scrape   # fetch the latest results into public/data/results.json
npm run dev      # local dev server
npm run build    # static build in dist/
```

Vensport doesn't allow cross-origin requests, so the browser can't load results directly. Instead,
`scripts/scrape.ts` crawls the site from Node and writes `public/data/results.json`. Seasons are found through the
division links on the Vensport home page. If a season isn't linked there (for example the marathon), add one
of its division ids to `EXTRA_SEED_DIVISIONS`.

Vensport rate-limits requests (HTTP 429), so the scraper spaces them out and retries. It also starts from the previous
`results.json` (in CI, the deployed one): races that are published with a final ranking and haven't been republished are
not fetched again, and pages that still fail keep their previous data instead of aborting the whole scrape.

## Deployment

`.github/workflows/deploy.yml` scrapes, builds and deploys to GitHub Pages:

- on every push to `main`
- every 30 minutes
- on manual dispatch

If scraping fails, the committed snapshot is deployed instead. To enable it, go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
