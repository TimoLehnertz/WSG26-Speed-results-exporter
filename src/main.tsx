import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { Dataset } from "./types";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

fetch(`${import.meta.env.BASE_URL}data/results.json`, { cache: "no-cache" })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Dataset>;
  })
  .then((data) => root.render(<App data={data} />))
  .catch((e) => {
    root.render(<div className="load-error">Could not load results: {String(e)}</div>);
  });
