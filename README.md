# T1D Program Dashboard

A live program-monitoring dashboard for India's Type 1 Diabetes programme across Rajasthan, Madhya Pradesh, Uttarakhand, and Chhattisgarh.

[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-Open%20%E2%86%92-1a5fa8?style=for-the-badge&logo=github)](https://wjcfteamt1diabetes.github.io/t1d-dashboard/)

---

## Architecture

```
Google Sheets (shared "Anyone with link → Viewer", synthetic/sample data)
        │
        ▼  fetched directly via gviz CSV endpoint
GitHub Pages (public, static)
  index.html → fetch each tab → parse + aggregate in browser → render charts
```

The dashboard talks to Google Sheets **directly** — no backend, no Apps Script.
Every sheet is fetched as CSV, parsed, and aggregated client-side. Because all the
data lives in the browser, **every filter (State / Sex / Age / Status) recomputes all
charts instantly.**

> This direct-connection design is appropriate because the data is **synthetic/sample
> data** (safe to expose publicly). If real patient data were ever used, this approach
> would expose raw rows publicly and must NOT be used — a private/aggregating backend
> would be required instead. The previous Apps Script approach is kept in
> `apps-script/Code.gs` for reference but is no longer used.

---

## File structure

```
├── index.html              # The dashboard — fetch, parse, aggregate, render (all client-side)
├── config.js               # Google Sheet IDs (wb1, wb2)
├── apps-script/
│   └── Code.gs             # Deprecated backend — kept for reference, no longer used
├── docs/
│   └── ARCHITECTURE.md     # Full build spec and data contract
├── .gitignore
└── README.md
```

> `t1d_dashboard_22.html` is the original static mock — kept as a reference/fallback, not deployed.

---
