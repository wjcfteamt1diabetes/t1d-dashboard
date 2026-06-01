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

## One-time setup

### 1. Apps Script deployment
1. Open Workbook 1 (`T1D_Data_Claude_Sheet1_v1`) → **Extensions → Apps Script**
2. Paste the contents of `apps-script/Code.gs`
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the `/exec` URL

### 2. Wire the endpoint
Paste the URL into `config.js`:
```js
window.DASHBOARD_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/YOUR_ID/exec'
};
```

### 3. GitHub Pages
1. Push this repo to GitHub (see [Pushing to GitHub](#pushing-to-github) below)
2. Go to **Settings → Pages**
3. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`
4. GitHub will provide the live URL — update the link at the top of this README

---

## Making changes

### Dashboard UI or chart changes
Edit `index.html`, then:
```bash
git add index.html
git commit -m "describe your change"
git push
```
GitHub Pages redeploys automatically in ~30 seconds.

### Data aggregation logic (Phase 2+)
Edit `apps-script/Code.gs` locally (version-controlled here), then:
1. Copy the changes into the Apps Script editor in Google
2. **Manage deployments → Edit → New version** — the `/exec` URL stays the same
3. Commit the local file: `git add apps-script/Code.gs && git commit -m "..." && git push`

### Endpoint URL change
Edit `config.js`, then commit and push as above.

### Refreshing data
The **↺ Refresh Data** button in the dashboard header forces a fresh fetch, bypassing both the browser cache and the Apps Script 10-minute server cache (`?fresh=1`).

---

## Pushing to GitHub

First time only — create an empty repo on GitHub (no README, no .gitignore), then run:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

After that, every change is just:
```bash
git add <file>
git commit -m "your message"
git push
```

---

## Data contract

The Apps Script returns a single JSON payload (schema version `1.1`). The dashboard hard-fails on a schema mismatch rather than rendering wrong numbers. Key fields:

| Section | Contents |
|---|---|
| `meta` | `generatedAt`, total `n`, `schemaVersion` |
| `states` | Per-state aggregates keyed `all / RJ / MP / UK / CG` |
| `series` | Monthly enrolment & clinic time-series |
| `followup` | Month-on-month follow-up attendance |
| `smbg` | SMBG frequency MoM + last-month snapshot |
| `glycemia` | Hyper/hypo reading distributions |
| `clinicOps` | Clinic functionality & off-day data |
| `hba1c` | HbA1c change, averages, distribution, latest |
| `demographics` | Gender, age, previous facility, inactive reasons |
| `insulin` | TDD ranges, basal % distribution |
| `capacity` | Training batches, scores, specialty, FLW orientation |

Full field definitions and source-sheet mapping: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Build phases

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Repo skeleton + GitHub Pages hosting |
| 1 | ✅ Done | Live endpoint pipe with hardcoded mock payload |
| 2 | ⏳ Next | Real aggregation from Google Sheets, tab by tab |
| 3 | Planned | Real filtering (State/Sex/Age/Status per reference matrix) |
| 4 | Planned | Hardening — cache tuning, empty states, schema guard |

---

## Notes

- This dashboard handles health-program data. The architecture keeps raw patient-level records inside Google and exposes only aggregates, which is what makes a public GitHub Pages host acceptable.
- If any individual-level view is ever required, GitHub Pages is the wrong host — a private/authenticated deployment would be needed.
