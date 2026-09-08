# Dataset 2 — Follow-up

**Grain:** one row per patient contact. A contact is any of:

- a **scheduled follow-up visit** the patient attended;
- a **scheduled follow-up visit the patient missed** (`attended = N`, `visit_date` blank) —
  these rows are what make "scheduled versus attended" computable;
- an **unscheduled or walk-in visit**;
- a **refill collected without a consultation** (`contact_type = Refill only`);
- a **telephonic follow-up**, if the programme counts it.

**Primary key:** `visit_id`. **Foreign key:** `patient_id` → the enrolment file.
Append-only: a correction to an old visit edits that row, but a new contact never
overwrites one.

Most rows will leave most clinical columns blank — a refill-only contact has no HbA1c and
no counselling. That is expected, and it is why blank must mean *not recorded* and `NA`
*not applicable* (see rule 4 in the [README](README.md)).

`Req.` — **M** mandatory on every row, **C** conditional, **O** optional.
`Filled by · when` is our assumption, to be confirmed by the programme.

---

## 1. Visit identity

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `visit_id` | Unique identifier for this contact | text, ≤40 chars | M | DEO · at data entry | Unique across the whole file |
| `patient_id` | Links to the enrolment file | text | M | DEO · at registration desk | Must exist in the enrolment file |
| `visit_seq` | Contact number for this patient, 1 = first post-enrolment contact | integer ≥1 | O | Derived | Consecutive within patient, ordered by date |
| `scheduled_date` | Date this visit was scheduled for, as recorded at the previous visit | date | M for scheduled contacts | Clinician · at the *previous* visit | Blank for walk-ins and unscheduled contacts |
| `attended` | Whether the patient came | `Y` \| `N` | M | DEO · at the appointment date or at register review | `N` rows carry `scheduled_date` and no clinical data |
| `visit_date` | Date the patient was actually seen | date | C (if `attended = Y`) | DEO · at registration desk | Blank when `attended = N`; ≥ `enrolment_date` |
| `contact_type` | What kind of contact this was | `Scheduled follow-up` \| `Unscheduled` \| `Walk-in` \| `Refill only` \| `Telephonic` \| `Camp / outreach` \| `Admission` | M | DEO · at registration desk | — |
| `visit_facility_id` | Facility where the contact happened | text code | C (if attended) | DEO · at registration desk | May differ from the enrolling facility |
| `days_late` | Days between `scheduled_date` and `visit_date` | integer | O | Derived — we compute if absent | Negative = came early |
| `next_appointment_date` | Date the patient was told to return | date | C (if attended) | Clinician · at the end of the consultation | Should reappear as the next row's `scheduled_date` |

## 2. Glycaemic testing

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `hba1c_done` | Whether an HbA1c was done at or for this visit | `Y` \| `N` | C (if attended) | Clinician / lab · at the visit | — |
| `hba1c_pct` | HbA1c result | decimal 3.0–20.0, 1 dp | C (if `hba1c_done = Y`) | Lab · when the result is issued | The value, never a band |
| `hba1c_sample_date` | Date the **sample was taken** | date | C (if `hba1c_done = Y`) | Lab · at sample collection | May precede `visit_date`; not the entry date |
| `hba1c_result_date` | Date the result was available | date | O | Lab · when the result is issued | ≥ `hba1c_sample_date` |
| `hba1c_test_location` | Where the test was done | `In-house` \| `Referred public lab` \| `Private lab` \| `POC device` \| `Camp` | C (if `hba1c_done = Y`) | Clinician · at the visit | Distinguishes access failure from testing failure |
| `hba1c_not_done_reason` | Why no HbA1c | `Machine down` \| `Reagent stock-out` \| `Not due` \| `Patient declined` \| `Cost` \| `Referred, not returned` \| `Other` | C (if `hba1c_done = N`) | Clinician · at the visit | The single most useful field for fixing testing coverage |
| `random_blood_glucose_mgdl` | Point glucose at the visit, if taken | integer 20–800 | O | Nurse · at registration desk | — |

## 3. SMBG (self-monitoring) since the last contact

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `smbg_logbook_seen` | Whether a logbook or meter download was reviewed | `Y` \| `N` | C (if attended) | Clinician · during the consultation | Distinguishes "not monitoring" from "not shown" |
| `smbg_readings_per_day` | Mean readings per day since the last contact | decimal, 2 dp | C (if `smbg_logbook_seen = Y`) | Clinician · during the consultation | `0` = monitoring, zero readings. Blank = not reviewed |
| `smbg_days_covered` | Number of days the logbook covers | integer | O | Clinician · during the consultation | Denominator for the mean above |
| `smbg_pct_hypo` | % of readings below the hypo threshold | decimal 0–100 | O | Clinician · during the consultation | State the threshold used (mg/dL) |
| `smbg_pct_hyper` | % of readings above the hyper threshold | decimal 0–100 | O | Clinician · during the consultation | State the threshold used (mg/dL) |
| `glucometer_functional` | Whether the patient's meter is working | `Y` \| `N` \| `Not with patient` | O | Nurse · at registration desk | — |
| `strips_issued_count` | Test strips issued at this contact | integer | M for refill and follow-up contacts | Pharmacy · at the counter | `0` if none issued |
| `lancets_issued_count` | Lancets issued | integer | O | Pharmacy · at the counter | — |

## 4. Insulin: prescription and quantity issued

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `insulin_regimen` | Regimen in force after this consultation | `Premix` \| `Split-mix` \| `Basal-bolus` \| `Basal only` \| `Other` | C (if attended) | Clinician · during the consultation | Carries the transition-to-basal-bolus indicator forward from enrolment |
| `basal_type` | Basal insulin prescribed | `NPH` \| `Glargine` \| `Detemir` \| `Degludec` \| `None` \| `Other` | C | Clinician · during the consultation | — |
| `basal_units_per_day` | Basal units per day | decimal | C | Clinician · during the consultation | — |
| `bolus_type` | Bolus insulin prescribed | `Regular` \| `Lispro` \| `Aspart` \| `Glulisine` \| `None` \| `Other` | C | Clinician · during the consultation | — |
| `bolus_units_per_day` | Total bolus units per day | decimal | C | Clinician · during the consultation | — |
| `total_daily_dose_units` | Total daily dose | decimal, units/day | C (if attended) | Clinician · during the consultation | ≈ basal + bolus; 0–200 |
| `units_per_kg_per_day` | Weight-adjusted dose | decimal | O | Derived — we compute if absent | 0.1–2.0 expected |
| `delivery_device` | How insulin is given | `Vial + syringe` \| `Pen` \| `Pump` \| `Other` | C (if attended) | Clinician · during the consultation | — |
| `insulin_issued` | Whether insulin was handed over at this contact | `Y` \| `N` | M | Pharmacy · at the counter | `N` for a consultation with no dispensing |
| `insulin_issue_date` | Date insulin was collected | date | C (if `insulin_issued = Y`) | Pharmacy · at the counter | Usually `visit_date`; differs for refill-only contacts |
| `insulin_quantity_basal_units` | Basal insulin issued, in insulin units (vials × 1000 for a 10 mL 100 IU/mL vial) | integer | C (if `insulin_issued = Y`) | Pharmacy · at the counter | Units, not vials — vial size varies |
| `insulin_quantity_bolus_units` | Bolus insulin issued, in insulin units | integer | C (if `insulin_issued = Y`) | Pharmacy · at the counter | — |
| `insulin_days_supply` | Days of insulin the issue is intended to cover | integer | M (if `insulin_issued = Y`) | Pharmacy · at the counter | Drives the expected next refill date |
| `insulin_stockout` | Whether the required insulin was unavailable at this contact | `Y` \| `N` | O | Pharmacy · at the counter | Explains a short issue or a missed refill |

## 5. Anthropometry

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `height_cm` | Height at this visit | decimal, cm | C (if attended) | Nurse · at registration desk | 40–200; must not decrease materially between visits |
| `weight_kg` | Weight at this visit | decimal, kg | C (if attended) | Nurse · at registration desk | 2–150 |
| `bmi` | BMI at this visit | decimal | O | Derived — we compute if absent | — |
| `bmi_z_score` | BMI-for-age z-score (WHO), under-19s | decimal | O | Derived — we compute if absent | Say which reference is used if supplied |
| `bp_systolic_mmhg` / `bp_diastolic_mmhg` | Blood pressure | integer | O | Nurse · at registration desk | Part of complication screening for older patients |

## 6. Acute events since the last contact

Counts, with an explicit recall window so they can be placed in time rather than floating
as the current "last 12 months" columns do.

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `recall_window_start` | Start of the period these counts refer to | date | M (if any count is filled) | Derived — usually the previous `visit_date` | — |
| `dka_episodes` | DKA episodes in the window | integer 0–20 | C (if attended) | Clinician · during the consultation | `0` when asked and none; blank when not asked |
| `dka_admissions` | Of those, episodes requiring admission | integer | O | Clinician · during the consultation | ≤ `dka_episodes` |
| `dka_last_episode_date` | Date of the most recent DKA episode | date | O | Clinician · during the consultation | Within the window |
| `severe_hypo_episodes` | Severe hypoglycaemia episodes (needing third-party assistance) in the window | integer 0–20 | C (if attended) | Clinician · during the consultation | State the definition used |
| `severe_hypo_last_episode_date` | Date of the most recent severe episode | date | O | Clinician · during the consultation | — |
| `hospitalised_nights` | Nights in hospital for any diabetes cause in the window | integer | O | Clinician · during the consultation | — |

## 7. Complication screening

For each screen: whether it was done at or since the last visit, the date, and the outcome.
`NA` where the screen is not yet due by protocol — tell us the protocol (typically from
5 years' duration or age 11, annually thereafter) so "due" is computable.

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `screening_due` | Whether any annual screening was due at this visit | `Y` \| `N` | O | Derived from protocol | — |
| `fundus_done` / `fundus_date` / `fundus_result` | Retinopathy screening | `Y`\|`N`\|`NA` · date · `Normal`\|`Abnormal`\|`Pending` | C (if attended) | Clinician / referral · at the visit | A result without a date is not usable |
| `urine_acr_done` / `urine_acr_date` / `urine_acr_result` | Nephropathy (urine albumin:creatinine or protein) | as above | C | Clinician / lab · at the visit | — |
| `foot_exam_done` / `foot_exam_date` / `foot_exam_result` | Foot / neuropathy examination | as above | C | Clinician · during the consultation | — |
| `lipid_done` / `lipid_date` / `lipid_result` | Lipid profile | as above | O | Lab · at the visit | — |
| `thyroid_done` / `thyroid_date` / `thyroid_result` | TSH | as above | O | Lab · at the visit | — |
| `celiac_screen_done` / `celiac_date` / `celiac_result` | Coeliac serology | as above | O | Lab · at the visit | — |
| `injection_site_exam_done` | Lipohypertrophy / site check | `Y` \| `N` | O | Nurse · at the visit | — |
| `screening_not_done_reason` | Why a due screen was not done | `Not available at facility` \| `Referred, not returned` \| `Cost` \| `Patient declined` \| `Stock-out` \| `Other` | C | Clinician · at the visit | — |

## 8. Counselling

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `counselling_delivered` | Whether structured counselling happened at this contact | `Y` \| `N` | C (if attended) | Counsellor / nurse · during the session | — |
| `counselling_topics` | Topics covered | semicolon-separated from: `Injection technique`; `Hypoglycaemia`; `Sick-day rules`; `Diet / carbohydrate`; `Physical activity`; `SMBG technique`; `School support`; `Psychosocial`; `Adolescent transition`; `Other` | C (if `Y`) | Counsellor / nurse · during the session | One cell, semicolons, no new columns per topic |
| `counselling_duration_min` | Duration | integer, minutes | O | Counsellor / nurse · during the session | — |
| `counselling_by` | Cadre who delivered it | `Paediatrician` \| `MD Medicine` \| `Medical Officer` \| `Staff Nurse` \| `Counsellor` \| `DPC` \| `Other` | C (if `Y`) | Counsellor / nurse · during the session | — |
| `caregiver_present` | Whether the caregiver attended the session | `Y` \| `N` | O | Counsellor / nurse · during the session | — |
| `peer_support_referral` | Referred to a peer support group | `Y` \| `N` | O | Counsellor · during the session | Links to the existing `Peer support groups formed?` facility field |

## 9. Access and behaviour at this contact

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `accompanied_by_relationship` | Who came with the patient | same list as `caregiver_relationship` \| `Unaccompanied` | O | DEO · at registration desk | Detects a caregiver change over time |
| `travel_time_minutes_actual` | Time taken to reach the clinic for this visit | integer | O | DEO · at registration desk | — |
| `out_of_pocket_cost_inr` | Direct cost to the family for this visit (travel, tests, medicines) | integer, ₹ | O | DEO · at registration desk | The main measurable driver of drop-out |
| `schooling_status_current` | Schooling status as at this contact | same list as `schooling_status_at_enrolment` | O | DEO · at registration desk | Fill when it has changed; blank otherwise |
| `school_days_missed_since_last` | School days missed for diabetes reasons in the window | integer | O | DEO / clinician · at the visit | — |
| `missed_reason` | Why a scheduled visit was missed | `Distance / travel` \| `Cost` \| `Work / school` \| `Not informed` \| `Illness` \| `Moved` \| `Refused` \| `Facility closed` \| `Unknown` | C (if `attended = N`) | DPC · at follow-up call or register review | The counterpart to `hba1c_not_done_reason` for attendance |
| `traced_after_miss` | Whether the patient was contacted after missing | `Y` \| `N` | O | DPC · after the missed date | — |

## 10. Record metadata

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `recorded_by_cadre` | Who recorded the visit | text / cadre list | O | DEO · at data entry | — |
| `record_entry_date` | Date the row was entered into the system | date | M | System · at data entry | ≥ `visit_date`; the gap is the data-entry lag |
| `data_source` | Where the row came from | `Paper CRF` \| `Facility register` \| `EMR` \| `App` \| `Pharmacy log` | M | Extract process | Tells us which fields to expect blank |

---

## Cross-field checks we will run on receipt

1. `visit_id` unique; `patient_id` present in the enrolment file
2. `enrolment_date` ≤ `visit_date` ≤ extract date; nothing after `date_of_death`
3. `attended = N` ⟹ `visit_date` blank and no clinical fields filled
4. `attended = Y` ⟹ `visit_date` present
5. Each `next_appointment_date` matched by a later row's `scheduled_date` — an unmatched one
   is a scheduled visit whose outcome was never recorded, and it is the main way
   scheduled-versus-attended goes wrong
6. `total_daily_dose_units` ≈ `basal_units_per_day` + `bolus_units_per_day` (±10%)
7. `insulin_days_supply` against the interval to the next refill — a systematic shortfall
   is a supply problem, not a patient one
8. Weight and height monotonic within a patient, allowing for measurement error
9. `hba1c_sample_date` not identical to `record_entry_date` across a whole facility-month —
   that pattern means the sample date is being back-filled with the entry date
10. Two rows for the same patient on the same date — usually a duplicate entry, occasionally
    a genuine consultation plus a separate pharmacy collection
