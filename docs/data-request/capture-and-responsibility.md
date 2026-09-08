# Capture forms and who fills what, when

Two things are being asked for here, and they are different:

1. **The forms themselves** — a blank copy of every register page, CRF, or EMR screen a
   requested field comes from. What is below is our *reconstruction*, offered so the
   request is concrete; a real blank copy of the form in use supersedes it entirely.
2. **The responsibility and timing** — for each field, which cadre fills it and at which
   moment. This cannot be inferred from the data, and without it a low completion rate is
   uninterpretable: a field that is 40% blank because it sits on a form the pharmacy never
   sees is a different problem from one that is 40% blank because clinicians skip it.

---

## Form A — Enrolment / registration

Filled once, when a patient is registered into the T1D programme.

| Block | Fields | Who we assume fills it | At what point |
|---|---|---|---|
| A1. Identification | `patient_id`, `enrolment_date`, facility fields | Data entry operator | Registration desk, before the consultation |
| A2. Demographics | sex, DOB, residence state/district/block, rural-urban | Data entry operator | Registration desk, from an ID or immunisation card |
| A3. Diagnosis history | `diagnosis_date` and precision, DKA at diagnosis, previous facility and regimen | Treating clinician (paediatrician / MD Medicine / MO) | First consultation, from records or caregiver recall |
| A4. Baseline clinical | height, weight, baseline HbA1c and its sample date | Staff nurse (anthropometry); lab (HbA1c) | Nurse at the desk; lab on the same day or on referral |
| A5. Baseline treatment | initial regimen, insulin types, TDD, delivery device, glucometer issued | Treating clinician; pharmacy for the glucometer | End of the first consultation |
| A6. Access and household | distance, travel time and mode, schooling, caregiver relationship and education, household size | Data entry operator or DPC | Registration desk, asked directly of the caregiver |
| A7. Status | case status, inactive date and reason, survival status, death date, transfer date | DPC with the treating clinician | Not at enrolment — updated later, at register review or when the facility is notified |

**Note on A6.** These are the fields most often dropped when the desk is busy, and they are
also the ones that explain attrition. If they are not being asked reliably today, say so —
we would rather model with a stated 30% coverage than with a silent one.

## Form B — Follow-up visit

Filled at every contact, including missed appointments and pharmacy-only collections.

| Block | Fields | Who we assume fills it | At what point |
|---|---|---|---|
| B1. Visit header | `visit_id`, `patient_id`, `scheduled_date`, `attended`, `visit_date`, `contact_type` | Data entry operator | Registration desk, on arrival |
| B2. Vitals and anthropometry | height, weight, BP, random glucose | Staff nurse | Before the consultation |
| B3. Interval history | DKA and severe hypoglycaemia counts and dates, hospitalisation, recall window | Treating clinician | During the consultation |
| B4. SMBG review | logbook seen, readings/day, days covered, % hypo and % hyper, meter functional | Treating clinician | During the consultation, from the logbook or meter |
| B5. Laboratory | HbA1c done / value / sample date / location / reason not done | Lab, transcribed by the clinician or DEO | Sample at the visit; result may arrive days later |
| B6. Treatment plan | regimen, basal and bolus type and units, TDD, device | Treating clinician | End of the consultation |
| B7. Complication screening | fundus, urine ACR, foot, lipid, TSH, coeliac — done / date / result, reason not done | Treating clinician; results from lab or referral | At the visit, or on the referral's return |
| B8. Counselling | delivered, topics, duration, by whom, caregiver present, peer support referral | Counsellor or staff nurse | After the consultation, in the counselling corner |
| B9. Dispensing | insulin issued, issue date, quantities in units, days supply, strips, lancets, stock-out | Pharmacist / pharmacy counter | At the pharmacy counter, after the consultation |
| B10. Access and behaviour | accompanied by, travel time, out-of-pocket cost, schooling now, school days missed | Data entry operator | Registration desk or exit |
| B11. Missed visit | `missed_reason`, `traced_after_miss` | DPC | On the follow-up call, or at the end-of-month register review |
| B12. Record metadata | recorded by, entry date, source | System or DEO | At data entry |

**The two structural problems this form has to solve**

- **B9 happens at a different counter from B3–B8.** If the pharmacy log is a separate
  register that is never joined back to the visit, `insulin_quantity_*` and
  `insulin_days_supply` will arrive systematically blank while the clinical fields are
  complete. Tell us whether the pharmacy entry carries the `patient_id`; if it does not,
  that is the single highest-value fix in the whole request.
- **B1 with `attended = N` is nobody's job by default.** A patient who does not come is not
  in front of anyone, so no one opens a form. Whoever holds the appointment register —
  usually the DPC at month-end review — has to generate that row. Without it the
  attendance denominator is only the patients who showed up, and adherence looks perfect.

---

## What we need back, per field

For each variable in the two dictionaries, confirm or correct:

| Question | Why it matters |
|---|---|
| Which form or register page is it on? | Tells us whether an absent field is a form gap or a filling gap |
| Which cadre fills it? | A field owned by an over-stretched cadre degrades predictably |
| At what point in the visit? | Fields captured after the patient leaves (lab results, referral outcomes) need a return path, and usually don't have one |
| Is it captured on paper, then keyed in? | Introduces the `record_entry_date` − `visit_date` lag and a transcription loss |
| When was the field added to the form? | A field added in 2025 is not "missing" for 2024 — it did not exist. See the form-version history below |
| Is it ever filled retrospectively? | Retrospective filling produces the back-filled-date pattern we check for |

## Form-version history

Please send this alongside, in any format. It is short and it prevents us from reporting a
form change as a data-quality collapse.

| Form | Version | In use from | In use to | What changed |
|---|---|---|---|---|
| A — Enrolment | | | | |
| B — Follow-up | | | | |
