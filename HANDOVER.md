# Handover — T1D Program Dashboard

Written for an agent or developer picking this project up cold on a local machine
(e.g. ChatGPT Codex). Everything needed to be productive in the first hour is here.
Read `docs/ARCHITECTURE.md` and `T1D_Dashboard_Live_Architecture.md` for the full
build spec; this file is the *current state and the open work*.

---

## 1. What this is

A live program-monitoring dashboard for India's Type 1 Diabetes programme across
four states: Rajasthan (RJ), Madhya Pradesh (MP), Uttarakhand (UK), Chhattisgarh (CG).

Deployed as a static GitHub Pages site:
<https://wjcfteamt1diabetes.github.io/t1d-dashboard/>

**There is no backend.** `index.html` fetches each Google Sheets tab directly via the
gviz CSV endpoint, then parses, filters and aggregates entirely in the browser. That is
why every filter (State / Division / District / Facility / DPC / Sex / Age / Status)
recomputes every chart instantly — the whole dataset is already in memory.

`apps-script/Code.gs` is the **deprecated** former backend. Kept for reference only; it
is not called by anything. Don't "fix" it.

`t1d_dashboard_22.html` is the original static mock. Not deployed. Reference only.

---

## 2. Getting it running locally

```bash
git clone https://github.com/wjcfteamt1diabetes/t1d-dashboard
cd t1d-dashboard
python3 -m http.server 8000        # any static server; file:// will fail on fetch/CORS
# open http://localhost:8000
```

Requirements: a browser and **Node 22+** for the tests. No npm install, no build step,
no dependencies. `index.html` is a single self-contained 200 KB file (HTML + CSS + JS
inline). The only external assets are three CDN scripts — Chart.js 4.4.1, html2canvas
1.4.1 and jsPDF 2.5.1 — so the page needs network access to render and to export.

There is a **passcode gate** in `index.html` (search for `// ── Passcode gate`). The
test harness deliberately strips everything after that marker and exercises only the
calculation/render code.

### Tests

```bash
node --test tests/donor.test.cjs     # 9 tests, all passing as of this handover
```

The suite reads `index.html`, extracts the first `<script>` block, and runs it in a
`node:vm` context with a stub `document` and `Chart`. So **the tests execute the real
dashboard code**, not a copy — if you refactor the script block's structure (e.g. split
it into multiple `<script>` tags), the harness breaks. Keep it one block.

Note: `node --test tests/` (directory form) errors on this Node version. Pass the file.

---

## 3. Data model — the parts that bite

Two Google workbooks, IDs in `config.js`. Both must stay shared
"Anyone with the link → Viewer" or the dashboard shows nothing.

| Workbook | ID | Tabs |
|---|---|---|
| Sheet1 | `1cgMB5RIomWGSw_cQfmFkxx3qfBXlXxIL9fR4FzFuwIg` | Enrolled List, CompleteSupport_Facilities, Light_touch_facilities, Followup_adherence, SMBG_Monthly, SMBG_HyperHypo, Hba1c_BaselineLatest, Capacity_Building, Orientation_T1D signs, Targets |
| Sheet2 | `1zObGfUcDOszt82v9V65OAK7yV5McXzeusFx5XqU_d6M` | Operations_Summary, # of offs |

### Five things that are non-obvious and will cost you a day if you miss them

**a. CS vs LT facilities.** Complete Support facilities have patient-level data.
Light Touch facilities contribute **enrolment counts only**. Every patient-level metric
must be CS-only. This is global rule #2 in the architecture doc and it is easy to
violate accidentally when adding a chart.

**b. Filler / ghost rows.** The Enrolled List sheet pre-fills IDs `P1..P5000`; most are
blank placeholders. The authoritative filter is at `index.html` (search
`Keep only real patient rows`):

```js
enrolled: toObjects(enr, ['Claude_ID','State','Survival Status'])
  .filter(p => normv(p['Sex']) || normv(p['Age']) ||
               normv(p['Facility Name']) || normv(p['Date of enrolment'])),
```

A row counts as real if **any** of Sex / Age / Facility Name / Date of enrolment is
non-blank. Use exactly this rule in any offline analysis or your numbers will not
reconcile with the dashboard. Current result: 5000 rows → **2,728 real**, 2,272 ghosts.

**c. `PGEO` vs `P`.** `PGEO` = survivors after **geography** filters only. `P` = `PGEO`
after the sex/age/status filters too. Enrolment totals and the trend axis use `PGEO`;
clinical charts use `P`. Picking the wrong one silently double-filters.

**d. Survival status.** `Survival Status = 'No'` is excluded everywhere except the
non-surviving KPI card. 28 of the 2,728 real rows are non-survivors → 2,700 survivors.

**e. Read pre-computed columns, don't recompute.** Global rule #4: the sheet already
carries `Enrolled for >3 months`, `In Range?`, `Basal %`, `Latest hba1c time bucket`,
`Time bucket`. Prefer them over deriving the same thing in JS. (One place currently
violates this — see Open Item 1.)

---

## 4. Completed and delivered: the 18-patient enrolment-date gap

**Question:** the dashboard's trend axis showed a note — *"18 of 2,700 complete-support
PLT1D are not on this axis — 18 with no enrolment date."* Which patients?

**Answer — fully reconciled:**

```
rows with any content : 5000
real rows             : 2728
ghost rows (ID only)  : 2272   (P2729 .. P5000)
real non-survivors    :   28
real survivors (PGEO) : 2700   <- matches the dashboard
survivors, no date    :   18   <- matches the dashboard
real rows with a date : 2710
```

All 18 are the "no enrolment date" bucket; the "enrolled after the last plotted month"
bucket is **zero**. By state: **RJ 17, UK 1**. Seventeen of the eighteen are a
*contiguous* block at one facility, DH Rajsamand (P2037–P2067) — a single clinic's
data-entry batch, not a scattered systemic problem. The eighteenth is at JLN District
Hospital Rudrapur, UK.

These patients **are** counted in all enrolment totals. They are only absent from the
trend axis, because there is no date to place them on. The fix is enrolment date only —
no visit-marking is involved, contrary to the original framing of the request.

The ID-level list (18 rows: PLT1D ID, State, Facility, Case status) was delivered to
Kabir as a CSV in the previous session. **It is deliberately not committed to this
repo** — the repo is public, and even though the README states the data is
synthetic/sample, a public commit of ID + facility rows is a habit worth not forming.
Regenerate it with the script in §7 rather than pasting it into a tracked file.

Also verified while there: all 63 operational CS facilities have valid
`Date of Operationalisation` values. There is no second date gap.

---

## 5. Open work — the two that need a human decision first

Both of these are **blocked on requirements, not on code**. Do not guess the answer.

### Open Item 1 — hyper/hypo bucket boundaries are invented

`index.html`, `computeHyperHypo`, around line **3136**:

```js
const bin = s => { const x = parseFloat(String(s).replace('%',''));
                   if (isNaN(x)) return -1;
                   return x < 20 ? 0 : x < 40 ? 1 : x < 60 ? 2 : x < 80 ? 3 : 4; };
```

Those 20/40/60/80 boundaries are **not from the source data**. The `SMBG_HyperHypo` tab
already carries a pre-computed `Time bucket` column, which global rule #4 says to use.
The live chart is currently showing bands nobody specified.

Needs from the programme team, before any code change:
1. The clinically agreed band boundaries (or confirmation to use the sheet's `Time bucket` verbatim).
2. Whether the bins apply to **per-patient means** or to **reading-level** values —
   these give materially different distributions.

### Open Item 2 — "Clinical experts engaged" is hardcoded

`index.html` line **774**:

```html
<div class="kv b">12</div><div class="ks">Expert pool identified &amp; engaged</div>
```

No `id` attribute, never updated by any render function. The Expert Pool sheet actually
lists **13**. Restricting to programme states only (RJ/MP/UK/CG) would give **9** —
Kerala has 2 and Delhi has 2, both outside the four programme states.

Needs a decision: report **13** (all engaged experts) or **9** (programme states only)?
Then wire the card to the sheet with an `id` and a render call so it stops drifting.

---

## 6. Open work — deferred, no decision needed, just do them

| # | Item | Location |
|---|---|---|
| 3 | Mentoring section renders three `data-pending` placeholders. Either supply a data source or remove the section. It degrades honestly today, so this is cosmetic debt, not a bug. | `index.html` ~769–792 |
| 4 | Retire `FAC_CANON` — a hardcoded one-entry patch mapping `chc agastmuni` → `CHC Aagastmuni`. Fix the spelling in the stock sheet, then delete the constant. | `index.html:2253` |
| 5 | Retire `EXTRA_FAC_STATE` — hardcoded `sdh mussoorie` → `UK`. Add SDH Mussoorie to `CompleteSupport_Facilities` with its State, then delete the constant. | `index.html:2660` |
| 6 | Delete the duplicate `Copy of Followup_adherence` tab from the workbook. | Google Sheet 1 |
| 7 | Refresh architecture doc §11 (open questions) — items 5 and 7 are already built. | `T1D_Dashboard_Live_Architecture.md` |

Items 4 and 5 are the same species of debt: the JS is papering over a sheet that should
be corrected. Fix the sheet first, then remove the patch — not the other way round.

**Team-side, not ours:** fill in the 18 missing enrolment dates (§4).

---

## 7. Reproducing the offline analysis

`docs.google.com` was unreachable from the sandboxed session, so the workbook was
pulled through a Google Drive connector and parsed locally. On your own machine you can
just download it:

1. File → Download → `.xlsx` from Sheet1, save as `wb1.xlsx` (~3.6 MB).
2. `pip install openpyxl`
3. Parse it with `read_only=True` and `iter_rows(values_only=True)` — a naive
   cell-by-cell read over 13,502 rows takes minutes and will look like a hang.
4. Apply the filler-row rule from §3(b) **exactly**, then exclude
   `Survival Status = 'No'`, then select rows with a blank `Date of enrolment`.
   You should get 18.

`.gitignore` already excludes `*.xlsx` / `*.xls`. Keep it that way — do not commit
workbooks or any ID-level extract to this public repo.

A caution learned the hard way: a markdown/preview export of the sheet **silently
truncated** the Enrolled List to 58 rows and produced a confident, completely wrong
answer of "0 missing". The tell was that other tabs referenced IDs up to P996 — an
impossible subset of a 58-row list. Always sanity-check row counts against a second tab
before trusting an extract.

---

## 8. Constraints to respect

- **Data is synthetic/sample.** The direct browser→Sheets design is only acceptable
  because of that. From the README, verbatim: *"If real patient data were ever used,
  this approach would expose raw rows publicly and must NOT be used — a
  private/aggregating backend would be required instead."* If the programme ever moves
  to real data, this architecture must be replaced, not patched.
- Same point in the architecture doc: *"If any individual-level view is ever required,
  public Pages is the wrong host and a private/authenticated deployment should be used."*
- **The architecture doc is stale on schema versioning.** `docs/ARCHITECTURE.md` says
  the dashboard hard-fails on a `schemaVersion` mismatch and tells you to bump it in
  `Code.gs`. That was true of the Apps Script design. It is **not true now**: there is
  no `schemaVersion` and no `loadData` anywhere in `index.html` — the direct-Sheets
  rewrite dropped the check entirely. `schemaVersion` survives only in the deprecated
  `apps-script/Code.gs`. Consequence: **a column rename in the sheet fails silently**,
  usually as a chart that quietly renders zeros rather than an error. Treat sheet header
  changes as high-risk and verify visually. Correcting this paragraph in the
  architecture doc belongs with deferred item 7.
- Keep the dashboard's JS in a single `<script>` block or the test harness breaks (§2).

---

## 9. Suggested first move on the new machine

```bash
git clone https://github.com/wjcfteamt1diabetes/t1d-dashboard
cd t1d-dashboard
node --test tests/donor.test.cjs     # expect 9/9 — confirms your setup is sane
python3 -m http.server 8000          # then open localhost:8000 and click every filter
```

Then take Open Items 4 and 5 (unblocked, small, self-contained) to get a feel for the
codebase, while Items 1 and 2 wait on answers from the programme team.
