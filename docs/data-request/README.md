# Patient data request — enrolment and follow-up

What we need from the programme to compute the dashboard's patient-level indicators
correctly, and to state honestly how complete each number is.

The request is **two datasets**, not one:

| Dataset | Grain (one row per…) | Key | Changes over time? |
|---|---|---|---|
| **1. Enrolment** ([dictionary](enrolment-dictionary.md)) | patient | `patient_id` | No — baseline facts, plus a few status fields that are *updated in place* |
| **2. Follow-up** ([dictionary](followup-dictionary.md)) | patient × contact (visit, missed appointment, or refill collection) | `visit_id`, with `patient_id` as the foreign key | Append-only — a new row per contact, never an edit to an old one |

Everything else in this folder supports those two files:

- [`capture-and-responsibility.md`](capture-and-responsibility.md) — the two capture forms, and who fills each field at what point
- [`missingness-report.md`](missingness-report.md) — the completeness report we need alongside the data, and how "missing" is defined
- [`templates/`](templates) — header-only CSVs for both datasets and the missingness report
- [`examples/`](examples) — synthetic rows for both datasets, showing how the encodings look when filled. **Synthetic. Not programme data.**

---

## The one rule that makes the whole thing work

**A stable, never-reused `patient_id` on every row of both files.** Baseline joins to
follow-up on it; visits order along it; a patient who moves facility keeps it. If the ID
is regenerated at each extract, or recycled when a patient is marked inactive, nothing
downstream is computable — no trajectory, no retention, no denominator that survives a
refresh.

The ID must be **pseudonymous**: it must not encode a name, phone number, or Aadhaar. A
facility-scoped serial (`RJ-DH-JAI-00417`) is fine. The map from ID to identity stays with
the facility and the state; it is never part of an extract to us.

## Five structural rules

1. **One row per scheduled appointment, attended or not.** A missed appointment is a
   follow-up row with `attended = N` and `visit_date` blank — not an absent row.
   "Scheduled versus attended" is only computable if the misses are recorded.
2. **A refill collected without a clinical visit is still a row**, with
   `contact_type = Refill only`. That is how refill collection dates reach the dataset.
3. **Long, not wide.** One row per contact with a real `visit_date`. Please do *not*
   send a month-per-column grid; the current `Followup_adherence`, `SMBG_Monthly` and
   `Operations_Summary` tabs are shaped that way and the exact date, and any second visit
   inside one month, are already lost.
4. **Missing is blank.** An empty cell means not recorded. `0` means measured as zero.
   `NA` means the field cannot apply to this row (a screening not due yet, schooling for
   an adult). Never fill a blank with `0`, `NaN`, `-`, or `999`.
5. **Values are recorded once, not carried forward.** If a visit did not measure weight,
   leave weight blank rather than repeating the previous visit's value. A silently
   carried-forward number reads as a fresh measurement and flattens every trend.

## Format

UTF-8 CSV, one file per dataset per extract, header row exactly matching the `variable`
column of the dictionary (no renamed, reordered-into-merged, or extra header rows).
Dates `YYYY-MM-DD`. Decimals with `.`, no thousands separators, no units inside the cell
(`7.4`, not `7.4%`). Yes/no as `Y` / `N`, unknown as `UNK`. Extract filenames
`t1d_enrolment_YYYY-MM-DD.csv` and `t1d_followup_YYYY-MM-DD.csv`.

Full refresh each extract, not a delta — both files complete, all patients, all history.
Monthly is enough for the dashboard.

## What we also need alongside the data

1. **The data dictionary, confirmed.** The two dictionaries in this folder are our
   *proposal*: variable names, permitted values, and — in the `filled by` and `captured at`
   columns — our assumption about who records each field and when. Correct them against
   what the registers and CRFs actually do, rather than fitting the practice to this document.
2. **The capture form.** A blank copy of each form or register page a field is taken from
   (paper CRF, facility register, EMR screen), so we can see the field as the person
   filling it sees it. [`capture-and-responsibility.md`](capture-and-responsibility.md) lays
   out the form we have reconstructed; a real blank copy supersedes it.
3. **Who fills what, at what point.** Per field: the cadre (paediatrician, MO, staff nurse,
   DPC, data entry operator), and the moment in the visit (registration desk, consultation,
   lab, pharmacy counter, post-visit data entry). This is what tells us whether a low
   completion rate is a form problem, a workload problem, or a data-entry backlog.
4. **Missingness by variable and year.** Per [`missingness-report.md`](missingness-report.md).
   Send it even if it is unflattering — a variable that is 60% blank in 2024 and 8% blank in
   2025 is usable with that fact stated, and misleading without it.

## Privacy

Neither file may contain names, phone numbers, addresses below block level, Aadhaar or
any other national ID, hospital registration numbers, or photographs. If date of birth
is considered identifying, send `birth_year_month` (`YYYY-MM`) instead of `date_of_birth`;
we lose a little precision on paediatric BMI centiles and nothing else.

These extracts are patient-level and therefore **must not** be committed to this repository
or served from GitHub Pages, which is public. See the architecture note in
`T1D_Dashboard_Live_Architecture.md` §2: raw rows stay inside the programme's Google
workspace, and only aggregates cross into the public dashboard.

---

## What the current sheets already carry

Mapping this request onto the tabs the dashboard reads today (`T1D_Data_Claude_Sheet1_v1`):

| Request | Today | Gap |
|---|---|---|
| `patient_id` | `Claude_ID` on every patient tab | Confirm it is stable across extracts and never reused |
| Sex, age, state, facility, case status, survival | `Enrolled List` | District, block, rural/urban, and facility ID are not on the patient row |
| Date of enrolment | `Date of enrolment` | — |
| Date of diagnosis, age at diagnosis | — | **Absent.** Diabetes duration cannot be computed at all today |
| Baseline / latest HbA1c | `Hba1c_BaselineLatest` (first and latest only) | Every HbA1c *between* the first and the latest is lost |
| Initial insulin regimen | `Previous treatment regimen`, `Insulin regimen check` | Regimen at each visit, dose, and units/kg are not held per visit |
| DKA, severe hypoglycaemia | Two "last 12 months" counts on the patient row | No dates, no per-visit counts — the counts cannot be placed in time |
| Follow-up attendance | `Followup_adherence`, month-per-column Y/N/NaN | No visit dates, no scheduled-versus-attended, one visit per month at most |
| SMBG | `SMBG_Monthly`, `SMBG_HyperHypo`, month-per-column | No strip issue, no logbook-seen flag, no visit linkage |
| Height, weight, BMI | — | **Absent** |
| Complication screening | — | **Absent** |
| Counselling delivered | — | **Absent** |
| Insulin quantity issued | — | **Absent** |
| Distance to facility, travel time | — | **Absent** |
| Refill collection dates | — | **Absent** |
| Schooling status, caregiver relationship | — | **Absent** |

The follow-up dataset is the substantial change: it replaces four wide monthly grids with
one dated, visit-level table, which is what makes retention, trajectory, and
scheduled-versus-attended computable rather than approximable.
