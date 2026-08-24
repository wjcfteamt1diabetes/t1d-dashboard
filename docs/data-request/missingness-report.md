# Missingness by variable and year

We need to know how complete each variable is before we put it on a dashboard. A variable
that is 70% blank can still be shown — with the coverage stated next to it. A variable that
is 70% blank and shown as if it were complete is a wrong number with a chart around it.

Send one row per **dataset × variable × year**, using
[`templates/missingness_report_template.csv`](templates/missingness_report_template.csv).

| column | meaning |
|---|---|
| `dataset` | `enrolment` or `followup` |
| `variable` | Exactly as in the dictionary |
| `year` | Calendar year. Enrolment: year of `enrolment_date`. Follow-up: year of `visit_date`, or of `scheduled_date` for missed visits |
| `n_rows_eligible` | Rows where this variable **should** have a value — see eligibility below |
| `n_non_missing` | Rows with a real recorded value |
| `n_blank` | Rows with an empty cell |
| `n_na_not_applicable` | Rows coded `NA` because the field cannot apply |
| `n_unknown_coded` | Rows coded `UNK` — recorded as "asked, not known", which is not the same as blank |
| `pct_missing` | `n_blank ÷ n_rows_eligible × 100`, 1 dp |
| `eligibility_rule` | Plain text: what makes a row eligible |
| `notes` | Anything that explains the number — a form change, a facility that joined late, a stock-out |

## Eligibility is the part that matters

`pct_missing` is only meaningful against the right denominator. Three examples:

- `hba1c_pct` — eligible only where `hba1c_done = Y`. Rows where the test was not done are
  not missing data; they are a testing-coverage finding, and belong to `hba1c_done`.
- `date_marked_inactive` — eligible only where `case_status = Inactive`.
- `insulin_quantity_basal_units` — eligible only where `insulin_issued = Y` **and** the
  regimen includes a basal insulin.

If a rule is awkward to implement, send the simple denominator and say so in
`eligibility_rule`. A stated approximation is fine; an unstated one is not.

## The distinction that must not be collapsed

| Situation | How it should appear | Why it is different |
|---|---|---|
| Field existed, should have been filled, was not | blank → `n_blank` | A data-quality problem |
| Field cannot apply to this row | `NA` → `n_na_not_applicable` | Not a problem at all |
| Asked, genuinely not known | `UNK` → `n_unknown_coded` | A recall or records problem |
| Field was not on the form that year | Exclude from `n_rows_eligible`, and say so in `notes` | Not missing — it did not exist. Reporting it as missing invents a decline in data quality |

## Worked example

```csv
dataset,variable,year,n_rows_eligible,n_non_missing,n_blank,n_na_not_applicable,n_unknown_coded,pct_missing,eligibility_rule,notes
enrolment,diagnosis_date,2024,412,331,74,0,7,18.0,All enrolled that year,Recall-based for pre-2020 diagnoses
enrolment,diagnosis_date,2025,689,651,31,0,7,4.5,All enrolled that year,Field made compulsory on the form in Mar 2025
followup,hba1c_pct,2025,1204,1198,6,0,0,0.5,Rows with hba1c_done = Y,
followup,hba1c_done,2025,3980,3402,578,0,0,14.5,All attended visits,Two facilities had analyser downtime Jul-Sep
followup,insulin_days_supply,2025,3115,904,2211,0,0,71.0,Rows with insulin_issued = Y,Pharmacy register is not linked to the visit record
```

That last row is the kind of finding this report exists to surface. It is not a reason to
withhold the data — it is the reason to send it.

## Two optional extras, if they are cheap to produce

- **By facility as well as by year.** A variable that is complete in 30 facilities and empty
  in 8 needs a different fix from one that is uniformly 20% blank, and the dashboard can say
  which facilities to chase.
- **Data-entry lag.** Median and 90th-percentile days between `visit_date` and
  `record_entry_date`, by facility and year. It tells us how stale the most recent month
  always is, so the dashboard can mark it provisional instead of drawing it as a collapse.

We can compute this report ourselves from the two extracts if that is easier — but only the
programme can supply `eligibility_rule` where it depends on practice, and the form-version
history in [`capture-and-responsibility.md`](capture-and-responsibility.md).
