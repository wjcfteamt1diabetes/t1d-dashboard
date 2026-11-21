# Growth monitoring methods

The growth charts read `Growth_child` and `Growth_milestones` from the programme workbook. They do not use placeholder values. Where a WHO z-score cannot be computed from the columns we have, the chart says so.

## Reference data

The LMS tables are the files published with the WHO software, copied into `who/source/`:

- WHO Child Growth Standards (2006), birth to 5 years, from the [WHO Anthro](https://github.com/worldhealthorganization/anthro) package: `bmianthro.txt`, `lenanthro.txt`, `weianthro.txt`. These are the length/height-for-age, BMI-for-age and weight-for-age tables. Age in those files is in days.
- WHO Growth Reference (2007), 5–19 years, from the [WHO AnthroPlus](https://github.com/worldhealthorganization/anthroplus) package: `bfawho2007.txt`, `hfawho2007.txt`, `wfawho2007.txt`. Age in those files is in completed months. Weight-for-age stops at 120 months.

`who/build-lms.mjs` turns those files into `who/who-lms.js`. The z-score code is `who/who-z.js`.

## Age, sex and the z-score

Sex is male = 1 and female = 2. The sheet stores age in decimal years. Age in months is `age in years × 12`. For the 2006 standards, age in days is that month value times 30.4375, rounded half up, which is the WHO Anthro day length. The sheet does not include a date of birth, so the z-score uses this age rather than an exact day count.

BMI is weight in kilograms divided by height in metres squared. Below 731 days, the stored height is treated as standing height and 0.7 cm is added so it can be compared with the WHO length standard. From 731 days the height is used as recorded.

The z-score is `((X / M) ^ L − 1) / (L × S)`. If L is 0 it is `ln(X / M) / S`. For BMI-for-age and weight-for-age, a raw z outside ±3 is replaced with the WHO restricted adjustment: the distance beyond the ±3 SD value is divided by the gap between the 2 SD and 3 SD values. Height-for-age is not adjusted that way. Results are rounded to two decimal places, as in the WHO programs.

A z-score is dropped as biologically implausible when BMI-for-age is outside ±5, height-for-age is below −6 or above +6, or weight-for-age is below −6 or above +5. The chart footnotes count those exclusions.

## Cut-offs

From 5 years (60 months) to under 19 years, BMI-for-age uses the WHO 2007 labels: severe thinness below −3, thinness from −3 up to but not including −2, normal from −2 to +1 inclusive, overweight above +1 up to +2 inclusive, obese above +2.

Under 5 years the WHO 2006 labels are used instead, on their own chart with their own n: severely wasted below −3, wasted from −3 up to but not including −2, normal from −2 to +1 inclusive, possible risk of overweight above +1 up to +2 inclusive, overweight above +2 up to +3 inclusive, obese above +3. Those labels are not mixed into the 5–19 charts.

Height-for-age below −2 is stunted and below −3 is severely stunted. Weight-for-age below −2 is underweight and below −3 is severe underweight. Weight-for-age is only calculated while age is under 121 months (10 years, the WHO AnthroPlus limit). At 121 months or older the child is counted as “WAZ not applicable (>10 y)” and is not given an extrapolated z-score.

The healthy average drawn on the trend is z = 0, the WHO median for the same age and sex.

## One child, one place in a chart

The extract has one baseline measurement and one latest measurement per child, not every visit. Baseline is that stored baseline pair. Latest is that stored latest pair. A child is counted once.

For change over time, both measurements must be valid and the gap from baseline age to latest age must be at least 3 months. Time in care is that gap, in bands that do not overlap: under 6 months, 6 up to 12, 12 up to 18, and 18 months or more. The change-in-weight chart has a control for three values: kilograms, kilograms per year (the kilogram change divided by the gap in years), and the change in weight-for-age z. The z is drawn only when both measurements are under 10 years and that bar has at least 20 children.

## Month-on-month trend

`Growth_visits_dash` has one row per growth visit: sex, age in months, weight, height, and the month bin since enrolment. The page recomputes BMI-for-age, height-for-age and weight-for-age from those columns with the same WHO code as the other growth charts. Age in months is used as given. The page does not have a date of birth, and that age can be off by several months.

A visit counts only for a child still in the filtered 2–18 cohort, with `in_scope_2_18` = 1 and a month bin of 0, 3, 6, 9, 12, 15 or 18+. BMI-for-age needs `clean_bmi` = 1 and both weight and height. Height-for-age needs `clean_haz` = 1 and a height. Weight-for-age needs a weight, neither weight-quality flag, and age under 121 months. Several eligible visits in the same bin are averaged for that child, then the point is the unweighted mean of those child values. A point is hidden below 20 children. The same minimum applies to an enrolment-quarter line.

If `Growth_visits_dash` is missing, empty, or lacks Claude_ID, sex, age, weight, height and month bin, the chart stays on the stored `Growth_milestones` means and says so.

The other growth charts still use `Growth_child` only. The page reports how often the baseline and latest z-scores recomputed there fall within 0.15 of the stored scores.

## Filters

Every growth chart uses the same children. State, division, district, facility, DPC, support, sex, age group and status restrict that list before the chart is drawn. Division and DPC come from the facility lookup on the patient, not from a column on the growth sheet. Light support has no patient-level rows, so the growth section is empty. Adults hide the section. The enrolment period, including a custom from–to range, uses `Enrolment_date` on the growth row. A child with no enrolment date is left out of a dated period. A short note is hidden when the chart’s n is under 20.

The sheet’s older change labels (Faltering, Watch, Stable, Healthy shift, Excess gain) are not WHO cut-offs. The charts no longer use those labels for the BMI-for-age display. They remain on the sheet.
