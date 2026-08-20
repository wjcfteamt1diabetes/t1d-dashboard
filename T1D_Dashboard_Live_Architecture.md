# T1D Program Dashboard — Live Google Sheets Architecture & Build Spec

**Purpose:** Convert the existing static dashboard (`t1d_dashboard_22.html`, currently driven by hardcoded mock data) into a live dashboard that reads from Google Sheets, version-controlled on GitHub and hosted on GitHub Pages.

**Authority:** This spec is reconciled against `T1D_Indicator_Reference_v1.xlsx` ("Indicator Reference" sheet). **That workbook is the source of truth for every indicator's logic, source tab, columns, and filter behaviour.** Where this document and the workbook ever disagree, the workbook wins. The dashboard's own in-app "Indicator Definitions" tab is now superseded by that workbook and should eventually be regenerated from it.

**Audience:** Written to be handed to Claude Code (or any engineer) as the build brief.

---

## 1. Where things stand today

The dashboard is a single self-contained HTML file:

- **UI:** 4 tabs — Program Overview, Clinical Outcomes, Capacity Building, Indicator Definitions. Filters for State / Status / Sex / Age in a sticky bar.
- **Charting:** Chart.js 4.4.1 (CDN) plus hand-rolled HTML/CSS bars.
- **Data:** Everything lives in a `// ═══ MOCK DATA ═══` block — a `STATE` object of per-state aggregates, time-series arrays, and values hardcoded inside render functions.
- **Filtering:** Filters currently apply crude *multipliers* (`SX={M:.58,F:.42}`, `AG={ped:.19,...}`) to fake breakdowns. Per the reference matrix this is both inaccurate and applied to the wrong indicators — see §7.

The job: replace the mock block with data fetched at runtime and computed from the real sheets, without changing the visual design.

### 1.1 Global rules (apply to every indicator unless stated otherwise)

These come from the header note of the reference workbook and are non-negotiable for correct numbers:

1. **Survival exclusion.** Exclude PLT1Ds with `Survival Status = 'No'` from every metric, except the dedicated "Non-surviving PLT1Ds" KPI card. Non-survivors are reported only there.
2. **CS vs LT split.** All *patient-level* metrics use **Complete Support (CS) facilities only**. **Light Touch (LT)** contributes **aggregate enrolment counts only** (total enrolled, and monthly enrolment columns) — never patient-level clinical/adherence data.
3. **Current-date relativity.** Time-since calculations (e.g. "HbA1c in last 90 days", "follow-up in last 12 months") are computed against the current date at generation time, so results shift as time passes. The payload should stamp `meta.generatedAt`.
4. **Pre-computed helper columns.** Several values are already computed in the sheets and should be read, not recomputed: `Enrolled for >3 months`, `In Range?` (TDD), `Basal %`, `Latest hba1c time bucket`, `Time bucket` (Hyper/Hypo). Trust these unless validation says otherwise.

---

## 2. The core architectural decision

GitHub Pages is **static hosting only** — no server-side code. So data reaches the browser one of three ways:

| Option | How it works | Patient data exposure | Real filtering | Recommendation |
|---|---|---|---|---|
| **A. Apps Script aggregation API** | A Google Apps Script web app reads the *private* workbooks, computes the indicators, returns one aggregated JSON payload. Dashboard fetches it. | **None** — only aggregates leave Google | Yes (server-side) | **Recommended** |
| **B. Pre-aggregated summary sheet, published to web** | Maintain a summary tab; publish as CSV/JSON; dashboard fetches and maps. | None, if summary holds only aggregates | Limited | Acceptable fallback |
| **C. Raw row sheets published to web** | Dashboard fetches raw patient rows, aggregates in-browser. | **High — patient rows become public** | Yes | **Do not use** |

### Why Option A

The reference confirms the source data is **patient-level and clinical**: `Enrolled List`, `Hba1c_BaselineLatest`, `SMBG_*`, and `Followup_adherence` are keyed on `Claude_ID` and carry sex, age, survival status, HbA1c values, DKA/severe-hypoglycaemia episode counts, insulin dosing, and SMBG behaviour. IDs are pseudonymous (`Claude_ID`, not names), which helps — but age + clinical history + facility + district can still be re-identifying. This is sensitive health data.

A static GitHub Pages site is public, and anything it fetches over plain `fetch()` is public too. So:

> **The Apps Script is the privacy boundary. Raw patient rows never leave Google. The public JSON contains aggregates only.**

This single principle governs the whole build. If review confirms the data is fully de-identified sample data, Option B becomes viable; otherwise build toward A.

---

## 3. System diagram

```
                   PRIVATE (inside Google)                  │   PUBLIC (internet)
                                                            │
  ┌──────────────────────────────────────────────┐         │
  │  Workbook 1: T1D_Data_Claude_Sheet1_v1         │         │
  │   Enrolled List · CompleteSupport_Facilities   │         │
  │   Light_touch_facilities · Followup_adherence  │         │
  │   SMBG_Monthly · SMBG_HyperHypo                │         │
  │   Hba1c_BaselineLatest · Capacity_Building     │         │
  │   Orientation_T1D signs · Targets              │         │
  ├──────────────────────────────────────────────┤         │
  │  Workbook 2: T1D_Data_Claude_Sheet2_v1         │         │
  │   Operations_Summary · # of offs               │         │
  └────────────────────────┬─────────────────────┘         │
                           │ reads (SpreadsheetApp.openById)│
                           ▼                                │
  ┌──────────────────────────────────────────────┐         │
  │  Apps Script web app (doGet)                   │         │
  │   ─ applies global rules (survival, CS/LT)     │         │
  │   ─ aggregates per Indicator Reference         │         │
  │   ─ caches (CacheService)                      │  ───────┼──►  GET .../exec
  │   ─ returns ONE JSON payload (aggregates only) │         │          │ JSON
  └──────────────────────────────────────────────┘         │          ▼
                                                            │   ┌────────────────────────┐
                                                            │   │ GitHub Pages (static)   │
                                                            │   │  index.html → fetch →   │
                                                            │   │  render charts          │
                                                            │   └────────────────────────┘
                                                            │          ▲ source-controlled
                                                            │   ┌────────────────────────┐
                                                            │   │ GitHub repo             │
                                                            │   │  index.html, config,    │
                                                            │   │  apps-script/Code.gs    │
                                                            │   └────────────────────────┘
```

---

## 4. Source workbook & sheet inventory

Two workbooks. Confirm exact tab names and header strings against the live files before coding — whitespace and casing matter, and the reference itself shows inconsistencies (e.g. the ID column appears as both `Claude_ID` and `Claude ID`; normalise on read).

### Workbook 1 — `T1D_Data_Claude_Sheet1_v1`

| Sheet (tab) | Key columns | Feeds |
|---|---|---|
| `Enrolled List` | `Claude_ID`, `State`, `Sex`, `Age`, `Survival Status`, `Case Status` (Active/Inactive), `Reason for marking inactive`, `Date of enrolment`, `Facility name`, `Previous treatment regimen`, `Previous treatment facility category`, `Transitioned to basal-bolus insulin regimen?`, `Insulin regimen check`, `# of DKA episodes in the last 12 months`, `# of severe hypoglycemia episodes in the last 12 months`, `Follow-up visit in the last 12 months?`, `In Range?`, `Basal %` | enrolment, gender, age, active/inactive, reasons, non-surviving, prev-facility, insulin baseline/current, DKA, hypo, TDD, basal |
| `CompleteSupport_Facilities` | `State`, `District`, `Facility name`, `T1D Clinic Operational?`, `Date of Operationalisation`, `HbA1c Available?`, `Trained pediatrician available?`, `Trained MD Medicine available?`, `Trained Medical Officer available?` | states, districts, planned/operational facilities, clinic overlay, HbA1c in-house, trained staff |
| `Light_touch_facilities` | `Facility name`, `Total enrolments (autocalculated)`, monthly enrolment date columns | LT enrolled counts, MoM enrolment charts (LT portion) |
| `Followup_adherence` | `Claude_ID`, monthly date columns (Y / N / NaN), `Case Status` | follow-up attendance MoM |
| `SMBG_Monthly` | `Claude_ID`, monthly date columns, `Case status`, `Enrolled for >3 months` | SMBG frequency (all + >3m) |
| `SMBG_HyperHypo` | `Claude_ID`, `% Hypo readings`, `% Hyper readings`, `Date of visit`, `Time bucket` | hyper/hypo last 3 months |
| `Hba1c_BaselineLatest` | `Claude_ID`, `Baseline HbA1c value (%)`, `First Hba1c`, `Date of first Hba1c`, `Latest Hba1c value`, `Date of latest Hba1c`, `Latest hba1c time bucket`, `Time since enrolment (at hba1c date)` | HbA1c testing, improving trend, change chart, average chart, distribution, latest-avg |
| `Capacity_Building` | `Name of Service Provider`, `Type of Service Provider` (Doctor / Staff Nurse), `Training Batch`, `Designation/ Department`, `Pre-test Score`, `Post-test Score`, `Maximum Score`, `Pilot facility? (Yes/No)`, `Facility Name` | batches, doctors/nurses trained, pilot split, specialty, pre/post scores |
| `Orientation_T1D signs` | `Session #`, `State`, `District`, `# of Service Providers`, `Pilot District? (Yes/No)`, `Type of Service Provider` | FLW sessions, HWs oriented, pilot districts, provider type |
| `Targets` | per-state enrolment targets | enrolled-vs-target gauge |

### Workbook 2 — `T1D_Data_Claude_Sheet2_v1`

| Sheet (tab) | Key columns | Feeds |
|---|---|---|
| `Operations_Summary` | `Facility Name`, Month/Year columns (value = % time operational: `1.0`=100%, `0.75`=75%; `NaN`=not yet operational that month) | clinic functionality MoM (threshold ≥ 0.75 = functional) |
| `# of offs` | `Facility Name`, Month/Year columns (value = count of off days) | clinic off-days MoM (buckets 0/1/2/3/4+) |

### Value-encoding gotchas (read carefully)

- **SMBG_Monthly cells:** `'.'` = no visit that month → **excluded from denominator**. `'0.00'` = visited but zero SMBG readings. A number = average readings/day. Buckets: **0 readings / <1 per day / 1–2 per day / >2 per day**.
- **Followup_adherence cells:** `Y` = attended, `N` = missed, `NaN` = not yet due → **excluded from denominator**. Denominator = `Y + N`. Includes both active and inactive survivors.
- **SMBG_HyperHypo values:** decimals (e.g. `0.48` = 48%).
- **Operations_Summary values:** decimals as above; `NaN` excluded from denominator.
- **Undated enrolments never reach the time axis.** The cumulative bar counts enrolments with a usable `Date of enrolment` as-of each month, while the Complete support KPI counts every filtered patient — so a blank or future-dated enrolment makes the chart's last bar sit below the card. `TREND_GAP` measures the difference and the note under the chart states it (`n with no enrolment date`, `n dated after <month>`); it disappears once the sheet is corrected. Do not backfill a date to close the gap — an invented month would silently distort the trend.
- **`Date of Operationalisation` is m/d/yyyy, not d/m/yyyy.** The gviz CSV carries whatever the sheet's locale renders, and this column renders month-first (`2/21/2025`, `11/28/2024`). Values where both parts are ≤ 12 (`1/9/2026`) are ambiguous per-value, so `dateConv()` infers the convention from the whole column — one value with a part > 12 pins it for the rest — and `parseDate(v, conv)` applies it. Read as d/m, 17 of 63 operational facilities landed in the wrong month and one fell after the current month, dropping it from the clinics line. `Date of enrolment` needs none of this: it arrives as `5 Aug 2026`.

---

## 5. The data contract (the integration seam)

Build frontend and backend against this one fixed JSON shape. It mirrors the dashboard's existing variable names so rewiring is mechanical. `doGet` returns:

```jsonc
{
  "meta": {
    "generatedAt": "2026-05-31T18:30:00Z",
    "n": 2216,                       // total surviving enrolled (CS+LT aggregate), headline
    "schemaVersion": "1.1"
  },

  // ── Per-state aggregates → replaces STATE. Keys: all, RJ, MP, UK, CG ──
  // target now comes from the Targets sheet (sum of per-state targets for the selection),
  // NOT a hardcoded number. Programme total = 5,954 (RJ 4,000 + MP 1,082 + UK 602 + CG 270).
  "states": {
    "all": {
      "states": 4, "dist": 46, "plan": 58, "op": 56, "csOp": 38, "ltOp": 18,
      "enr": 2216, "target": 5954, "csEnr": 1647, "ltEnr": 569,
      "active": 1950, "inactive": 215, "nonSurviving": 51,    // NEW: from Case Status / Survival Status
      "newLast": 51, "newPrev": 96, "avgClin": 0.9,
      "insBase": 44, "insLast": 96,
      "hbTest": 38, "hbDec": 61, "hbDecN": 843,
      "dka": 8, "hypo": 11,                                   // denominator = follow-up in last 12m; target <10%
      "drBat": 11, "drTr": 387, "drPre": 62, "drPost": 81,    // pre/post = mean(score/maxScore*100)
      "nrBat": 4, "nrTr": 60, "nrPre": 79, "nrPost": 87,
      "flwSes": 73, "flwHr": 12817, "flwDist": 15, "flwTotDist": 46  // flwHr = health workers oriented
    },
    "RJ": { "...": "same fields" }, "MP": {}, "UK": {}, "CG": {}
  },

  "series": {
    "months":   ["Jan 25", "...", "May 26"],
    "csCum":    [ ], "ltCum": [ ],          // ltCum starts Sep 2025; earlier months = CS only
    "clin":     [ ],                        // operational clinics per month = CS (Date of Operationalisation ≤ month end) + LT (from each LT facility's first reported enrolment month)
    "clinCs":   [ ], "clinLt": [ ],         // the CS / LT split behind "clin" (tooltip breakdown)
    "newEnrCs": [ ], "newEnrLt": [ ],
    "avgCl":    [ ]                         // avg new enrolments per operational clinic / month = (newEnrCs + newEnrLt) ÷ clin
  },

  "followup": { "mom": [ { "m": "May 26", "v": 25, "n": 1843 } ] },   // v=% Y, n=(Y+N); target line 75%

  "smbg": {                                  // v = [0 readings, <1/day, 1–2/day, >2/day] as %
    "mom":  [ { "m": "Apr 26", "v": [25, 54, 12, 9], "n": 1512 } ],
    "last": { "m": "May 26", "v": [25, 55, 12, 8], "n": 911 }         // enrolled >3 months only
  },

  "glycemia": {                              // CONFIRM bucketing with reference (see §11)
    "months":    [ { "m": "May 26", "n": 943 } ],
    "hyperDist": [ [ ] ],                    // last 3 completed months, most recent first
    "hypoDist":  [ [ ] ]
  },

  "clinicOps": {
    "months":        ["Oct 25", "...", "May 26"],
    "functionalPct": [ ],                    // % facilities with value ≥0.75 (Operations_Summary)
    "offDays":       [ [ ] ]                 // [0, 1, 2, 3, 4+] off-day buckets, % (from "# of offs")
  },

  "trainedStaff": [                          // % of operational CS facilities with each, computed separately
    { "lbl": "With trained Pediatrician", "v": 72 },
    { "lbl": "With trained MD Medicine", "v": 65 },
    { "lbl": "With trained MO", "v": 45 }
  ],

  "hba1c": {                                 // from Hba1c_BaselineLatest; baseline fallback rule applies
    "changeLabels": [ ], "changeN": [ ],
    "improved4": [ ], "improved2": [ ], "improvedL": [ ], "noChange": [ ],
    "worsenedL": [ ], "worsened2": [ ], "worsened4": [ ],
    "avgBaseline": [ ], "avgLatest": [ ],
    "distLabels": [ ], "distLt7": [ ], "dist7_10": [ ], "dist10_13": [ ], "dist13_16": [ ], "distGt16": [ ],
    "latestAvg": [ ]
  },

  "demographics": {
    "gender":         [ { "l": "Male", "v": 58 }, { "l": "Female", "v": 40 } ],   // Male/Female from Sex
    "age":            [ { "l": "Pediatric (<13)", "v": 19 }, { "l": "Pubertal (13–17)", "v": 12 }, { "l": "Adults (≥18)", "v": 69 } ],
    "prevFacility":   [ { "l": "PHC", "v": 22 }, { "l": "CHC", "v": 31 } ],
    "inactiveReasons":[ { "l": "Lost to follow-up", "v": 0 } ]   // NEW: from Reason for marking inactive
  },

  "insulin": {                               // In Range? and Basal % are pre-computed in Enrolled List
    "tdd": [ { "grp": "Pediatric <13", "n": 423, "below": 24, "inRange": 58, "above": 18 } ],
    "basal": [ { "l": "<20%", "v": 8 }, { "l": "30–50%", "v": 38, "ideal": true } ]
  },

  "capacity": {                              // NOTE: no mentoring data in the reference (see §11)
    "specialty":  [ { "l": "Pediatrician", "v": 54 }, { "l": "MD Medicine", "v": 37 }, { "l": "Medical Officer", "v": 5 }, { "l": "Other", "v": 4 } ],
    "pilotSplit": [54, 46],                  // [pilot %, non-pilot %] doctors
    "flwCadre":   [ { "l": "ASHA", "v": 77 }, { "l": "ANM", "v": 7 }, { "l": "BCM", "v": 6 }, { "l": "Other", "v": 10 } ]
  }
}
```

**`schemaVersion` bumped to `1.1`** (added `active`/`inactive`/`nonSurviving`, `inactiveReasons`; corrected `target`; removed mentoring). The frontend should hard-fail on mismatch rather than render wrong numbers.

---

## 6. Backend — Apps Script aggregation web app

### 6.1 Endpoint pattern (two workbooks)

Read-only `doGet` returning JSON. **Use GET, not POST** — a simple GET avoids the CORS preflight that breaks Apps Script POST; a plain `fetch(url).then(r=>r.json())` works because the browser follows the 302 redirect and the final response is cross-origin readable. Do not set `Content-Type: application/json` on the client; reads carry no body.

```javascript
// Code.gs — keep in repo under /apps-script for version control
const WB1_ID = 'WORKBOOK_1_ID';     // T1D_Data_Claude_Sheet1_v1
const WB2_ID = 'WORKBOOK_2_ID';     // T1D_Data_Claude_Sheet2_v1
const CACHE_KEY = 't1d_payload_v1';
const CACHE_SECONDS = 600;          // 10 min; tune for freshness vs quota

function doGet(e) {
  const cache = CacheService.getScriptCache();
  let json = cache.get(CACHE_KEY);
  if (!json || (e && e.parameter && e.parameter.fresh === '1')) {
    json = JSON.stringify(buildPayload());
    cache.put(CACHE_KEY, json, CACHE_SECONDS);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function buildPayload() {
  const wb1 = SpreadsheetApp.openById(WB1_ID);
  const wb2 = SpreadsheetApp.openById(WB2_ID);

  // Load once, reuse everywhere. Apply global rules at the source.
  const enrolledAll = readTab(wb1, 'Enrolled List');
  const survivors   = enrolledAll.filter(p => norm(p['Survival Status']) !== 'no');   // global rule 1
  const csFac       = readTab(wb1, 'CompleteSupport_Facilities');
  const ltFac       = readTab(wb1, 'Light_touch_facilities');
  const targets     = readTab(wb1, 'Targets');

  return {
    meta:         buildMeta(survivors),
    states:       buildStates(survivors, csFac, ltFac, targets, wb1, wb2),
    series:       buildSeries(enrolledAll, ltFac, csFac),
    followup:     buildFollowup(readTab(wb1, 'Followup_adherence')),
    smbg:         buildSmbg(readTab(wb1, 'SMBG_Monthly')),
    glycemia:     buildGlycemia(readTab(wb1, 'SMBG_HyperHypo')),
    clinicOps:    buildClinicOps(readTab(wb2, 'Operations_Summary'), readTab(wb2, '# of offs')),
    trainedStaff: buildTrainedStaff(csFac),
    hba1c:        buildHba1c(readTab(wb1, 'Hba1c_BaselineLatest'), survivors),
    demographics: buildDemographics(survivors),
    insulin:      buildInsulin(survivors),
    capacity:     buildCapacity(readTab(wb1, 'Capacity_Building'), readTab(wb1, 'Orientation_T1D signs'))
  };
}

function readTab(wb, tabName) {
  const sh = wb.getSheetByName(tabName);
  if (!sh) throw new Error('Missing tab: ' + tabName);
  const rows = sh.getDataRange().getValues();
  const headers = rows.shift().map(h => String(h).trim());   // normalises Claude_ID vs "Claude ID" spacing if you also key-normalise
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
function norm(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
```

### 6.2 Worked aggregations (the pattern for all indicators)

Each `build*` helper implements one reference row's numerator/denominator. Note how the global rules show up (survival already filtered into `survivors`; CS-only is implicit because patient tabs are CS):

```javascript
// Gender distribution — % of surviving CS PLT1Ds by Sex (Male/Female)
function buildGender(survivors) {
  let m = 0, f = 0;
  survivors.forEach(p => {
    const s = norm(p['Sex']);
    if (s.startsWith('m')) m++; else if (s.startsWith('f')) f++;
  });
  const tot = (m + f) || 1;
  return [ { l:'Male', v:Math.round(m/tot*100) }, { l:'Female', v:Math.round(f/tot*100) } ];
}

// DKA — % with >=1 episode in last 12m, among those WITH a follow-up visit in last 12m
function buildDka(survivors) {
  const denom = survivors.filter(p => norm(p['Follow-up visit in the last 12 months?']) === 'yes');
  const num = denom.filter(p => Number(p['# of DKA episodes in the last 12 months']) > 0);
  return Math.round(num.length / (denom.length || 1) * 100);   // target <10%
}

// Enrolled vs target — CS count + LT aggregate; target summed from Targets sheet
function buildEnrolment(survivors, ltFac, targets, stateKey) {
  const csEnr = survivors.length;                              // CS = patient rows (survivors)
  const ltEnr = ltFac.reduce((s, f) => s + (Number(f['Total enrolments (autocalculated)']) || 0), 0);
  const target = targets.reduce((s, t) => s + (Number(t['target']) || 0), 0);  // adjust col name
  return { enr: csEnr + ltEnr, csEnr, ltEnr, target };
}

// Pre/post test — mean of (score / maxScore * 100), doctors with both scores
function buildPrePost(capacity, type) {
  const rows = capacity.filter(r => norm(r['Type of Service Provider']) === type
    && r['Pre-test Score'] !== '' && r['Post-test Score'] !== '');
  const pct = (s, m) => Number(s) / (Number(m) || 1) * 100;
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    pre:  Math.round(mean(rows.map(r => pct(r['Pre-test Score'],  r['Maximum Score'])))),
    post: Math.round(mean(rows.map(r => pct(r['Post-test Score'], r['Maximum Score']))))
  };
}
```

Implement the rest tab-by-tab from the reference. Keep helpers pure (rows in → numbers out) so they're unit-testable, and spot-check each output against a manual count in the sheet.

### 6.3 Deployment

1. In Workbook 1: **Extensions → Apps Script**, paste `Code.gs`, set `WB1_ID` and `WB2_ID`. (The script can read Workbook 2 by ID as long as the same Google account has access.)
2. **Deploy → New deployment → Web app.** *Execute as:* **Me** (so it can read private workbooks). *Who has access:* **Anyone** (the public dashboard reads it without login — safe because only aggregates are emitted).
3. Copy the `/exec` URL → that's the frontend endpoint.
4. On every code change: **Manage deployments → edit → new version**, or the URL keeps serving old code.

**Soft gate (optional):** a shared `?k=TOKEN` check only deters casual scraping — the token lives in public client code, so it's not real security. Real security is the aggregation boundary (already in place) and, if individual data ever must be shown, a private host instead of public Pages.

### 6.4 Quotas & caching

`CacheService` keeps most loads off a full recompute (two workbooks × many tabs is the heaviest part). Keep it. Low-traffic program use stays within free Apps Script limits.

---

## 7. Filtering (rewritten — now spec-driven, not multipliers)

The reference defines **eight** filter dimensions and, per indicator, exactly which ones apply: **State, Division, District, Facility, DPC, Sex, Age, Status.** This replaces the mock multiplier approach entirely. Every indicator falls into one of four response patterns:

- **Pattern A — Geography only** (State/Division/District/Facility/DPC; *not* Sex/Age/Status): all footprint & operations KPIs (states, districts, planned/operational facilities, LT, enrolled-vs-target, new enrolments, both enrolment charts, clinic functionality, off days, HbA1c in-house, trained staff), the active/inactive split, reasons-for-inactive, non-surviving card, **and all Capacity Building indicators**.
- **Pattern B — Geography + Status** (Sex/Age *off*): gender distribution, age distribution, previous-treatment-facility.
- **Pattern C — All eight filters**: every patient clinical/adherence metric — insulin regimen (baseline & current), SMBG (both), hyper/hypo, all HbA1c indicators, DKA, severe hypoglycaemia, TDD-in-range, basal-%.
- **Pattern D — All except Status**: follow-up attendance MoM (it deliberately includes both active and inactive survivors, so Status doesn't apply).

Two consequences for the build:

1. **The current dashboard UI is missing filter dimensions.** It has only State / Status / Sex / Age. The reference adds **Division, District, Facility, DPC**. Decide whether to add these controls (recommended for parity with the spec) or defer them. (`DPC` is undefined in the workbook — confirm what it means before building the control.)
2. **The current Sex/Age multipliers are wrong on two counts:** they're applied to footprint/enrolment KPIs that per Pattern A shouldn't respond to Sex/Age at all, and Sex doesn't even apply to the gender donut (Pattern B). Remove them.

**Recommended approach — real segmentation, computed server-side, phased:**

- **Phase 1:** wire **real per-state** data (the `states` object is already per-state — a clean drop-in covering the dominant filter). Leave other filter controls inert/disabled with a "coming soon" note rather than faking results.
- **Phase 2:** have the Apps Script emit aggregates per needed filter slice under a `segments` key (e.g. `segments["state=RJ;sex=F;age=ped;status=active"] = {...}`), scoped to the indicators and dimensions the matrix actually marks "Yes". The frontend looks up the active slice instead of multiplying. Scope tightly — don't precompute combinations no indicator uses.

---

## 8. Frontend — rewiring the dashboard

Delete the `// ═══ MOCK DATA ═══` block and feed the same variables from the fetched payload, leaving every `render*`/`build*` function and all styling untouched.

### 8.1 Loader

```javascript
const ENDPOINT = window.DASHBOARD_CONFIG.endpoint;   // from config.js (§9)
let DATA = null;

async function loadData() {
  const res = await fetch(ENDPOINT, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const p = await res.json();
  if (p.meta?.schemaVersion !== '1.1') throw new Error('Schema mismatch: ' + p.meta?.schemaVersion);
  return p;
}

(async function boot() {
  const overlay = showLoading();
  try {
    DATA = await loadData();
    hydrateGlobals(DATA);     // payload → renderer variables
    runInits();               // existing _inits loop + applyFilters()
    stampLastUpdated(DATA.meta.generatedAt);
    hideLoading(overlay);
  } catch (err) {
    showError(overlay, err);  // "Couldn't load data — retry"; console.error(err)
  }
})();
```

### 8.2 Map payload → existing variables

Change the mock `const STATE = …` / array declarations to `let`, then assign from `DATA`. Because §5 mirrors the names, this is mostly mechanical:

```javascript
function hydrateGlobals(d) {
  STATE = d.states;
  MONTHS = d.series.months;
  CS_CUM = d.series.csCum; LT_CUM = d.series.ltCum; CLIN = d.series.clin;
  NEWENR_CS = d.series.newEnrCs; NEWENR_LT = d.series.newEnrLt;
  NEWENR = NEWENR_CS.map((v,i)=>v+NEWENR_LT[i]); AVGCL = d.series.avgCl;
  FUP_MOM = d.followup.mom; SMBG_MOM = d.smbg.mom; SMBG_LAST = d.smbg.last;
  // …glycemia, clinicOps, trainedStaff, hba1c
  // For renderers with inline literals (gender, age, prevFacility, tdd, basal,
  // specialty, flwCadre, pilotSplit) refactor them to read DATA.* instead.
  // Recompute MAX/off after MONTHS is known.
}
```

### 8.3 Renderers to refactor / change

- **Inline-literal renderers** (`renderGender`, `buildAge`, `renderPTF`, `renderTDD`, `renderBasal`, specialty/FLW/pilot legends): point each at `DATA.demographics.*` / `DATA.insulin.*` / `DATA.capacity.*`. Keep colour arrays and DOM code as-is.
- **Mentoring chart (`c-men`) and KPI cards (`men-dr`, `men-nr`):** **no backing indicator exists in the reference.** Either remove these, or keep them visibly marked "data pending" — do not leave mock numbers presenting as live.
- **Gender donut:** reference defines Male/Female only (no "Other/NS"). Adjust the donut + legend accordingly, or confirm whether an Other bucket exists in the data.
- **SMBG labels:** update bucket labels to `0 readings / <1 per day / 1–2 per day / >2 per day`.
- **Target/gauge:** read `target` from payload (now 5,954 programme-wide), not the hardcoded 3,080.
- **New cards to add (optional, per reference):** active/inactive split, reasons-for-inactive, non-surviving KPI. The data is in the payload (`states.*`, `demographics.inactiveReasons`); add UI if/when wanted.

### 8.4 Keep existing resilience

The file already wraps renders in `safe(name, fn)`. Preserve it so one malformed field degrades a single card, not the whole page.

---

## 9. GitHub repo & Pages hosting

```
t1d-dashboard/
├── index.html            # the dashboard (renamed from t1d_dashboard_22.html)
├── config.js             # endpoint URL, kept separate for easy swapping
├── apps-script/
│   └── Code.gs           # backend source (version-controlled, not auto-deployed)
├── docs/
│   └── ARCHITECTURE.md   # this document
└── README.md
```

`config.js`:
```javascript
window.DASHBOARD_CONFIG = { endpoint: 'https://script.google.com/macros/s/XXXX/exec' };
```
Load before the dashboard logic: `<script src="config.js"></script>` in `<head>`.

**Enable Pages:** push to GitHub → **Settings → Pages → Source: Deploy from a branch** → `main` / `/ (root)`. Live at `https://<user>.github.io/<repo>/`. (Use `/docs` instead if you prefer a clean root.)

**Updates:** data changes appear within the cache window with no redeploy. Redeploy only for code: push to `main` (Pages rebuilds static files); for backend logic, cut a new Apps Script version.

---

## 10. Build order (task plan for Claude Code)

**Phase 0 — Skeleton & pipe.** Repo layout; enable Pages with the current mock dashboard so hosting is proven first.

**Phase 1 — Prove the live pipe with known values.** `Code.gs` whose `buildPayload()` returns the *current mock numbers hardcoded* (no aggregation yet) — but with corrected `target: 5954` and the new fields. Deploy; add `config.js`, loader (§8.1), `hydrateGlobals` (§8.2). Success = identical-looking dashboard now drawing from the live endpoint.

**Phase 2 — Real aggregation, tab by tab.** Implement `build*` helpers against the reference, applying global rules (§1.1). Order: Operations → Clinical Outcomes → Capacity Building. Validate each number against a manual sheet count. Handle the value-encoding gotchas (§4) explicitly.

**Phase 3 — Real filtering.** Add missing filter controls (or scope to State); implement `segments` per the §7 matrix; remove multipliers.

**Phase 4 — Hardening.** Loading/error/empty states; "last updated" from `meta.generatedAt`; schema-version guard; resolve mentoring & gender-Other questions; cache tuning; README.

Each phase is independently shippable.

---

## 11. Open questions to confirm before/while building

1. **Sensitivity confirmation** — `Enrolled List` etc. are pseudonymous (`Claude_ID`) but patient-level and clinical. Confirms Option A over B (§2). Build toward A unless told the data is fully de-identified sample data.
2. **Two-workbook access** — confirm the deploying Google account can `openById` both `..._Sheet1_v1` and `..._Sheet2_v1`.
3. **Exact tab/column strings** — verify against the live files; normalise the `Claude_ID` vs `Claude ID` inconsistency on read.
4. **`Targets` sheet shape** — confirm the column name/structure so `buildEnrolment` sums correctly (spec total 5,954; RJ 4,000 / MP 1,082 / UK 602 / CG 270).
5. **Extra filter dimensions** — should the UI gain Division / District / Facility / DPC controls? What does **DPC** mean?
6. **Mentoring** — there is no mentoring indicator in the reference. Remove the dashboard's mentoring chart/cards, or supply a data source for them?
7. **Gender categories** — reference is Male/Female only; confirm whether an "Other / Not specified" bucket exists.
8. **Hyper/Hypo bucketing** — the reference describes mean % hyper/hypo per patient over the last 3 months with a pre-computed `Time bucket`; the dashboard renders 5 banded buckets. Confirm the intended bucket boundaries (and whether they're per-patient means or reading-level bands) before implementing `buildGlycemia`.
9. **Refresh expectations** — desired freshness sets `CACHE_SECONDS`.

---

*This dashboard handles health-program data. The architecture keeps raw, patient-level records inside Google and exposes only aggregates, which is what makes a public GitHub Pages host acceptable. If any individual-level view is ever required, public Pages is the wrong host and a private/authenticated deployment should be used. Worth a deliberate sign-off from the data owner before go-live.*
