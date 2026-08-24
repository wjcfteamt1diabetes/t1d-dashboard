# Dataset 1 — Enrolment

**Grain:** one row per patient, for every patient ever enrolled — including those since
marked inactive, transferred out, or deceased. Never delete a row; change the status
fields instead.

**Primary key:** `patient_id` (unique, no blanks, no duplicates).

`Req.` — **M** mandatory, **C** conditional (mandatory when the condition holds),
**O** optional. `Filled by · when` is our **assumption**, to be confirmed or corrected
by the programme; see [`capture-and-responsibility.md`](capture-and-responsibility.md).

---

## 1. Identity and linkage

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `patient_id` | Stable pseudonymous patient identifier. Never reused, never regenerated between extracts. | text, ≤32 chars | M | DEO · at registration, from the T1D register | Unique in file; present on every follow-up row |
| `enrolment_date` | Date the patient was enrolled into the T1D programme | date `YYYY-MM-DD` | M | DEO · at registration | ≥ `diagnosis_date`; not in the future |
| `enrolment_facility_id` | Facility that enrolled the patient | text code | M | DEO · at registration | Must match the facility list |
| `enrolment_facility_name` | Facility name as written on the register | text | M | DEO · at registration | Spelling as per facility master, not free text |
| `facility_category` | Type of facility | `Medical College` \| `District Hospital` \| `Sub-District Hospital` \| `CHC` \| `PHC` \| `Private` \| `Other` | M | DEO · at registration | — |
| `facility_support_model` | Programme support tier | `Complete Support` \| `Light Touch` | M | Programme · at facility onboarding | Light-touch patients are expected to carry enrolment fields only |
| `current_facility_id` | Facility currently following the patient, if transferred | text code | C (if transferred) | DEO · at transfer | Blank until a transfer happens |

## 2. Demographics

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `sex` | Sex as recorded | `M` \| `F` \| `Other` \| `UNK` | M | DEO · at registration | Confirm whether `Other` is in use — the dashboard currently assumes M/F only |
| `date_of_birth` | Date of birth. Send `birth_year_month` (`YYYY-MM`) instead if DOB is treated as identifying. | date `YYYY-MM-DD` | M | DEO · at registration, from an ID or immunisation card | Plausible against `age_at_enrolment_years` |
| `age_at_enrolment_years` | Age in completed years on `enrolment_date` | integer 0–99 | M | Derived — send if already computed | Consistent with DOB ± 1 |
| `age_as_of_date` | Date on which any age in this file was computed | date | M | Extract process | = extract date |
| `residence_state` | State of residence | text, programme state list | M | DEO · at registration | One of the four programme states |
| `residence_district` | District of residence | text, district master | M | DEO · at registration | Use one spelling per district across all files — `Jaipur I`/`Jaipur II` versus `Jaipur` already breaks the district count |
| `residence_block` | Block / taluka of residence | text | M | DEO · at registration | — |
| `residence_type` | Rural or urban residence | `Rural` \| `Urban` \| `Peri-urban` \| `UNK` | M | DEO · at registration | Say which definition is used (census, facility judgement, ward vs panchayat) |

## 3. Diagnosis and baseline clinical state

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `diagnosis_date` | Date of T1D diagnosis. Month precision (`YYYY-MM-01`) is acceptable for older diagnoses — flag it in `diagnosis_date_precision`. | date | M | Clinician · at first consultation, from records or recall | ≤ `enrolment_date` |
| `diagnosis_date_precision` | How exact `diagnosis_date` is | `Day` \| `Month` \| `Year` \| `Recall only` | M | Clinician · at first consultation | — |
| `age_at_diagnosis_years` | Age in completed years at diagnosis | decimal 0–99, 1 dp | M | Derived | Consistent with DOB and `diagnosis_date` |
| `diagnosed_in_dka` | Whether the patient presented in DKA at diagnosis | `Y` \| `N` \| `UNK` | O | Clinician · at first consultation | — |
| `diagnosis_facility_category` | Where the patient was diagnosed | same list as `facility_category` | O | Clinician · at first consultation | — |
| `previous_treatment_facility_category` | Where the patient was getting insulin before enrolment | `Public` \| `Private` \| `Charitable` \| `None` \| `UNK` + facility type | M | Clinician · at first consultation | Exists today as `Previous treatment facility category` |
| `previous_insulin_regimen` | Regimen in use immediately before enrolment | `Premix` \| `Split-mix` \| `Basal-bolus` \| `Basal only` \| `Other` \| `None` \| `UNK` | M | Clinician · at first consultation | Exists today as `Previous treatment regimen` |
| `initial_insulin_regimen` | Regimen prescribed **at** enrolment | `Premix` \| `Split-mix` \| `Basal-bolus` \| `Basal only` \| `Other` | M | Clinician · at first consultation | The baseline for the transition-to-basal-bolus indicator |
| `initial_basal_type` | Basal insulin prescribed at enrolment | `NPH` \| `Glargine` \| `Detemir` \| `Degludec` \| `None` \| `Other` | C (if regimen includes basal) | Clinician · at first consultation | — |
| `initial_bolus_type` | Bolus/short-acting insulin at enrolment | `Regular` \| `Lispro` \| `Aspart` \| `Glulisine` \| `None` \| `Other` | C | Clinician · at first consultation | — |
| `initial_tdd_units` | Total daily insulin dose prescribed at enrolment | decimal, units/day | M | Clinician · at first consultation | 0–200; flag >2 units/kg |
| `initial_delivery_device` | How insulin is given at enrolment | `Vial + syringe` \| `Pen` \| `Pump` \| `Other` | M | Clinician · at first consultation | — |
| `baseline_hba1c_pct` | First HbA1c at or after enrolment | decimal 3.0–20.0, 1 dp | M | Lab / clinician · at baseline testing | Send the value, not a band |
| `baseline_hba1c_date` | Date the baseline sample was **taken** | date | M | Lab · at baseline testing | Not the date it was entered; within 90 days of enrolment or explain |
| `baseline_height_cm` | Height at enrolment | decimal, cm | M | Nurse · at registration desk | 40–200 |
| `baseline_weight_kg` | Weight at enrolment | decimal, kg | M | Nurse · at registration desk | 2–150 |
| `baseline_bmi` | BMI at enrolment | decimal | O | Derived — we compute if absent | Consistent with height and weight |
| `glucometer_issued` | Whether a glucometer was issued at enrolment | `Y` \| `N` | M | Programme staff · at enrolment | — |
| `glucometer_issue_date` | Date the glucometer was issued | date | C (if `Y`) | Programme staff · at enrolment | — |

## 4. Access and household context

Collected once at enrolment. `schooling_status` and `caregiver_relationship` can change —
they are repeated in the follow-up dataset and should be updated there, not overwritten here.

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `distance_to_facility_km` | One-way distance from home to the enrolling facility | decimal, km | M | DEO · at registration, from the patient | 0–500; say whether it is reported or computed from the block centroid |
| `travel_time_minutes_typical` | Typical one-way travel time | integer, minutes | O | DEO · at registration | 0–600 |
| `travel_mode_usual` | Usual mode of travel to the clinic | `Walk` \| `Bicycle` \| `Two-wheeler` \| `Bus` \| `Shared auto` \| `Own car` \| `Train` \| `Other` | O | DEO · at registration | — |
| `schooling_status_at_enrolment` | Schooling at enrolment | `In school` \| `Dropped out` \| `Never enrolled` \| `Completed` \| `In college` \| `Working` \| `NA (pre-school age)` | M | DEO · at registration | `NA` only where age makes it inapplicable |
| `school_class_at_enrolment` | Class / grade | text | O | DEO · at registration | Blank unless `In school` |
| `dropped_out_due_to_diabetes` | Whether the drop-out is attributed to diabetes | `Y` \| `N` \| `UNK` | C (if `Dropped out`) | Clinician · at first consultation | — |
| `caregiver_relationship` | Primary caregiver's relationship to the patient | `Mother` \| `Father` \| `Both parents` \| `Grandparent` \| `Sibling` \| `Spouse` \| `Self` \| `Other relative` \| `Other` | M | DEO · at registration | `Self` expected for adults |
| `caregiver_education` | Highest education of the primary caregiver | `None` \| `Primary` \| `Secondary` \| `Higher secondary` \| `Graduate+` \| `UNK` | O | DEO · at registration | Predicts self-management support |
| `household_size` | Number of people in the household | integer 1–30 | O | DEO · at registration | — |

## 5. Programme status (updated in place)

These are the only enrolment fields that change after registration. Update the row; keep
the dates so a status change can be placed in time.

| variable | label / definition | type & permitted values | Req. | filled by · when | validation |
|---|---|---|---|---|---|
| `case_status` | Current programme status | `Active` \| `Inactive` | M | DPC / DEO · at review | Every patient has one |
| `date_marked_inactive` | Date marked inactive | date | C (if `Inactive`) | DPC / DEO · at review | ≥ `enrolment_date` |
| `reason_inactive` | Why the patient is inactive | `Lost to follow-up` \| `Transferred out` \| `Moved` \| `Refused` \| `Deceased` \| `Aged out` \| `Other` | C (if `Inactive`) | DPC / DEO · at review | Exists today as `Reason for marking inactive` |
| `survival_status` | Alive or deceased | `Yes` (alive) \| `No` (deceased) \| `UNK` | M | DPC / DEO · when notified | Deceased patients stay in the file and are excluded from clinical metrics by rule |
| `date_of_death` | Date of death | date | C (if deceased) | DPC / DEO · when notified | ≥ `enrolment_date` |
| `cause_of_death_category` | Broad cause | `DKA` \| `Hypoglycaemia` \| `Infection` \| `Other diabetes-related` \| `Non-diabetes` \| `Unknown` | O | Clinician · when notified | — |
| `date_transferred_out` | Date of transfer to another facility | date | C (if transferred) | DEO · at transfer | — |
| `last_updated_date` | When this row was last edited | date | M | Extract process | ≥ `enrolment_date` |

---

## Cross-field checks we will run on receipt

We will return a query list rather than silently correcting anything.

1. `diagnosis_date` ≤ `enrolment_date` ≤ every `visit_date` for that patient
2. `age_at_diagnosis_years` ≤ `age_at_enrolment_years`, both consistent with `date_of_birth`
3. Every `patient_id` in the follow-up file exists here (no orphan visits)
4. `survival_status = No` implies `case_status = Inactive` and a `date_of_death`
5. No follow-up rows dated after `date_of_death` or `date_transferred_out`
6. `initial_tdd_units ÷ baseline_weight_kg` within 0.1–2.0 units/kg/day
7. `baseline_hba1c_date` within 90 days of `enrolment_date`, or a reason
8. Enrolment dates that are blank or in the future — these currently drop patients off the
   dashboard's time axis (see `TREND_GAP` in `index.html`) and are reported, never backfilled
