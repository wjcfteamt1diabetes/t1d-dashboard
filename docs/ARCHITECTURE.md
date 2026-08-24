# T1D Dashboard — Architecture & Build Spec

This document is the authoritative build spec. The full detailed version is in
`T1D_Dashboard_Live_Architecture.md` at the repo root (kept out of `docs/` so it
stays accessible directly in the editor).

For the JSON data contract, indicator reference, source-sheet inventory, filtering
matrix, and phase-by-phase build plan — refer to that file or the inline comments
in `apps-script/Code.gs`.

## Quick reference

| Workbook | ID | Sheets |
|---|---|---|
| Sheet1 | `1cgMB5RIomWGSw_cQfmFkxx3qfBXlXxIL9fR4FzFuwIg` | Enrolled List, CompleteSupport_Facilities, Light_touch_facilities, Followup_adherence, SMBG_Monthly, SMBG_HyperHypo, Hba1c_BaselineLatest, Capacity_Building, Orientation_T1D signs, Targets |
| Sheet2 | `1zObGfUcDOszt82v9V65OAK7yV5McXzeusFx5XqU_d6M` | Operations_Summary, # of offs |

## Global rules (apply to every indicator)

1. Exclude `Survival Status = 'No'` from all metrics except the non-surviving KPI card
2. Patient-level metrics: Complete Support (CS) facilities only; Light Touch (LT) = enrolment counts only
3. Time-since calculations relative to current date; payload stamps `meta.generatedAt`
4. Use pre-computed sheet columns: `Enrolled for >3 months`, `In Range?`, `Basal %`, `Latest hba1c time bucket`, `Time bucket`

## Schema version: `1.1`

The dashboard hard-fails on a schema mismatch. Bump `schemaVersion` in `Code.gs` and
update the check in `index.html` (`loadData`) whenever the contract changes.

## Patient data specification

The upstream data request — what the sheets should eventually carry, as an enrolment
dataset and a follow-up dataset — is in [`data-request/`](data-request/README.md), together
with the data dictionaries, capture forms, responsibility matrix, and missingness report
template. It also maps each requested field onto the tabs the dashboard reads today and
names the gaps.
