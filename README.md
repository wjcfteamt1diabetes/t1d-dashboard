# T1D Program Dashboard

A live program-monitoring dashboard for India's Type 1 Diabetes programme across Rajasthan, Madhya Pradesh, Uttarakhand, and Chhattisgarh.

[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-Open%20%E2%86%92-1a5fa8?style=for-the-badge&logo=github)](https://wjcfteamt1diabetes.github.io/t1d-dashboard/)

---

## Architecture

```
Google Sheets (private, patient-level data)
        │
        ▼  reads & aggregates
Google Apps Script web app   ←── executes as your Google account
        │  returns aggregated JSON only (no raw rows)
        ▼
GitHub Pages (public, static)
  index.html  →  fetch(endpoint)  →  render charts
```

Raw patient data never leaves Google. The Apps Script is the privacy boundary — only aggregated numbers reach the browser. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full spec.

---

## File structure

```
├── index.html              # The dashboard — all UI, charts, and rendering logic
├── config.js               # Endpoint URL (only file that changes between environments)
├── apps-script/
│   └── Code.gs             # Apps Script source — version-controlled here, deployed manually
├── docs/
│   └── ARCHITECTURE.md     # Full build spec and data contract
├── .gitignore
└── README.md
```

> `t1d_dashboard_22.html` is the original static mock — kept as a reference/fallback, not deployed.

---
